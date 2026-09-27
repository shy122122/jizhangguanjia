'use strict';

/**
 * 统一错误处理。
 *
 * 形状与 C 端一致：成功 { ok:true, data, meta? }，失败 { ok:false, error:{ code, message } }。
 * 前端 api.js 因此可以直接沿用同一套解析逻辑。
 *
 * 与 C 端的两处差异（PRD 第 9 章点名的）：
 *   1. 1451（外键阻止删除）在后台的语义不是「请改用归档」，而是「后台本就不该删
 *      业务数据」—— 这是红线被触发，要让他看见问题而不是给他一条绕路。
 *   2. 新增 DDL_FORBIDDEN 的映射，把 db.js 的断言变成可读的 403。
 */

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = '登录已过期，请重新登录', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = '没有权限执行该操作', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = '资源不存在', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  /** 423 Locked —— 登录失败超限。不能用 401，否则前端会当成「token 失效」去跳登录页。 */
  static locked(message = '账号已被临时锁定，请稍后再试', code = 'ACCOUNT_LOCKED') {
    return new ApiError(423, code, message);
  }

  /**
   * 428 Precondition Required —— 「原因必填」这类前置条件缺失。
   * 用 428 而不是 400，是为了让前端能单独识别「缺原因」并高亮那个输入框。
   */
  static reasonRequired(message = '请填写操作原因') {
    return new ApiError(428, 'REASON_REQUIRED', message);
  }

  static notImplemented(message = '该功能尚未实现', code = 'NOT_IMPLEMENTED') {
    return new ApiError(501, code, message);
  }
}

/** MySQL 错误码 → 面向运营的中文。 */
const MYSQL_ERRORS = {
  ER_CHECK_CONSTRAINT_VIOLATED: [
    400,
    'DATA_INVALID',
    '数据不符合业务规则（例如信用卡账户不允许填信用额度外的字段）',
  ],
  ER_WARN_DATA_OUT_OF_RANGE: [400, 'VALUE_OUT_OF_RANGE', '数值超出允许范围'],
  ER_DATA_OUT_OF_RANGE: [400, 'VALUE_OUT_OF_RANGE', '数值超出允许范围'],
  ER_NO_REFERENCED_ROW_2: [400, 'INVALID_REFERENCE', '引用的对象不存在'],
  ER_NO_REFERENCED_ROW: [400, 'INVALID_REFERENCE', '引用的对象不存在'],
  ER_DUP_ENTRY: [409, 'DUPLICATE', '该记录已存在'],
  // 后台的业务数据永远不该被删。1451 只可能来自「有人写了删业务数据的代码」，
  // 那是红线被踩，要把话说透，而不是给一句「请改用归档」把他引到别处。
  ER_ROW_IS_REFERENCED_2: [
    409,
    'FORBIDDEN_DELETE',
    '该数据被其他记录引用，且后台不允许删除用户的业务数据（PRD 3.5 红线 1）',
  ],
  ER_ROW_IS_REFERENCED: [
    409,
    'FORBIDDEN_DELETE',
    '该数据被其他记录引用，且后台不允许删除用户的业务数据（PRD 3.5 红线 1）',
  ],
  ER_LOCK_DEADLOCK: [409, 'DEADLOCK', '操作冲突，请重试'],
  ER_TABLEACCESS_DENIED_ERROR: [
    403,
    'DB_PERMISSION_DENIED',
    '数据库账号没有这张表的操作权限 —— 这正是 PRD 3.2「用权限兜住产品约束」在生效。' +
      '若这是误报，请检查 mz_admin 的授权是否过窄。',
  ],
  ER_COLUMNACCESS_DENIED_ERROR: [
    403,
    'DB_PERMISSION_DENIED',
    '数据库账号没有这一列的写权限 —— PRD 3.2 只开放了极少数列的写权限，这是预期行为。',
  ],
  ER_BAD_FIELD_ERROR: [500, 'SQL_FIELD_ERROR', '服务内部查询字段有误，请联系开发'],
};

const CONNECTION_ERRORS = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ER_ACCESS_DENIED_ERROR',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
]);

/** 404：没有任何路由匹配。放在所有路由之后、错误处理之前。 */
function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `接口不存在：${req.method} ${req.path}` },
  });
}

/** 全局错误处理。Express 靠 4 个参数识别它，所以 next 不能省。 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // db.js 的 DDL 断言。这是硬约束在应用层被触发，属于**服务端代码有问题**，
  // 但对调用方而言「你不该做这件事」，所以给 403 而不是 500。
  if (err.code === 'DDL_FORBIDDEN') {
    console.error('[db] 拦截到运行时 DDL：', err.message);
    return res.status(403).json({
      ok: false,
      error: { code: 'DDL_FORBIDDEN', message: '后台禁止改动数据库结构（PRD 文首「硬约束」）' },
    });
  }

  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: '请求体不是合法的 JSON' },
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' } });
  }

  if (err.code && MYSQL_ERRORS[err.code]) {
    const [status, code, message] = MYSQL_ERRORS[err.code];
    console.warn(`[db] ${err.code} → ${status} ${code}`);
    return res.status(status).json({ ok: false, error: { code, message } });
  }

  if (err.code && CONNECTION_ERRORS.has(err.code)) {
    console.error('[db] 连接故障：', err.code, err.message);
    return res.status(503).json({
      ok: false,
      error: { code: 'DB_UNAVAILABLE', message: '数据库暂时不可用，请稍后重试' },
    });
  }

  // 兜底：日志留全量堆栈，响应只给通用文案，避免把 SQL 或内部路径泄露出去。
  console.error('[error] 未预期的错误：', err);
  return res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
