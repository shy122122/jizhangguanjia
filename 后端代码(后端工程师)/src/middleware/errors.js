'use strict';

/**
 * 统一错误处理。
 *
 * 两条原则：
 *   1. 对客户端：永远只返回 { ok:false, error:{ code, message } }，code 是稳定的
 *      机器可读串，message 是能直接展示给用户的中文。
 *   2. 对数据库：把 MySQL 的错误码翻译成人话。业务代码不需要在每个 catch 里
 *      判断「这是不是 CHECK 违反」，交给这里统一处理。
 *
 * 数据库层已经是最后一道防线（9 条 CHECK 约束），这里的目标是让它触发时
 * 用户看到的是「金额必须大于 0」而不是「ER_CHECK_CONSTRAINT_VIOLATED」。
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

  static forbidden(message = '没有权限访问该资源', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = '资源不存在', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  /** 423 Locked —— 登录失败次数超限时用，不要用 401（会被前端当成「token 失效」）。 */
  static locked(message = '账号已被临时锁定，请稍后再试', code = 'ACCOUNT_LOCKED') {
    return new ApiError(423, code, message);
  }

  static notImplemented(message = '该功能尚未实现', code = 'NOT_IMPLEMENTED') {
    return new ApiError(501, code, message);
  }
}

/**
 * MySQL 错误码 → 面向用户的中文。键是 mysql2 暴露的 err.code（字符串形式），
 * 括号里是对应的数字码，方便对着数据库脚本/README.md 排查。
 */
const MYSQL_ERRORS = {
  // CHECK 约束被违反（3819）。9 条约束全部走这里。
  ER_CHECK_CONSTRAINT_VIOLATED: [
    400,
    'DATA_INVALID',
    '数据不符合业务规则，请检查金额、分类与转账账户',
  ],
  // 数值越界（1264）：典型是拿负数去填 DECIMAL UNSIGNED 的 amount。
  ER_WARN_DATA_OUT_OF_RANGE: [400, 'VALUE_OUT_OF_RANGE', '金额超出允许范围'],
  ER_DATA_OUT_OF_RANGE: [400, 'VALUE_OUT_OF_RANGE', '金额超出允许范围'],
  // 外键指向了不存在的行（1452）。
  ER_NO_REFERENCED_ROW_2: [400, 'INVALID_REFERENCE', '引用的账户或分类不存在'],
  ER_NO_REFERENCED_ROW: [400, 'INVALID_REFERENCE', '引用的账户或分类不存在'],
  // 唯一键冲突（1062）。
  ER_DUP_ENTRY: [409, 'DUPLICATE', '该记录已存在'],
  // 行被外键引用，删不掉（1451）。分类/账户禁止物理删除，走归档。
  ER_ROW_IS_REFERENCED_2: [
    409,
    'ROW_IS_REFERENCED',
    '该数据已被流水引用，不能删除。请改用「归档」',
  ],
  ER_ROW_IS_REFERENCED: [
    409,
    'ROW_IS_REFERENCED',
    '该数据已被流水引用，不能删除。请改用「归档」',
  ],
  // 未提交的事务被外键检查牵连。
  ER_LOCK_DEADLOCK: [409, 'DEADLOCK', '操作冲突，请重试'],
};

/** 连接层故障 —— 数据库没起、密码错、网络不通。属于服务端问题，但提示要能看懂。 */
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

/** 全局错误处理。Express 通过参数个数（4 个）识别它，所以 next 不能省。 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // express.json() 在请求体不是合法 JSON 时抛这个。
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: '请求体不是合法的 JSON' },
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体过大' },
    });
  }

  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: { code: 'AVATAR_TOO_LARGE', message: '头像图片不能超过 5MB' },
      });
    }
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_UPLOAD', message: '头像上传请求不正确，请重新选择图片' },
    });
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

  // 兜底：非预期错误。日志留全量堆栈，响应只给一句通用的，
  // 避免把 SQL 语句或内部路径泄露给客户端。
  console.error('[error] 未预期的错误：', err);
  return res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
