'use strict';

const db = require('../db');
const auth = require('../auth');
const config = require('../config');
const audit = require('./audit.service');
const http = require('../utils/http');
const mask = require('../utils/mask');
const money = require('../utils/money');
const validate = require('../utils/validate');
const { ApiError } = require('../middleware/errors');

const STATUS_LABELS = { 1: '正常', 2: '已停用', 3: '已注销' };

function actor(ctx, ip) {
  return { adminId: ctx.adminId, adminLabel: ctx.admin.displayName || ctx.admin.username, ip };
}
function userLabel(row) { return `${row.uid} / ${mask.phone(row.phone) || mask.email(row.email) || '无联系方式'}`; }
function mapUser(row) {
  return {
    id: Number(row.id), uid: row.uid, displayName: row.display_name || '未设置昵称',
    phone: mask.phone(row.phone), email: mask.email(row.email), avatarUrl: row.avatar_url,
    status: Number(row.status), statusLabel: STATUS_LABELS[Number(row.status)] || '未知',
    loginFailCount: Number(row.login_fail_count || 0), lockedUntil: row.locked_until,
    isLocked: !!row.locked_until && String(row.locked_until) > new Date(Date.now() + 8 * 3600000).toISOString().slice(0,19).replace('T',' '),
    tokenVersion: Number(row.token_version || 0), lastLoginAt: row.last_login_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function ensureUser(id) {
  const row = await db.queryOne(`SELECT id,uid,phone,email,display_name,avatar_url,status,login_fail_count,
    locked_until,token_version,last_login_at,created_at,updated_at FROM user WHERE id=?`, [Number(id)]);
  if (!row) throw ApiError.notFound('用户不存在', 'USER_NOT_FOUND');
  return row;
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [20, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  const where = ['1=1']; const params = [];
  const q = String(query.q || '').trim();
  if (q) {
    const field = query.field || (q.includes('@') ? 'email' : /^\d{6,20}$/.test(q) ? 'phone' : q.includes('-') ? 'uid' : 'nickname');
    if (field === 'phone') { where.push('u.phone = ?'); params.push(q); }
    else if (field === 'email') { where.push('u.email = ?'); params.push(q.toLowerCase()); }
    else if (field === 'uid') { where.push('u.uid = ?'); params.push(q); }
    else { where.push('u.display_name LIKE ?'); params.push(`%${q}%`); }
  }
  if ([1,2,3].includes(Number(query.status))) { where.push('u.status = ?'); params.push(Number(query.status)); }
  if (query.registeredFrom) { where.push('u.created_at >= ?'); params.push(`${query.registeredFrom} 00:00:00`); }
  if (query.registeredTo) { where.push('u.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${query.registeredTo} 00:00:00`); }
  if (query.lastLogin === 'never') where.push('u.last_login_at IS NULL');
  if (query.lastLoginFrom) { where.push('u.last_login_at >= ?'); params.push(`${query.lastLoginFrom} 00:00:00`); }
  if (query.lastLoginTo) { where.push('u.last_login_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${query.lastLoginTo} 00:00:00`); }
  if (String(query.hasBudget) === '1') where.push('EXISTS (SELECT 1 FROM ledger l JOIN budget b ON b.ledger_id=l.id WHERE l.owner_id=u.id)');
  if (String(query.hasBudget) === '0') where.push('NOT EXISTS (SELECT 1 FROM ledger l JOIN budget b ON b.ledger_id=l.id WHERE l.owner_id=u.id)');
  if (query.abnormal === 'locked') where.push('u.locked_until > NOW()');
  if (query.abnormal === 'failed') where.push('u.login_fail_count >= 3');
  const sorts = { created_desc: 'u.created_at DESC', created_asc: 'u.created_at ASC', login_desc: 'u.last_login_at DESC', login_asc: 'u.last_login_at ASC' };
  const order = sorts[query.sort] || sorts.created_desc;
  const clause = where.join(' AND ');
  const total = Number(await db.queryValue(`SELECT COUNT(*) FROM user u WHERE ${clause}`, params));
  const rows = await db.query(`SELECT u.id,u.uid,u.phone,u.email,u.display_name,u.avatar_url,u.status,
      u.login_fail_count,u.locked_until,u.token_version,u.last_login_at,u.created_at,u.updated_at,
      (SELECT COUNT(*) FROM ledger l WHERE l.owner_id=u.id AND l.is_archived=0) AS ledger_count,
      EXISTS(SELECT 1 FROM ledger l JOIN budget b ON b.ledger_id=l.id WHERE l.owner_id=u.id) AS has_budget,
      (SELECT COUNT(*) FROM ledger l JOIN transaction t ON t.ledger_id=l.id WHERE l.owner_id=u.id AND t.is_deleted=0) AS txn_count
    FROM user u WHERE ${clause} ORDER BY ${order}, u.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]);
  return {
    items: rows.map((r) => ({ ...mapUser(r), ledgerCount: Number(r.ledger_count), hasBudget: !!r.has_budget, txnCount: Number(r.txn_count) })),
    meta: http.pageMeta({ page, pageSize, total }),
  };
}

async function detail(id) {
  const row = await ensureUser(id);
  const [summary, ledgers, budgetMonths, history] = await Promise.all([
    db.queryOne(`SELECT
      (SELECT COUNT(*) FROM ledger WHERE owner_id=?) AS ledgers,
      (SELECT COUNT(*) FROM account a JOIN ledger l ON l.id=a.ledger_id WHERE l.owner_id=?) AS accounts,
      (SELECT COUNT(*) FROM category c JOIN ledger l ON l.id=c.ledger_id WHERE l.owner_id=?) AS categories,
      (SELECT COUNT(*) FROM transaction t JOIN ledger l ON l.id=t.ledger_id WHERE l.owner_id=?) AS transactions,
      (SELECT MIN(t.happened_at) FROM transaction t JOIN ledger l ON l.id=t.ledger_id WHERE l.owner_id=?) AS first_txn,
      (SELECT MAX(t.happened_at) FROM transaction t JOIN ledger l ON l.id=t.ledger_id WHERE l.owner_id=?) AS last_txn`,
      [id,id,id,id,id,id]),
    db.query('SELECT id,name,type,currency,is_default,is_archived,created_at FROM ledger WHERE owner_id=? ORDER BY is_default DESC,id', [id]),
    db.query(`SELECT b.period_value FROM budget b JOIN ledger l ON l.id=b.ledger_id
      WHERE l.owner_id=? GROUP BY b.period_value ORDER BY b.period_value DESC`, [id]),
    db.query(`SELECT id,admin_label,action,target_label,reason,created_at FROM admin_audit_log
      WHERE target_type='user' AND target_id=? ORDER BY created_at DESC LIMIT 20`, [String(id)]),
  ]);
  return {
    user: mapUser(row),
    security: { loginFailCount: Number(row.login_fail_count), lockedUntil: row.locked_until, tokenVersion: Number(row.token_version), lastLoginAt: row.last_login_at },
    summary: { ledgerCount: Number(summary.ledgers), accountCount: Number(summary.accounts), categoryCount: Number(summary.categories),
      transactionCount: Number(summary.transactions), firstTransactionAt: summary.first_txn, lastTransactionAt: summary.last_txn,
      budgetMonths: budgetMonths.map((x) => x.period_value) },
    ledgers: ledgers.map((x) => ({ ...x, id: Number(x.id), isDefault: !!x.is_default, isArchived: !!x.is_archived })),
    history: history.map((x) => ({ id:Number(x.id), adminLabel:x.admin_label, action:x.action, reason:x.reason, createdAt:x.created_at })),
  };
}

async function data(id, tab, query, ctx, ip) {
  const row = await ensureUser(id);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [20,50,100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  let items; let total;
  if (tab === 'accounts') {
    items = await db.query(`SELECT v.*,l.name AS ledger_name FROM v_account_balance v JOIN ledger l ON l.id=v.ledger_id
      WHERE l.owner_id=? ORDER BY l.id,v.sort_order,v.account_id`, [id]);
    items = items.map((x) => ({ ...x, account_id:Number(x.account_id), initial_balance:money.toNumber(x.initial_balance), balance:money.toNumber(x.balance),
      credit_limit:x.credit_limit==null?null:money.toNumber(x.credit_limit), bill_due:x.bill_due==null?null:money.toNumber(x.bill_due),
      credit_used:x.credit_used==null?null:money.toNumber(x.credit_used), credit_available:x.credit_available==null?null:money.toNumber(x.credit_available) }));
    total = items.length;
  } else if (tab === 'categories') {
    items = await db.query(`SELECT c.*,l.name AS ledger_name FROM category c JOIN ledger l ON l.id=c.ledger_id
      WHERE l.owner_id=? ORDER BY c.type,c.sort_order,c.id`, [id]); total = items.length;
  } else if (tab === 'budgets') {
    items = await db.query(`SELECT p.*,l.name AS ledger_name FROM v_budget_progress p JOIN ledger l ON l.id=p.ledger_id
      WHERE l.owner_id=? ORDER BY p.period_value DESC`, [id]);
    items = items.map((x) => ({ ...x, budget_id:Number(x.budget_id), total_amount:money.toNumber(x.total_amount), spent:money.toNumber(x.spent), remaining:money.toNumber(x.remaining), used_pct:Number(x.used_pct||0) })); total=items.length;
  } else if (tab === 'imports') {
    total = Number(await db.queryValue(`SELECT COUNT(*) FROM import_batch b JOIN ledger l ON l.id=b.ledger_id WHERE l.owner_id=?`, [id]));
    items = await db.query(`SELECT b.*,l.name AS ledger_name FROM import_batch b JOIN ledger l ON l.id=b.ledger_id
      WHERE l.owner_id=? ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, [id,pageSize,(page-1)*pageSize]);
  } else if (tab === 'transactions') {
    const deleted = String(query.includeDeleted)==='1' ? '' : 'AND t.is_deleted=0';
    total = Number(await db.queryValue(`SELECT COUNT(*) FROM transaction t JOIN ledger l ON l.id=t.ledger_id WHERE l.owner_id=? ${deleted}`, [id]));
    items = await db.query(`SELECT t.id,t.type,t.amount,t.happened_at,t.note,t.merchant,t.source,t.is_deleted,t.deleted_at,
      l.name AS ledger_name,c.name AS category_name,a.name AS account_name,ta.name AS to_account_name
      FROM transaction t JOIN ledger l ON l.id=t.ledger_id LEFT JOIN category c ON c.id=t.category_id
      JOIN account a ON a.id=t.account_id LEFT JOIN account ta ON ta.id=t.to_account_id
      WHERE l.owner_id=? ${deleted} ORDER BY t.happened_at DESC,t.id DESC LIMIT ? OFFSET ?`, [id,pageSize,(page-1)*pageSize]);
    items = items.map((x) => ({ ...x, id:Number(x.id), amount:money.toNumber(x.amount), is_deleted:!!x.is_deleted }));
    await audit.append({ ...actor(ctx,ip), action:'user.data.view', targetType:'user', targetId:id,
      targetLabel:userLabel(row), reason:'查看用户流水明细', after:{ page,pageSize,includeDeleted:String(query.includeDeleted)==='1' } });
  } else throw ApiError.badRequest('未知的数据类型', 'INVALID_DATA_TAB');
  return { items, meta:http.pageMeta({ page,pageSize,total }) };
}

async function action(id, actionName, body, ctx, ip) {
  const reason = validate.reason(body.reason);
  const before = await ensureUser(id);
  const actions = {
    unlock: { sql:'UPDATE user SET login_fail_count=0,locked_until=NULL WHERE id=?', action:'user.unlock' },
    logout: { sql:'UPDATE user SET token_version=token_version+1 WHERE id=?', action:'user.logout_all' },
    disable: { sql:'UPDATE user SET status=2,token_version=token_version+1 WHERE id=?', action:'user.disable' },
    enable: { sql:'UPDATE user SET status=1 WHERE id=?', action:'user.enable' },
    cancel: { sql:'UPDATE user SET status=3,token_version=token_version+1 WHERE id=?', action:'user.cancel' },
  };
  if (actionName === 'cancel') validate.confirmPhrase(body.confirmText, before.uid, '用户 UID');
  let tempPassword = null; let spec = actions[actionName]; let passwordHash = null;
  if (actionName === 'reset-password') {
    if (!config.resetPassword.devMode) throw ApiError.notImplemented('生产环境请由用户通过短信或邮件自助重置密码', 'PASSWORD_DELIVERY_UNAVAILABLE');
    tempPassword = auth.generateTempPassword(); passwordHash = await auth.hashPassword(tempPassword);
    spec = { sql:'UPDATE user SET password_hash=?,token_version=token_version+1,login_fail_count=0,locked_until=NULL WHERE id=?', action:'user.reset_password' };
  }
  if (!spec) throw ApiError.badRequest('未知处置动作', 'INVALID_USER_ACTION');
  await db.transaction(async (conn) => {
    await conn.query(spec.sql, passwordHash ? [passwordHash,id] : [id]);
    const [afterRows] = await conn.query('SELECT id,uid,status,login_fail_count,locked_until,token_version FROM user WHERE id=?', [id]);
    await audit.append({ ...actor(ctx,ip), action:spec.action,targetType:'user',targetId:id,targetLabel:userLabel(before),reason,
      before:{ status:Number(before.status),loginFailCount:Number(before.login_fail_count),lockedUntil:before.locked_until,tokenVersion:Number(before.token_version) },
      after:afterRows[0] }, conn);
  });
  const updated = await ensureUser(id);
  return { user:mapUser(updated), ...(tempPassword ? { temporaryPassword:tempPassword } : {}) };
}

async function exportUser(id, format, reasonInput, ctx, ip) {
  const reason = validate.reason(reasonInput);
  const user = await ensureUser(id);
  const ledgers = await db.query('SELECT * FROM ledger WHERE owner_id=? ORDER BY id', [id]);
  const ledgerIds = ledgers.map((x) => Number(x.id));
  if (!ledgerIds.length) throw ApiError.notFound('该用户没有账本数据', 'LEDGER_NOT_FOUND');
  const placeholders = ledgerIds.map(()=>'?').join(',');
  const [accounts,categories,budgets,transactions,imports] = await Promise.all([
    db.query(`SELECT * FROM account WHERE ledger_id IN (${placeholders}) ORDER BY ledger_id,id`,ledgerIds),
    db.query(`SELECT * FROM category WHERE ledger_id IN (${placeholders}) ORDER BY ledger_id,type,id`,ledgerIds),
    db.query(`SELECT * FROM budget WHERE ledger_id IN (${placeholders}) ORDER BY ledger_id,period_value`,ledgerIds),
    db.query(`SELECT * FROM transaction WHERE ledger_id IN (${placeholders}) ORDER BY happened_at,id`,ledgerIds),
    db.query(`SELECT * FROM import_batch WHERE ledger_id IN (${placeholders}) ORDER BY created_at,id`,ledgerIds),
  ]);
  await audit.append({ ...actor(ctx,ip),action:`user.data.export.${format}`,targetType:'user',targetId:id,targetLabel:userLabel(user),reason,
    after:{ format,ledgerCount:ledgers.length,transactionCount:transactions.length } });
  if (format === 'csv') {
    const cell=(v)=>`"${String(v??'').replace(/"/g,'""')}"`;
    const lines=[['ID','类型','金额','发生时间','备注','商户','来源','已删除'].map(cell).join(',')];
    transactions.forEach((t)=>lines.push([t.id,t.type,t.amount,t.happened_at,t.note,t.merchant,t.source,t.is_deleted].map(cell).join(',')));
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }
  return { format:'mingzhang-admin-user-export',version:1,exportedAt:new Date().toISOString(),
    user:{ ...mapUser(user), phone:mask.phone(user.phone),email:mask.email(user.email) },ledgers,
    data:{ accounts,categories,budgets,transactions,importBatches:imports } };
}

module.exports = { list, detail, data, action, exportUser };
