'use strict';

/**
 * 后台认证的**纯函数**：密码哈希、token 签发校验、锁定策略常量。
 * 不碰数据库 —— 读写 admin_user 表的逻辑在 services/auth.service.js。
 *
 * 为什么这份代码不从 C 端 import：
 *   PRD 4.1 写得很明确：「代码要独立，不要为了省事去 import C 端的 auth service」。
 *   两个系统的会话语义已经分叉（C 端 30 天 / 后台 8 小时；C 端靠手机号邮箱登录 /
 *   后台靠用户名）。共用一份会让「改 C 端顺手改坏后台」变成随时可能发生的事。
 *   代码量不到 100 行，重复得起的。
 *
 * 与 C 端最关键的一处不同：**token 里带 scope: 'admin'**。
 *   C 端 token 没有这个标记，后台的 verifyToken 会因为它缺失而直接拒掉；
 *   反向同理 —— 后台 token 落到 C 端的 requireAuth 上，C 端按 sub 去 user 表查
 *   查不到（admin_user.id 与 user.id 是两套独立的 ID 空间），也会被拒。
 *   双向拒绝是 PRD 3.1 的硬要求，两个方向都要能过测。
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { ApiError } = require('./middleware/errors');

/** PRD 4.1：bcrypt cost=10，连续失败 5 次锁定 15 分钟（与 C 端同规格）。 */
const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_FAILS = 5;
const LOCK_MINUTES = 15;

/** 后台账号状态。只有两态 —— 后台账号不存在「用户自己注销」这回事。 */
const ADMIN_STATUS = { ACTIVE: 1, DISABLED: 2 };

/**
 * 固定的合法哈希，用于「账号不存在」时也跑一次比对，抹平响应时间差。
 * 不这么做的话，攻击者能用响应耗时判断哪些用户名存在。
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
 * payload 只有 scope + ver，不放 username、不放角色：
 *   有效期 8 小时，期间账号可能被停用（status=2）或强制下线（token_version+1）。
 *   把授权信息烤进 token，这 8 小时内就收不回来 —— 后台账号权限远大于 C 端用户，
 *   更不能容忍这一点。所以每次请求现查 admin_user。
 */
function signToken(adminId, tokenVersion) {
  return jwt.sign({ scope: config.jwt.scope, ver: Number(tokenVersion) }, config.jwt.secret, {
    subject: String(adminId),
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * 校验并解出 token。
 *
 * 这里的三道检查顺序是有意的：先验签名（密码学），再验 scope（这是不是后台的票），
 * 最后验 ver 的结构。scope 检查必须显式做 —— 只验签名的话，任何一把能解开后台
 * 密钥的 token 都能进来，而 scope 是「这张票是谁发的」的语义标记。
 */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    if (payload.scope !== config.jwt.scope) {
      throw ApiError.unauthorized('这不是后台的登录凭证', 'WRONG_TOKEN_SCOPE');
    }

    const tokenVersion = Number(payload.ver);
    if (!Number.isInteger(tokenVersion) || tokenVersion < 1) {
      throw ApiError.unauthorized('登录凭证已失效，请重新登录', 'TOKEN_REVOKED');
    }

    return {
      adminId: Number(payload.sub),
      tokenVersion,
      issuedAt: payload.iat * 1000,
      expiresAt: payload.exp * 1000,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('登录已过期，请重新登录', 'TOKEN_EXPIRED');
    }
    // 签名不对 / 结构不对 / 压根不是 JWT（例如把 C 端 token 拿过来）
    throw ApiError.unauthorized('登录凭证无效，请重新登录', 'TOKEN_INVALID');
  }
}

/** 滑动续期：签发超过 JWT_RENEW_AFTER 就顺手换一张新的。 */
function needsRenewal(issuedAt) {
  return Date.now() - issuedAt >= config.jwt.renewAfterMs;
}

/** 从请求里取 token，兼容 Authorization 头与 X-Auth-Token。 */
function extractToken(req) {
  const header = req.get('authorization');
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    if (!header.includes(' ')) return header.trim();
  }
  const alt = req.get('x-auth-token');
  return alt ? alt.trim() : null;
}

/** 生成一个可读性尚可的临时密码：12 位，含大小写字母与数字。 */
function generateTempPassword() {
  const crypto = require('crypto');
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉 I O，避免与 1 0 混淆
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // 去掉 l
  const digits = '23456789'; // 去掉 0 1
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  // 先各取一个保证字符类齐全，再补足长度，最后打乱。
  const chars = [pick(upper), pick(lower), pick(digits), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = {
  BCRYPT_ROUNDS,
  MAX_LOGIN_FAILS,
  LOCK_MINUTES,
  ADMIN_STATUS,
  hashPassword,
  verifyPassword,
  burnTime,
  signToken,
  verifyToken,
  needsRenewal,
  extractToken,
  generateTempPassword,
};
