'use strict';

/**
 * requireAdmin —— 把「一个后台 token」变成「一个后台请求上下文」。
 *
 * 每个受保护的请求做三件事：
 *   1. 校验 token 签名 + scope + 过期
 *   2. **从数据库现查** admin 的状态与 token_version
 *   3. 把 { adminId, admin, tokenVersion } 挂到 req.auth
 *
 * 为什么第 2 步必须查库（与 C 端同一个理由，但后台更严重）：
 *   后台账号的权限是「能看所有人的账」。停用一个账号如果只写进数据库、而
 *   已签发的 token 还能继续用 8 小时，等于停用要延迟 8 小时才生效。
 *   现查一次库，停用就是即时的。
 *
 * 为什么不复用 C 端的 requireAuth（PRD 决策 #2）：
 *   C 端的 requireAuth 会顺带查 ledger 并要求账号必须有账本。后台账号没有账本，
 *   复用必然要加一个「如果没有账本就跳过」的分支 —— 那个分支就是漏洞入口。
 */

const auth = require('../auth');
const db = require('../db');
const { ApiError } = require('./errors');

const { ADMIN_STATUS } = auth;

async function loadAdminContext(adminId) {
  const admin = await db.queryOne(
    `SELECT id, username, display_name, status, token_version,
            login_fail_count, locked_until, last_login_at, last_login_ip, created_at
       FROM \`admin_user\` WHERE id = ?`,
    [adminId]
  );

  if (!admin) {
    throw ApiError.unauthorized('后台账号不存在，请重新登录', 'ADMIN_NOT_FOUND');
  }
  if (Number(admin.status) === ADMIN_STATUS.DISABLED) {
    throw ApiError.forbidden('该后台账号已被停用', 'ADMIN_DISABLED');
  }

  return {
    adminId: Number(admin.id),
    tokenVersion: Number(admin.token_version),
    admin: {
      id: Number(admin.id),
      username: admin.username,
      displayName: admin.display_name,
      lastLoginAt: admin.last_login_at,
      createdAt: admin.created_at,
    },
  };
}

async function requireAdmin(req, res, next) {
  const token = auth.extractToken(req);
  if (!token) throw ApiError.unauthorized('请先登录', 'TOKEN_MISSING');

  const decoded = auth.verifyToken(token);
  req.auth = await loadAdminContext(decoded.adminId);

  // token 版本对不上 = 已被强制下线 / 改过密码 / 自己退出过登录。
  if (decoded.tokenVersion !== req.auth.tokenVersion) {
    throw ApiError.unauthorized('登录凭证已失效，请重新登录', 'TOKEN_REVOKED');
  }
  req.token = token;

  // 滑动续期：接近过期就顺手换一张，通过响应头下发，不动响应体形状。
  if (auth.needsRenewal(decoded.issuedAt)) {
    res.set('X-Refreshed-Token', auth.signToken(decoded.adminId, req.auth.tokenVersion));
    res.set('Access-Control-Expose-Headers', 'X-Refreshed-Token');
  }

  next();
}

/** 取客户端 IP。trust proxy 没配时不信任 X-Forwarded-For，避免被伪造。 */
function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null;
}

module.exports = { requireAdmin, loadAdminContext, clientIp, ADMIN_STATUS };
