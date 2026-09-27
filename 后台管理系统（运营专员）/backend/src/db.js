'use strict';

/**
 * 数据库访问层。全项目只有这里 import mysql2。
 *
 * 与 C 端 db.js 同构（时区、dateStrings、DECIMAL 不变 number 的原因都一样），
 * 只多了一件后台特有的事：**运行时禁止 DDL**。见 assertDdlFree。
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

// 每个物理连接建立时固定会话时区，让视图里的 CURDATE() 有确定行为。
const corePool = pool.pool;
if (corePool && typeof corePool.on === 'function') {
  corePool.on('connection', (conn) => {
    conn.query(`SET time_zone = '${config.timezone}'`);
  });
}

/**
 * 硬约束的第二道防线：运行时不许出现任何 DDL。
 *
 * PRD 文首规定「现有 12 表 / 6 视图 / 8 约束一个字都不改，只允许 CREATE TABLE
 * 建后台自己的独立新表」。这条约束的第一道防线是数据库权限（mz_admin 不授
 * ALTER / DROP / CREATE，见 sql/01_admin_schema.sql 末尾的授权段）。
 *
 * 但权限只在「建号并正确授权」之后才成立。本地开发时常常图省事直接拿 mz_app
 * 或 root 跑起来，那两道防线就都没了。所以在应用层再拦一次：
 * 服务层写错 SQL 时立刻抛错，而不是等它在生产库里执行掉。
 *
 * 注意这里只拦「语句类型」，不做 SQL 解析 —— 把子查询里藏 DDL 这种事交给
 * 数据库权限去管，应用层不做过度承诺。
 */
const DDL_PATTERN = /^\s*(ALTER|DROP|CREATE|RENAME|TRUNCATE|GRANT|REVOKE|LOCK|UNLOCK)\b/i;

function assertDdlFree(sql) {
  const text = String(sql);
  // 用 ; 分隔的拼接语句在这里拦不住（multipleStatements 已关，数据库会拒），
  // 但逐个片段检查能挡住「先 SELECT 再偷偷 ALTER」这种幼稚写法。
  for (const statement of text.split(';')) {
    const m = statement.match(DDL_PATTERN);
    if (m) {
      const err = new Error(
        `后台运行时禁止执行 ${m[1].toUpperCase()} 语句。` +
          '数据库结构已冻结，建表请走 scripts/migrate-admin.js（PRD 文首「硬约束」）。'
      );
      err.code = 'DDL_FORBIDDEN';
      throw err;
    }
  }
}

/**
 * 统一查询入口。
 *
 * 用 query() 而不是 execute()：execute() 的占位符不支持 IN (?) 数组展开，
 * 会让「按 id 列表批量取用户」这类查询写得很别扭。query() 同样参数化防注入。
 */
async function query(sql, params = []) {
  assertDdlFree(sql);
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** 取第一行，没有则返回 null。 */
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
 * 事务包装。回调里拿到的是连接对象，必须用 conn.query 而不是模块级 query()，
 * 否则语句会跑到池里另一条连接上，不受事务管辖。
 *
 * 后台的写操作**都必须**走这里：处置动作改 user 表 + 写审计日志必须同进同退，
 * 否则会出现「用户被停用了但查不到是谁停的」这种最糟糕的状态。
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  const guarded = new Proxy(conn, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (sql, params) => {
          assertDdlFree(sql);
          return target.query(sql, params);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  try {
    await conn.beginTransaction();
    const result = await fn(guarded);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('[db] 回滚失败：', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 启动自检。
 *
 * 这里刻意**不**像 C 端那样要求「12 表 6 视图 8 约束」全部存在 —— 那是 C 端的
 * 责任。后台只确认两件自己的事：
 *   1. 库连得上；
 *   2. 后台自己的 5 张新表在不在。
 * 顺带把 C 端的 12 表数量报出来，仅作信息展示（数量不对说明连错了库）。
 */
async function ping() {
  await pool.query('SELECT 1');
  const version = await queryValue('SELECT VERSION()');

  const countTables = (name) =>
    queryValue(
      `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = ? AND table_name = ? AND table_type = 'BASE TABLE'`,
      [config.db.database, name]
    );

  const ADMIN_TABLES = ['admin_user', 'admin_audit_log', 'user_daily_active', 'category_template', 'account_template'];
  const missing = [];
  for (const name of ADMIN_TABLES) {
    if (Number(await countTables(name)) !== 1) missing.push(name);
  }

  const cEndTables = await queryValue(
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'
        AND table_name <> 'event_log'
        AND table_name NOT IN (${ADMIN_TABLES.map(() => '?').join(', ')})`,
    [config.db.database, ...ADMIN_TABLES]
  );
  const cEndViews = await queryValue(
    `SELECT COUNT(*) FROM information_schema.views WHERE table_schema = ?`,
    [config.db.database]
  );

  if (missing.length > 0) {
    const error = new Error(
      `后台所需的表不存在：${missing.join(', ')}。请先执行 npm run migrate。`
    );
    error.code = 'ADMIN_SCHEMA_MISSING';
    throw error;
  }

  return { version, cEndTables, cEndViews, adminTables: ADMIN_TABLES.length };
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, queryOne, queryValue, transaction, ping, close, assertDdlFree };
