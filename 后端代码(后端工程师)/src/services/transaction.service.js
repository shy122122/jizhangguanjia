'use strict';

/**
 * 交易流水。全项目最核心、也最容易出错的一张表。
 *
 * 三条必须守住的规则：
 *
 *  1. **每一条 SQL 都带 ledger_id**。分类/账户是账本级的，如果不校验
 *     「传进来的 account_id 属不属于我」，A 用户就能把账记到 B 用户的账户上 ——
 *     PRD 第 11 章把「越权查看他人账本」列为高危风险，这里是最直接的入口。
 *     所以 create/update 里对外键的校验不是「顺手做的健壮性」，是安全边界。
 *
 *  2. **不做物理删除**。删流水 = 置 is_deleted = 1，撤销 = 置回 0。
 *     外键是 RESTRICT，就算想删也删不掉（见 fk_txn_category 的注释）。
 *
 *  3. **金额恒为正数**，方向由 type 表达。负数会在 DECIMAL UNSIGNED 那层
 *     直接报 ERROR 1264，错误信息很难懂，所以在 validate 层就挡掉。
 *
 * 另外，转账是**单条记录 + to_account_id**，不是两条镜像记录 ——
 * 这一点贯穿列表、统计、余额全部逻辑。
 */

const db = require('../db');
const money = require('../utils/money');
const validate = require('../utils/validate');
const period = require('../utils/period');
const { ApiError } = require('../middleware/errors');

const TXN_TYPES = ['expense', 'income', 'transfer'];
const NOTE_MAX = 100;
const MERCHANT_MAX = 100;

