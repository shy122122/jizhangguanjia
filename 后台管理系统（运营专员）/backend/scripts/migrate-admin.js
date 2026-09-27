'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

async function main() {
  const database = process.env.DB_NAME || 'mingzhang';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'root',
    password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    database,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', 'sql', '01_admin_schema.sql'), 'utf8');
    await connection.query(sql);

    const runtimeUser = process.env.ADMIN_DB_USER;
    const runtimePassword = process.env.ADMIN_DB_PASSWORD;
    if (runtimeUser && runtimePassword) {
      if (!/^[a-zA-Z0-9_]+$/.test(runtimeUser)) throw new Error('ADMIN_DB_USER 只能包含字母、数字和下划线');
      await connection.query(`CREATE USER IF NOT EXISTS ??@'localhost' IDENTIFIED BY ?`, [runtimeUser, runtimePassword]);
      await connection.query(`CREATE USER IF NOT EXISTS ??@'%' IDENTIFIED BY ?`, [runtimeUser, runtimePassword]);
      const readTables = ['user','user_avatar','ledger','ledger_member','account','category','import_batch','transaction','budget','budget_category','category_rule','user_preference','event_log','v_account_balance','v_budget_progress','v_budget_category_progress','v_monthly_summary','v_today_quota','v_category_month_spend'];
      for (const host of ['localhost', '%']) {
        const principal = `\`${runtimeUser}\`@\`${host}\``;
        for (const table of readTables) {
          await connection.query(`GRANT SELECT ON \`${database}\`.\`${table}\` TO ${principal}`);
        }
        await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`category_rule\` TO ${principal}`);
        await connection.query(`GRANT SELECT, UPDATE (status, token_version, login_fail_count, locked_until, password_hash) ON \`${database}\`.\`user\` TO ${principal}`);
        await connection.query(`GRANT SELECT, INSERT, UPDATE ON \`${database}\`.\`admin_user\` TO ${principal}`);
        await connection.query(`GRANT SELECT, INSERT ON \`${database}\`.\`admin_audit_log\` TO ${principal}`);
        await connection.query(`GRANT SELECT, INSERT, UPDATE ON \`${database}\`.\`user_daily_active\` TO ${principal}`);
        await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`category_template\` TO ${principal}`);
        await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`account_template\` TO ${principal}`);
      }
      // C 端注册需要读取模板；鉴权中间件只写日活聚合。不给 C 端任何后台账号或审计权限。
      const [appAccounts] = await connection.query(
        `SELECT Host AS host FROM mysql.user WHERE User = 'mz_app'`
      );
      for (const row of appAccounts) {
        const safeHost = String(row.host).replace(/`/g, '``');
        const appPrincipal = `\`mz_app\`@\`${safeHost}\``;
        await connection.query(`GRANT SELECT ON \`${database}\`.\`category_template\` TO ${appPrincipal}`);
        await connection.query(`GRANT SELECT ON \`${database}\`.\`account_template\` TO ${appPrincipal}`);
        await connection.query(`GRANT SELECT, INSERT, UPDATE ON \`${database}\`.\`user_daily_active\` TO ${appPrincipal}`);
      }
      console.log(`[migrate] 已创建并收窄授权运行账号 ${runtimeUser}`);
    }
    console.log('[migrate] 后台 5 张独立表已就绪；未改动任何 C 端表结构。');
  } finally {
    await connection.end();
  }
}

main().catch((err) => { console.error('[migrate]', err.message); process.exit(1); });
