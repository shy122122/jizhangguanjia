'use strict';

/** 安全应用数据库脚本/05_user_avatar.sql；重复执行不会覆盖已有头像。 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

(async () => {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: process.env.MIGRATION_DB_USER || config.db.user,
    password: process.env.MIGRATION_DB_PASSWORD || config.db.password,
    charset: 'utf8mb4_0900_ai_ci',
    dateStrings: true,
    timezone: config.timezone,
    multipleStatements: true,
  });

  try {
    const sqlPath = path.resolve(__dirname, '..', '..', '数据库脚本', '05_user_avatar.sql');
    await connection.query(fs.readFileSync(sqlPath, 'utf8'));
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
         FROM information_schema.tables
        WHERE table_schema = ? AND table_name = 'user_avatar' AND table_type = 'BASE TABLE'`,
      [config.db.database]
    );
    if (Number(rows[0]?.count) !== 1) throw new Error('头像表创建后校验失败');
    console.log('数据库迁移完成：用户头像表已就绪。');
  } finally {
    await connection.end();
  }
})().catch((error) => {
  if (error && error.code === 'ER_TABLEACCESS_DENIED_ERROR') {
    console.error('迁移账号缺少建表权限，请使用具备 CREATE 权限的迁移账号后重试。');
  } else {
    console.error(error.message || error);
  }
  process.exit(1);
});