/** LIKE 的通配符转义。用户搜「100%」时不该变成「匹配任意串」。 */
function likePattern(text) {
  return `%${String(text).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** 查询串里的可选参数：空串和空白等同于「没传」。 */
function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

/** 'YYYY-MM-DD' 的次日。用于把「含当天」的区间转成左闭右开的 SQL 条件。 */
function nextDay(dateOnly) {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 统一行 → 前端契约。列表与详情共用，避免两处字段名漂移。 */
function mapTransaction(row) {
  return {
    id: Number(row.id),
    type: row.type,
    amount: money.toNumber(row.amount),
    category: row.category_id
      ? {
          id: Number(row.category_id),
          name: row.category_name,
          icon: row.category_icon,
          color: row.category_color,
        }
      : null,
    account: {
      id: Number(row.account_id),
      name: row.account_name,
      type: row.account_type,
      icon: row.account_icon,
      color: row.account_color,
    },
    // 仅转账有值：转入账户
    toAccount: row.to_account_id
      ? { id: Number(row.to_account_id), name: row.to_account_name }
      : null,
    happenedAt: row.happened_at,
    note: row.note,
    merchant: row.merchant,
    source: row.source,
    importBatchId: row.import_batch_id == null ? null : Number(row.import_batch_id),
    isDeleted: Number(row.is_deleted) === 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  t.id, t.type, t.amount, t.category_id, t.account_id, t.to_account_id,
  t.happened_at, t.note, t.merchant, t.source, t.import_batch_id,
  t.is_deleted, t.deleted_at, t.created_at, t.updated_at,
  c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
  a.name AS account_name, a.type AS account_type, a.icon AS account_icon, a.color AS account_color,
  ta.name AS to_account_name`;

const FROM_JOINS = `
  FROM \`transaction\` t
  LEFT JOIN \`category\` c  ON c.id  = t.category_id
  LEFT JOIN \`account\`  a  ON a.id  = t.account_id
  LEFT JOIN \`account\`  ta ON ta.id = t.to_account_id`;

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

async function list(ledgerId, query = {}) {
  const { page, pageSize, offset } = validate.pagination(query);

  const where = ['t.ledger_id = ?'];
  const params = [ledgerId];

  // 默认只看未删除的。撤销过的流水只在「回收站」场景才要。
  const includeDeleted =
    validate.boolOf(query.includeDeleted, 'includeDeleted', { required: false, fallback: 0 }) === 1;
  if (!includeDeleted) where.push('t.is_deleted = 0');

  if (query.period) {
    const range = period.periodRange(query.period);
    where.push('t.happened_at >= ? AND t.happened_at < ?');
    params.push(range.start, range.end);
  } else {
    if (query.from) {
      where.push('t.happened_at >= ?');
      params.push(`${period.toDateOnly(query.from)} 00:00:00`);
    }
    if (query.to) {
      // 用户说的「到 9 月 24 日」包含 24 号当天，所以上界取次日零点（开区间）。
      where.push('t.happened_at < ?');
      params.push(`${nextDay(period.toDateOnly(query.to))} 00:00:00`);
    }
  }

  const type = validate.enumOf(query.type, '类型', TXN_TYPES, { required: false });
  if (type) {
    where.push('t.type = ?');
    params.push(type);
  }

  if (query.categoryId) {
    where.push('t.category_id = ?');
    params.push(validate.idOf(query.categoryId, '分类'));
  }

  if (query.accountId) {
    // 转账的「转入」也算这个账户的流水，否则按账户筛选时转账会只出现一半。
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    const accountId = validate.idOf(query.accountId, '账户');
    params.push(accountId, accountId);
  }

  if (query.keyword && String(query.keyword).trim()) {
    where.push('(t.note LIKE ? OR t.merchant LIKE ?)');
    const pattern = likePattern(String(query.keyword).trim());
    params.push(pattern, pattern);
  }

  // 金额区间。比较的是绝对值（amount 恒正，方向由 type 表达），
  // 所以转账也一并参与筛选 —— 与列表页「金额」筛选器的口径一致。
  if (hasValue(query.minAmount)) {
    where.push('t.amount >= ?');
    params.push(validate.nonNegativeAmountOf(query.minAmount, '最小金额'));
  }
  if (hasValue(query.maxAmount)) {
    where.push('t.amount <= ?');
    params.push(validate.nonNegativeAmountOf(query.maxAmount, '最大金额'));
  }

  const whereSql = where.join(' AND ');

  const total = Number(
    await db.queryValue(
      `SELECT COUNT(*) ${FROM_JOINS} WHERE ${whereSql}`,
      params
    )
  );

  const rows = await db.query(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_JOINS}
     WHERE ${whereSql}
     ORDER BY t.happened_at DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map(mapTransaction),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function getById(ledgerId, id) {
  const row = await db.queryOne(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE t.id = ? AND t.ledger_id = ?`,
    [id, ledgerId]
  );
  if (!row) throw ApiError.notFound('流水不存在', 'TRANSACTION_NOT_FOUND');
  return mapTransaction(row);
}

/** 首页「最近 N 条」。独立于 list()，省掉一次 COUNT 查询。 */
async function recent(ledgerId, limit = 5) {
  const size = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const rows = await db.query(
    `SELECT ${SELECT_COLUMNS}
     ${FROM_JOINS}
     WHERE t.ledger_id = ? AND t.is_deleted = 0
     ORDER BY t.happened_at DESC, t.id DESC
     LIMIT ?`,
    [ledgerId, size]
  );
  return rows.map(mapTransaction);
}

/** [视图] v_monthly_summary —— 月度收支概览。没有流水时返回全 0，不是 404。 */
async function summary(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);
  const row = await db.queryOne(
    `SELECT period_value, income_total, expense_total, net,
            income_count, expense_count, transfer_count
       FROM \`v_monthly_summary\`
      WHERE ledger_id = ? AND period_value = ?`,
    [ledgerId, p]
  );

  return {
    period: p,
    incomeTotal: money.toNumber(row?.income_total ?? 0),
    expenseTotal: money.toNumber(row?.expense_total ?? 0),
    net: money.toNumber(row?.net ?? 0),
    incomeCount: Number(row?.income_count ?? 0),
    expenseCount: Number(row?.expense_count ?? 0),
    transferCount: Number(row?.transfer_count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

/**
 * 分类/账户的归属校验 —— 这是多租户隔离最关键的一道闸。
 *
 * 只在「数据库外键」那一层是不够的：外键只保证 account_id 在 account 表里
 * 存在，不保证它属于**当前账本**。少了这一步，构造一个别的账本的
 * account_id 就能把流水插进别人的账本。
 */
async function assertAccount(ledgerId, accountId, field, conn) {
  const run = conn ? (sql, p) => conn.query(sql, p).then(([rows]) => rows) : db.query;
  const rows = await run(
    'SELECT id, name, type, is_archived FROM `account` WHERE id = ? AND ledger_id = ?',
    [accountId, ledgerId]
  );
  if (rows.length === 0) {
    throw ApiError.badRequest(`${field}不存在或不属于当前账本`, 'INVALID_REFERENCE', { field });
  }
  if (Number(rows[0].is_archived) === 1) {
    throw ApiError.badRequest(`${field}「${rows[0].name}」已归档，不能记新流水`, 'ACCOUNT_ARCHIVED', {
      field,
    });
  }
  return rows[0];
}

async function assertCategory(ledgerId, categoryId, txnType, conn) {
  const runOne = conn
    ? (sql, params) => conn.query(sql, params).then(([rows]) => rows[0] || null)
    : db.queryOne;
  const row = await runOne(
    'SELECT id, name, type, is_archived FROM `category` WHERE id = ? AND ledger_id = ?',
    [categoryId, ledgerId]
  );
  if (!row) {
    throw ApiError.badRequest('分类不存在或不属于当前账本', 'INVALID_REFERENCE', { field: 'categoryId' });
  }
  if (Number(row.is_archived) === 1) {
    throw ApiError.badRequest(`分类「${row.name}」已归档，不能记账`, 'CATEGORY_ARCHIVED', {
      field: 'categoryId',
    });
  }
  // 支出必须选支出分类，收入必须选收入分类。选反了统计会串味 ——
  // 一笔「工资」记进「餐饮美食」，分类饼图立刻失真。
  if (row.type !== txnType) {
    throw ApiError.badRequest(
      `分类「${row.name}」属于${row.type === 'expense' ? '支出' : '收入'}，与当前类型不符`,
      'CATEGORY_TYPE_MISMATCH',
      { field: 'categoryId' }
    );
  }
  return row;
}

/**
 * 把「新增」和「编辑」共用的字段解析集中到一处。
 * 编辑时传入 base（库里的现有值），只解析请求里真的给了的字段 ——
 * 这样 PATCH 的语义就是「没传的保持不变」，而不是「没传的清空」。
 *
 * 注意这里用 `'x' in body` 而不是 `body.x != null` 判断「有没有传」：
 * 前端要清空备注时会传 note: ''，用 != null 会把清空误判成没传。
 */
function parsePayload(body, base = null) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const type = has('type')
    ? validate.enumOf(body.type, '类型', TXN_TYPES)
    : base?.type ?? 'expense';

  const amount = has('amount') ? validate.amountOf(body.amount) : base?.amount;
  if (amount == null) throw ApiError.badRequest('金额不能为空', 'MISSING_FIELD', { field: 'amount' });

  const happenedAt = has('happenedAt')
    ? period.toDateTime(body.happenedAt)
    : base?.happenedAt ?? period.nowDateTime();

  const note = has('note')
    ? validate.optionalStr(body.note, '备注', { max: NOTE_MAX })
    : base?.note ?? null;

  const merchant = has('merchant')
    ? validate.optionalStr(body.merchant, '商户', { max: MERCHANT_MAX })
    : base?.merchant ?? null;

  const accountId = has('accountId')
    ? validate.idOf(body.accountId, '账户')
    : base?.accountId ?? null;
  if (accountId == null) {
    throw ApiError.badRequest('账户不能为空', 'MISSING_FIELD', { field: 'accountId' });
  }

  // 转账：必须有转入账户，且不能和转出账户相同（对应 ck_txn_transfer）。
  // 非转账：转入账户必须为空，分类必须有（对应 ck_txn_category）。
  let toAccountId = null;
  let categoryId = null;

  if (type === 'transfer') {
    const raw = has('toAccountId') ? body.toAccountId : base?.toAccountId;
    if (raw == null || raw === '') {
      throw ApiError.badRequest('转账必须选择转入账户', 'MISSING_FIELD', { field: 'toAccountId' });
    }
    toAccountId = validate.idOf(raw, '转入账户');
    if (toAccountId === accountId) {
      throw ApiError.badRequest('转入账户不能与转出账户相同', 'INVALID_TRANSFER');
    }
  } else {
    if (has('toAccountId') && body.toAccountId != null && body.toAccountId !== '') {
      throw ApiError.badRequest('只有转账才能填转入账户', 'INVALID_TRANSFER');
    }
    const raw = has('categoryId') ? body.categoryId : base?.categoryId;
    if (raw == null || raw === '') {
      throw ApiError.badRequest('请选择分类', 'MISSING_FIELD', { field: 'categoryId' });
    }
    categoryId = validate.idOf(raw, '分类');
  }

  return { type, amount, happenedAt, note, merchant, accountId, toAccountId, categoryId };
}

// ---------------------------------------------------------------------------
// 预算穿透（PRD 4.2.2）
//
// 记账完成后立刻告诉用户「这笔花完，今日可花变成多少」。
// 文案在服务端拼，前端只负责展示 —— 这样 Web 和将来的小程序口径一致，
// 不会出现两边各写一套阈值判断、慢慢跑偏的情况。
// ---------------------------------------------------------------------------

async function currentQuotaRow(ledgerId) {
  return db.queryOne(
    `SELECT period_value, total_amount, spent, remaining, used_pct, alert_level,
            safe_spend_mode, remaining_days, today_quota, calc_date
       FROM \`v_today_quota\`
      WHERE ledger_id = ?`,
    [ledgerId]
  );
}

/**
 * 四档文案。返回 null 表示「这次不需要穿透提示」。
 *
 * 不提示的两种情况：
 *   1. 不是支出（收入 / 转账不消耗预算）
 *   2. 这笔不是记在当月 —— 补记上个月的账不该改变「今天能花多少」
 */
async function buildPenetration(ledgerId, txn) {
  if (txn.type !== 'expense') return null;
  if (String(txn.happenedAt).slice(0, 7) !== period.currentPeriod()) return null;

  const quota = await currentQuotaRow(ledgerId);
  if (!quota) {
    return {
      level: 'none',
      message: '本月还没有设置预算，设置后这里会显示「今日可花」',
      hasBudget: false,
      todayQuotaAfter: null,
    };
  }

  let level = quota.alert_level; // normal | yellow | red
  const after = money.toNumber(quota.today_quota);
  const remaining = money.toNumber(quota.remaining);
  const usedPct = quota.used_pct == null ? 0 : Number(quota.used_pct);
  const categoryId = txn.category?.id;
  const categoryName = txn.category?.name || '该分类';

  const [categoryBudget, categorySpend] = await Promise.all([
    categoryId
      ? db.queryOne(
          `SELECT budget_amount, spent, remaining, used_pct
             FROM \`v_budget_category_progress\`
            WHERE ledger_id = ? AND period_value = ? AND category_id = ?`,
          [ledgerId, period.currentPeriod(), categoryId]
        )
      : null,
    categoryId
      ? db.queryOne(
          `SELECT total_amount
             FROM \`v_category_month_spend\`
            WHERE ledger_id = ? AND period_value = ? AND category_id = ?`,
          [ledgerId, period.currentPeriod(), categoryId]
        )
      : null,
  ]);

  let message;
  let categoryBudgetResult = null;
  if (!categoryBudget) {
    const spent = money.toNumber(categorySpend?.total_amount ?? 0);
    message = `已记录 ${money.formatMoney(txn.amount)} · 本月${categoryName}已花 ${money.formatMoney(spent)}`;
  } else {
    const categoryLimit = money.toNumber(categoryBudget.budget_amount);
    const categoryRemaining = money.toNumber(categoryBudget.remaining);
    const categoryUsedPct = categoryBudget.used_pct == null ? 0 : Number(categoryBudget.used_pct);
    const low = categoryLimit > 0 && categoryRemaining > 0 && categoryRemaining / categoryLimit < 0.2;

    if (categoryRemaining < 0) {
      level = 'red';
      message = `已记录 ${money.formatMoney(txn.amount)} · 本月${categoryName}已超支 ${money.formatMoney(Math.abs(categoryRemaining))}`;
    } else if (categoryRemaining === 0) {
      level = 'red';
      message = `已记录 ${money.formatMoney(txn.amount)} · 本月${categoryName}预算已用完`;
    } else if (low) {
      if (level === 'normal') level = 'yellow';
      message = `已记录 ${money.formatMoney(txn.amount)} · 本月${categoryName}仅剩 ${money.formatMoney(categoryRemaining)}`;
    } else {
      message = `已记录 ${money.formatMoney(txn.amount)} · 本月${categoryName}还剩 ${money.formatMoney(categoryRemaining)}`;
    }

    categoryBudgetResult = {
      categoryId,
      categoryName,
      budgetAmount: categoryLimit,
      remaining: categoryRemaining,
      usedPct: categoryUsedPct,
    };
  }

  const totalLow = Number(quota.total_amount) > 0 && remaining / Number(quota.total_amount) < 0.2;
  if (totalLow) {
    if (remaining < 0) {
      message += ` · 本月总预算已超支 ${money.formatMoney(Math.abs(remaining))}`;
    } else if (remaining === 0) {
      message += ' · 本月总预算已用完';
    } else {
      message += ' · 本月总额度剩余不足 20%';
    }
  }

  return {
    level,
    message,
    hasBudget: true,
    usedPct,
    budgetRemaining: remaining,
    categoryBudget: categoryBudgetResult,
    remainingDays: Number(quota.remaining_days),
    todayQuotaAfter: after,
  };
}

async function create(ledgerId, userId, body) {
  const payload = parsePayload(body);

  // 先做归属校验再插入：让「账户不属于我」返回 400 而不是撞外键报 1452。
  await assertAccount(ledgerId, payload.accountId, '账户');
  if (payload.toAccountId) {
    await assertAccount(ledgerId, payload.toAccountId, '转入账户');
  }
  if (payload.categoryId) {
    await assertCategory(ledgerId, payload.categoryId, payload.type);
  }

  const result = await db.query(
    `INSERT INTO \`transaction\`
       (\`ledger_id\`, \`created_by\`, \`type\`, \`amount\`, \`category_id\`,
        \`account_id\`, \`to_account_id\`, \`happened_at\`, \`note\`, \`merchant\`,
        \`source\`, \`is_deleted\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0)`,
    [
      ledgerId,
      userId,
      payload.type,
      money.fromCents(money.toCents(payload.amount)),
      payload.categoryId,
      payload.accountId,
      payload.toAccountId,
      payload.happenedAt,
      payload.note,
      payload.merchant,
    ]
  );

  const transaction = await getById(ledgerId, result.insertId);
  const penetration = await buildPenetration(ledgerId, transaction);

  return { transaction, penetration };
}

async function update(ledgerId, id, body) {
  const existing = await db.queryOne(
    `SELECT id, type, amount, category_id, account_id, to_account_id,
            happened_at, note, merchant, is_deleted
       FROM \`transaction\` WHERE id = ? AND ledger_id = ?`,
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('流水不存在', 'TRANSACTION_NOT_FOUND');
  if (Number(existing.is_deleted) === 1) {
    throw ApiError.conflict('已删除的流水不能编辑', 'TRANSACTION_DELETED');
  }

  // 取「现有值 + 本次改动」合并后的完整状态再校验一次。
  // 比逐字段打补丁安全：不会出现「改了 type 却没重校验 category 类型」这种漏洞。
  const merged = parsePayload(body, {
    type: existing.type,
    amount: money.fromCents(money.toCents(existing.amount)),
    categoryId: existing.category_id == null ? null : Number(existing.category_id),
    accountId: Number(existing.account_id),
    toAccountId: existing.to_account_id == null ? null : Number(existing.to_account_id),
    happenedAt: existing.happened_at,
    note: existing.note,
    merchant: existing.merchant,
  });

  await assertAccount(ledgerId, merged.accountId, '账户');
  if (merged.toAccountId) await assertAccount(ledgerId, merged.toAccountId, '转入账户');
  if (merged.categoryId) await assertCategory(ledgerId, merged.categoryId, merged.type);

  await db.query(
    `UPDATE \`transaction\`
        SET \`type\` = ?, \`amount\` = ?, \`category_id\` = ?, \`account_id\` = ?,
            \`to_account_id\` = ?, \`happened_at\` = ?, \`note\` = ?, \`merchant\` = ?
      WHERE id = ? AND ledger_id = ?`,
    [
      merged.type,
      money.fromCents(money.toCents(merged.amount)),
      merged.categoryId,
      merged.accountId,
      merged.toAccountId,
      merged.happenedAt,
      merged.note,
      merged.merchant,
      id,
      ledgerId,
    ]
  );

  const transaction = await getById(ledgerId, id);
  return { transaction, penetration: await buildPenetration(ledgerId, transaction) };
}

/** 软删除。服务端记录删除时刻，并强制 5 秒撤销窗口。 */
async function softDelete(ledgerId, id) {
  const result = await db.query(
    'UPDATE `transaction` SET `is_deleted` = 1, `deleted_at` = ? WHERE id = ? AND ledger_id = ? AND is_deleted = 0',
    [period.nowDateTime(), id, ledgerId]
  );
  if (result.affectedRows === 0) {
    // 已经删过 / 不属于本账本 —— 两种情况对调用方是同一件事：没删成。
    const exists = await db.queryValue(
      'SELECT id FROM `transaction` WHERE id = ? AND ledger_id = ?',
      [id, ledgerId]
    );
    if (!exists) throw ApiError.notFound('流水不存在', 'TRANSACTION_NOT_FOUND');
    throw ApiError.conflict('这笔流水已经删除过了', 'ALREADY_DELETED');
  }
  return { id: Number(id), isDeleted: true };
}

/** 撤销删除。PRD 4.5.3：仅删除后 5 秒内允许恢复。 */
async function restore(ledgerId, id) {
  const now = period.nowDateTime();
  const result = await db.query(
    'UPDATE `transaction` SET `is_deleted` = 0, `deleted_at` = NULL ' +
      'WHERE id = ? AND ledger_id = ? AND is_deleted = 1 ' +
      'AND deleted_at >= DATE_SUB(?, INTERVAL 5 SECOND)',
    [id, ledgerId, now]
  );
  if (result.affectedRows === 0) {
    const existing = await db.queryOne(
      'SELECT id, is_deleted, deleted_at FROM `transaction` WHERE id = ? AND ledger_id = ?',
      [id, ledgerId]
    );
    if (!existing) throw ApiError.notFound('流水不存在', 'TRANSACTION_NOT_FOUND');
    if (Number(existing.is_deleted) === 1) {
      throw ApiError.conflict('撤销窗口已过（删除后 5 秒内可撤销）', 'TRANSACTION_UNDO_EXPIRED');
    }
  }
  return { id: Number(id), isDeleted: false };
}

module.exports = {
  list,
  getById,
  recent,
  summary,
  create,
  update,
  softDelete,
  restore,
  mapTransaction,
  buildPenetration,
  assertAccount,
  assertCategory,
  parsePayload,
  TXN_TYPES,
};
