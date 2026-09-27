'use strict';

const db = require('../db');
const http = require('../utils/http');
const mask = require('../utils/mask');
const validate = require('../utils/validate');

function parseJson(value) {
  if (value == null || typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

async function append(entry, conn = null) {
  const runner = conn || db;
  const sql = `INSERT INTO admin_audit_log
    (admin_id, admin_label, action, target_type, target_id, target_label,
     before_json, after_json, reason, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    Number(entry.adminId || 0), entry.adminLabel || '系统', entry.action,
    entry.targetType, entry.targetId == null ? null : String(entry.targetId),
    entry.targetLabel || '—', entry.before == null ? null : JSON.stringify(entry.before),
    entry.after == null ? null : JSON.stringify(entry.after), entry.reason || '系统记录', entry.ip || null,
  ];
  const result = await runner.query(sql, params);
  return Number((Array.isArray(result) ? result[0] : result).insertId || 0);
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [20, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  const where = ['1=1']; const params = [];
  if (query.adminId) { where.push('a.admin_id = ?'); params.push(Number(query.adminId)); }
  if (query.action) { where.push('a.action = ?'); params.push(String(query.action)); }
  if (query.target) { where.push('(a.target_label LIKE ? OR a.target_id = ?)'); params.push(`%${query.target}%`, String(query.target)); }
  if (query.from) { where.push('a.created_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${query.to} 00:00:00`); }
  const clause = where.join(' AND ');
  const total = Number(await db.queryValue(`SELECT COUNT(*) FROM admin_audit_log a WHERE ${clause}`, params));
  const rows = await db.query(
    `SELECT a.id, a.admin_id, a.admin_label, a.action, a.target_type, a.target_id,
            a.target_label, a.reason, a.ip, a.created_at
       FROM admin_audit_log a WHERE ${clause}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  return {
    items: rows.map((r) => ({
      id: Number(r.id), adminId: Number(r.admin_id), adminLabel: r.admin_label,
      action: r.action, targetType: r.target_type, targetId: r.target_id,
      targetLabel: r.target_label, reason: r.reason, ip: mask.ip(r.ip), createdAt: r.created_at,
    })),
    meta: http.pageMeta({ page, pageSize, total }),
  };
}

async function get(id) {
  const row = await db.queryOne('SELECT * FROM admin_audit_log WHERE id = ?', [Number(id)]);
  if (!row) return null;
  return {
    id: Number(row.id), adminId: Number(row.admin_id), adminLabel: row.admin_label,
    action: row.action, targetType: row.target_type, targetId: row.target_id,
    targetLabel: row.target_label, before: parseJson(row.before_json), after: parseJson(row.after_json),
    reason: row.reason, ip: mask.ip(row.ip), createdAt: row.created_at,
  };
}

async function exportCsv(query, actor) {
  const reason = validate.reason(query.reason);
  const where = ['1=1']; const params = [];
  if (query.from) { where.push('created_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${query.to} 00:00:00`); }
  const rows = await db.query(
    `SELECT id,admin_label,action,target_type,target_id,target_label,reason,ip,created_at
       FROM admin_audit_log WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 10000`, params
  );
  await append({ ...actor, action: 'audit.export', targetType: 'audit', targetLabel: '审计日志', reason,
    after: { from: query.from || null, to: query.to || null, count: rows.length } });
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['ID','操作人','动作','目标类型','目标ID','目标','原因','IP','时间'].map(cell).join(',')];
  rows.forEach((r) => lines.push([r.id,r.admin_label,r.action,r.target_type,r.target_id,r.target_label,r.reason,mask.ip(r.ip),r.created_at].map(cell).join(',')));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { append, list, get, exportCsv };
