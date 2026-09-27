'use strict';

/**
 * 数据库访问层。全项目只有这里 import mysql2。
 *
 * 三个关键配置，每一个都对应一类真实会踩的坑：
 *
 *   dateStrings: true
 *     DATETIME 以 'YYYY-MM-DD HH:MM:SS' 字符串进出，不经过 JS Date。
 *     否则驱动会按运行环境的本地时区把时间转来转去，跨时区部署时
 *     「今天」会整体偏一天，而记账产品里日期错一天就是错账。
 *
 *   decimalNumbers 不开（保持默认）
 *     DECIMAL 以字符串返回。JS 的 number 是双精度浮点，1280.50 存进去
 *     再取出来可能变成 1280.4999999999998。金额一律用 utils/money.js 转成
 *     「分」这个整数再运算，绝不直接对字符串做加减。
 *
 *   连接建立时 SET time_zone = '+08:00'
 *     视图里用了 CURDATE()（v_today_quota 的「今日」就是它），
 *     而 CURDATE() 取的是【会话时区】。不显式设，结果就取决于服务器配置，
 *     换个环境「今日可花」会算错。
 */

const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,

  waitForConnections: true,
  connectionLimit: config.db.poolSize,
  queueLimit: 0,

  charset: 'utf8mb4_0900_ai_ci',
  dateStrings: true,
  timezone: config.timezone,
  multipleStatements: false, // 关掉，杜绝一次误拼接执行多条语句
  namedPlaceholders: false,
});

// 每个物理连接建立时固定会话时区，让 CURDATE() 有确定行为。
const corePool = pool.pool;
if (corePool && typeof corePool.on === 'function') {
  corePool.on('connection', (conn) => {
    conn.query(`SET time_zone = '${config.timezone}'`);
  });
}

/**
 * 统一查询入口。
 *
 * 用 query() 而不是 execute()：execute() 走服务端预处理语句，但它的占位符
 * 不支持数组展开（IN (?)）和部分 LIMIT 写法，会让列表类查询写得很别扭。
 * query() 在客户端用 mysql2 的 SqlString 做转义，参数化同样能防注入。
 * 代价是每种参数组合都会产生不同的 SQL 文本、无法复用预处理计划 ——
 * 对个人记账这个量级完全没有影响。
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** 取第一行，没有则返回 null。用于「必然至多一行」的查询。 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** 取单个标量值。 */
async function queryValue(sql, params = []) {
  const row = await queryOne(sql, params);
  if (!row) return null;
  return Object.values(row)[0];
}

/**
 * 事务包装。回调里拿到的是连接对象，必须用 conn.query 而不是模块级的 query()，
 * 否则语句会跑到池里另一条连接上，不受事务管辖。
 *
 * 用参数化 SQL 时也要注意：conn 上的占位符 API 与 pool 一致。
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      // 回滚本身失败（通常是连接已断）时，原始错误才是要往上抛的那个。
      console.error('[db] 回滚失败：', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** 启动自检用：确认能连上、且库里的表确实存在。 */
async function ping() {
  await pool.query('SELECT 1');
  const version = await queryValue('SELECT VERSION()');
  const tables = await queryValue(
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [config.db.database]
  );
  const views = await queryValue(
    `SELECT COUNT(*) FROM information_schema.views WHERE table_schema = ?`,
    [config.db.database]
  );
  const checks = await queryValue(
    `SELECT COUNT(*) FROM information_schema.table_constraints
      WHERE table_schema = ? AND constraint_type = 'CHECK'`,
    [config.db.database]
  );

  const requiredColumns = await queryValue(
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = ?
        AND ((table_name = 'user' AND column_name = 'token_version')
          OR (table_name = 'transaction' AND column_name = 'deleted_at'))`,
    [config.db.database]
  );
  const batchIndexes = await query(
    `SELECT index_name AS name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = 'import_batch'
        AND index_name IN ('uk_batch_no', 'uk_batch_ledger_no')
      GROUP BY index_name`,
    [config.db.database]
  );
  const hasCompositeBatchIndex = batchIndexes.some(
    (row) => row.name === 'uk_batch_ledger_no' && row.columns_list === 'ledger_id,batch_no'
  );
  const hasOldBatchIndex = batchIndexes.some((row) => row.name === 'uk_batch_no');
  const avatarTable = await queryValue(
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = ? AND table_name = 'user_avatar' AND table_type = 'BASE TABLE'`,
    [config.db.database]
  );
  if (
    Number(requiredColumns) !== 2 ||
    !hasCompositeBatchIndex ||
    hasOldBatchIndex ||
    Number(avatarTable) !== 1
  ) {
    const error = new Error(
      '数据库结构版本过旧，请先执行 npm run migrate:backend-fixes 和 npm run migrate:avatar'
    );
    error.code = 'DB_SCHEMA_OUTDATED';
    throw error;
  }
  return { version, tables, views, checks };
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, queryOne, queryValue, transaction, ping, close };
