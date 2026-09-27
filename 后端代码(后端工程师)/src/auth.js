'use strict';

/**
 * 认证相关的**纯函数**：密码哈希、token 签发校验、锁定策略常量。
 * 这里不碰数据库 —— 需要读写 user 表的逻辑在 services/auth.service.js。
 *
 * 为什么用 bcryptjs 而不是 bcrypt：
 *   bcrypt 是带原生扩展的包，在 Windows + Node 24 上安装时需要 node-gyp 编译、
 *   大概率失败；bcryptjs 是纯 JS 实现，零编译步骤。两者生成的哈希互相兼容
 *   （都是 $2b$ 格式），所以 02_seed.sql 里的哈希可以直接用。
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { ApiError } = require('./middleware/errors');

/** PRD 4.1.2：bcrypt cost=10，连续失败 5 次锁定 15 分钟。 */
const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_FAILS = 5;
const LOCK_MINUTES = 15;

/**
 * 一个固定的合法哈希，用于「用户不存在」时也跑一次比对。
 *
 * 不这么做的话，未注册的邮箱会立刻返回、已注册的要等 bcrypt 算完，
 * 攻击者用响应时间就能判断哪些邮箱注册过 —— 账号枚举。
 * 这里使用固定的 bcrypt(cost=10) 合法哈希，仅用于抹平响应耗时。
 */
const TIMING_DUMMY_HASH = '$2b$10$uuvE7o.QEmWWm/xvqV3fW.qqjth2KhdhcCceBxuZwxLY4ejTb4rkC';

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // 哈希串损坏时不应抛 500，按「密码不对」处理。
    return false;
  }
}

/** 抹平时间差用。返回值无意义，关键是让它把时间花掉。 */
async function burnTime(plain) {
  try {
    await bcrypt.compare(String(plain ?? ''), TIMING_DUMMY_HASH);
  } catch {
    /* 忽略 */
  }
}

/**
 * 签发 token。
 *
 * payload 里刻意 **只有 sub 和 ver**：不放 ledgerId、不放角色。
 * 原因是 token 有效期 30 天，而这期间账本可能变化（V1.2 多账本 / 转让）。
 * 把授权信息烤进一个 30 天不过期的字符串里，等于放弃了中途收回的能力。
 * ledgerId 改成每次请求现查；ver 只用于与数据库令牌版本比对，从而支持吊销。
 * 多一次查询换正确性，值得。
 */
function signToken(userId, tokenVersion) {
  return jwt.sign({ ver: Number(tokenVersion) }, config.jwt.secret, {
    subject: String(userId),
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

/** 校验并解出 token 内容。失败抛 401（区分「过期」与「无效」，前端提示不同）。 */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    const tokenVersion = Number(payload.ver);
    if (!Number.isInteger(tokenVersion) || tokenVersion < 1) {
      throw ApiError.unauthorized('登录凭证已失效，请重新登录', 'TOKEN_REVOKED');
    }
    return {
      userId: Number(payload.sub),
      tokenVersion,
      issuedAt: payload.iat * 1000,
      expiresAt: payload.exp * 1000,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('登录已过期，请重新登录', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('登录凭证无效，请重新登录', 'TOKEN_INVALID');
  }
}

/**
 * 滑动续期：签发超过 JWT_RENEW_AFTER 就顺手换一张新的。
 * 效果是「持续使用的用户永远不会被踢下线」，而不需要 refresh token 表和它的
 * 轮换、吊销、并发刷新等一整套复杂度。
 */
function needsRenewal(issuedAt) {
  return Date.now() - issuedAt >= config.jwt.renewAfterMs;
}

/** 从请求里取 token，兼容 Authorization 头和 X-Auth-Token 两种传法。 */
function extractToken(req) {
  const header = req.get('authorization');
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    // 有些客户端会直接塞裸 token，容错处理。
    if (!header.includes(' ')) return header.trim();
  }
  const alt = req.get('x-auth-token');
  return alt ? alt.trim() : null;
}

module.exports = {
  BCRYPT_ROUNDS,
  MAX_LOGIN_FAILS,
  LOCK_MINUTES,
  hashPassword,
  verifyPassword,
  burnTime,
  signToken,
  verifyToken,
  needsRenewal,
  extractToken,
};
