'use strict';

/**
 * 安全应用数据库脚本/04_backend_fixes.sql。
 *
 * 迁移与日常运行使用不同权限：后端账号只需要增删改查；执行此脚本时通过
 * MIGRATION_DB_USER / MIGRATION_DB_PASSWORD 临时提供有 ALTER/CREATE VIEW 权限的账号。
 * 脚本会先识别“未迁移 / 已迁移 / 部分迁移”三种状态，避免重复或带病执行。
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../src/config');

const NEW_DEMO_HASH = '$2b$10$3Qa4JjYrrUkqSdwz6H865.aSCsQSMgDhtcKFCFD0YlGuEnHFkVddW';

function migrationCredentials() {
  return {
    user: process.env.MIGRATION_DB_USER || config.db.user,
    password: process.env.MIGRATION_DB_PASSWORD || config.db.password,
  };
}

async function inspect(connection) {
  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND ((TABLE_NAME = 'user' AND COLUMN_NAME = 'token_version')
          OR (TABLE_NAME = 'transaction' AND COLUMN_NAME = 'deleted_at'))`,
    [config.db.database]
  );
  const columns = new Set(columnRows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));

  const [indexRows] = await connection.query(
    `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'import_batch'
        AND INDEX_NAME IN ('uk_batch_no', 'uk_batch_ledger_no')
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [config.db.database]
  );
  const oldIndex = indexRows.some((row) => row.INDEX_NAME === 'uk_batch_no');
  const compositeColumns = indexRows
    .filter((row) => row.INDEX_NAME === 'uk_batch_ledger_no')
    .map((row) => row.COLUMN_NAME);
  const compositeIndex = compositeColumns.join(',') === 'ledger_id,batch_no';

  return {
    tokenVersion: columns.has('user.token_version'),
    deletedAt: columns.has('transaction.deleted_at'),
    oldIndex,
    compositeIndex,
  };
}

function isBefore(state) {
  return !state.tokenVersion && !state.deletedAt && state.oldIndex && !state.compositeIndex;
}

function isAfter(state) {
  return state.tokenVersion && state.deletedAt && !state.oldIndex && state.compositeIndex;
}

async function upgradeBuiltInDemoPassword(connection) {
  const [rows] = await connection.query(
    'SELECT id, password_hash FROM `user` WHERE email = ? LIMIT 1',
    ['demo@mingzhang.app']
  );
  const demo = rows[0];
  if (!demo || (await bcrypt.compare('Demo123456', demo.password_hash))) return false;

  // 只升级仍在使用项目旧默认密码的内置演示账号；用户自行修改过则绝不覆盖。
  if (!(await bcrypt.compare('123456', demo.password_hash))) return false;
  const [updated] = await connection.query(
    'UPDATE `user` SET password_hash = ? WHERE id = ? AND password_hash = ?',
    [NEW_DEMO_HASH, demo.id, demo.password_hash]
  );
  return updated.affectedRows === 1;
}

(async () => {
  const credentials = migrationCredentials();
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: credentials.user,
    password: credentials.password,
    charset: 'utf8mb4_0900_ai_ci',
    dateStrings: true,
    timezone: config.timezone,
    multipleStatements: true,
  });

  try {
    const before = await inspect(connection);
    if (isAfter(before)) {
      const demoUpgraded = await upgradeBuiltInDemoPassword(connection);
      console.log(
        demoUpgraded
          ? '数据库结构已是最新版本；内置演示账号的旧默认密码已安全升级。'
          : '数据库结构已是最新版本，无需重复迁移。'
      );
      return;
    }
    if (!isBefore(before)) {
      throw new Error(`检测到部分迁移或非预期结构，已停止。当前状态：${JSON.stringify(before)}`);
    }

    const sqlPath = path.resolve(__dirname, '..', '..', '数据库脚本', '04_backend_fixes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await connection.query(sql);

    const after = await inspect(connection);
    if (!isAfter(after)) {
      throw new Error(`SQL 已执行但结构校验未通过：${JSON.stringify(after)}`);
    }
    await upgradeBuiltInDemoPassword(connection);
    console.log('数据库迁移完成：令牌版本、撤销时限、导入批次索引和今日可花视图已更新。');
  } finally {
    await connection.end();
  }
})().catch((error) => {
  if (error && error.code === 'ER_TABLEACCESS_DENIED_ERROR') {
    console.error(
      '迁移账号缺少表结构权限。请临时设置 MIGRATION_DB_USER / MIGRATION_DB_PASSWORD，' +
        '使用具备 ALTER、DROP INDEX、CREATE VIEW 权限的账号后重试。'
    );
  } else {
    console.error(error.message || error);
  }
  process.exit(1);
});
