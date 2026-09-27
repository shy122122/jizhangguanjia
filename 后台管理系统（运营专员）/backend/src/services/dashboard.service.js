'use strict';

const db = require('../db');

async function overview(daysInput) {
  const days = Math.min(90, Math.max(7, Math.trunc(Number(daysInput) || 30)));
  const [totals, trend, statusRows, importRows, activeCount, retention] = await Promise.all([
    db.queryOne(`SELECT
      (SELECT COUNT(*) FROM user) AS users,
      (SELECT COUNT(*) FROM user WHERE status=1) AS active_users,
      (SELECT COUNT(*) FROM ledger WHERE is_archived=0) AS ledgers,
      (SELECT COUNT(*) FROM transaction WHERE is_deleted=0) AS transactions,
      (SELECT COUNT(DISTINCT l.owner_id) FROM budget b JOIN ledger l ON l.id=b.ledger_id) AS budget_users,
      (SELECT COUNT(*) FROM admin_audit_log) AS audits`),
    db.query(`WITH RECURSIVE date_range AS (
        SELECT DATE_SUB(CURDATE(), INTERVAL ? DAY) AS stat_date
        UNION ALL
        SELECT DATE_ADD(stat_date, INTERVAL 1 DAY)
        FROM date_range
        WHERE stat_date < CURDATE()
      ), registration_counts AS (
        SELECT DATE(created_at) AS stat_date, COUNT(*) AS registered
        FROM user
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
      )
      SELECT DATE_FORMAT(d.stat_date, '%Y-%m-%d') AS stat_date,
        COALESCE(r.registered, 0) AS registered
      FROM date_range d
      LEFT JOIN registration_counts r ON r.stat_date = d.stat_date
      ORDER BY d.stat_date`, [days - 1, days - 1]),
    db.query('SELECT status, COUNT(*) AS count FROM user GROUP BY status'),
    db.queryOne(`SELECT COUNT(*) AS total,
      SUM(status='completed') AS completed, SUM(status='reverted') AS reverted FROM import_batch`),
    db.queryValue(`SELECT COUNT(*) FROM user_daily_active WHERE active_date = CURDATE()`),
    db.queryOne(`SELECT
      COUNT(DISTINCT CASE WHEN a.active_date = DATE_ADD(DATE(u.created_at), INTERVAL 7 DAY) THEN u.id END) AS retained7,
      COUNT(DISTINCT CASE WHEN a.active_date = DATE_ADD(DATE(u.created_at), INTERVAL 30 DAY) THEN u.id END) AS retained30,
      COUNT(DISTINCT u.id) AS cohort
      FROM user u LEFT JOIN user_daily_active a ON a.user_id=u.id
      WHERE u.created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY)`),
  ]);
  const users = Number(totals.users || 0);
  const importTotal = Number(importRows.total || 0);
  return {
    totals: {
      users, activeUsers: Number(totals.active_users || 0), ledgers: Number(totals.ledgers || 0),
      transactions: Number(totals.transactions || 0), audits: Number(totals.audits || 0),
    },
    rates: {
      budgetSetup: users ? Math.round(Number(totals.budget_users || 0) * 1000 / users) / 10 : 0,
      importSuccess: importTotal ? Math.round(Number(importRows.completed || 0) * 1000 / importTotal) / 10 : null,
      retention7: Number(retention.cohort || 0) ? Math.round(Number(retention.retained7 || 0) * 1000 / Number(retention.cohort)) / 10 : null,
      retention30: Number(retention.cohort || 0) ? Math.round(Number(retention.retained30 || 0) * 1000 / Number(retention.cohort)) / 10 : null,
    },
    activity: { dau: Number(activeCount || 0), available: Number(activeCount || 0) > 0 },
    userStatus: statusRows.map((r) => ({ status: Number(r.status), count: Number(r.count) })),
    registrationTrend: trend.map((r) => ({ date: r.stat_date, count: Number(r.registered) })),
    import: { total: importTotal, completed: Number(importRows.completed || 0), reverted: Number(importRows.reverted || 0) },
  };
}

module.exports = { overview };
