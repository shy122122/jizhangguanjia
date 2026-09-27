'use strict';

/**
 * requireAuth —— 把「一个 token」变成「一个完整的请求上下文」。
 *
 * 每个受保护的请求都会做三件事：
 *   1. 校验 token（签名 + 过期）
 *   2. 从数据库现查用户状态与账本
 *   3. 把 { userId, user, ledgerId, ledger } 挂到 req.auth
 *
 * 为什么第 2 步要查库，而不是把信息塞进 token：
 *   token 30 天不过期，期间用户可能被停用、账本可能被归档或转让。
 *   如果授权信息来自 token 本身，这些变化要等 token 过期才生效 ——
 *   等于把「封号」和「收回权限」推迟了一个月。
 *
 * 多租户隔离的落点：**所有 service 层 SQL 都必须用 req.auth.ledgerId 过滤**。
 * 这是本项目的安全底线（PRD 第 11 章把「越权查看他人账本」列为高危风险）。
 */

const auth = require('../auth');
const db = require('../db');
const config = require('../config');
const { isDemoAccount } = require('../utils/demo-account');
const { ApiError } = require('./errors');

/** 用户状态码，与 01_schema.sql 的 user.status 注释一致。 */
const USER_STATUS = { ACTIVE: 1, DISABLED: 2, CANCELLED: 3 };
let dailyActiveUnavailable = false;

async function loadAuthContext(userId) {
  const user = await db.queryOne(
    `SELECT id, uid, phone, email, display_name, avatar_url, status, token_version, created_at
       FROM \`user\` WHERE id = ?`,
    [userId]
  );

  if (!user) {
    throw ApiError.unauthorized('账号不存在，请重新登录', 'USER_NOT_FOUND');
  }
  if (Number(user.status) === USER_STATUS.DISABLED) {
    throw ApiError.forbidden('账号已停用', 'USER_DISABLED');
  }
  if (Number(user.status) === USER_STATUS.CANCELLED) {
    throw ApiError.forbidden('账号已注销', 'USER_CANCELLED');
  }

  // V1.0 每个用户恰好一个 personal 账本。这里仍然按「取默认的那一个」来查，
  // 而不是假设 id 唯一 —— 将来支持多账本时，这段不需要改。
  const ledger = await db.queryOne(
    `SELECT id, owner_id, name, type, currency, is_default, created_at
       FROM ledger
      WHERE owner_id = ? AND is_archived = 0
      ORDER BY is_default DESC, id ASC
      LIMIT 1`,
    [userId]
  );

  if (!ledger) {
    // 正常流程下不会发生（注册时会建账本）。出现说明数据被手工改过。
    throw ApiError.forbidden('账号下没有可用账本，请联系支持', 'LEDGER_NOT_FOUND');
  }

  return {
    userId: Number(user.id),
    tokenVersion: Number(user.token_version),
    user: {
      id: Number(user.id),
      uid: user.uid,
      phone: user.phone,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
    ledgerId: Number(ledger.id),
    ledger: {
      id: Number(ledger.id),
      name: ledger.name,
      type: ledger.type,
      currency: ledger.currency,
      isDefault: Number(ledger.is_default) === 1,
    },
  };
}

async function requireAuth(req, res, next) {
  const token = auth.extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('请先登录', 'TOKEN_MISSING');
  }

  const decoded = auth.verifyToken(token);
  req.auth = await loadAuthContext(decoded.userId);
  if (decoded.tokenVersion !== req.auth.tokenVersion) {
    throw ApiError.unauthorized('登录凭证已失效，请重新登录', 'TOKEN_REVOKED');
  }
  req.token = token;

  // 演示账号凭据公开在客户端，只允许读取与退出登录。否则任意访客都能删除流水、
  // 归档分类或改掉公共演示数据，后续体验者看到的就不再是稳定样例。
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase());
  const requestPath = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  const isLogout = req.method === 'POST' && requestPath.endsWith('/auth/logout');
  if (config.demoAccountProtected && isDemoAccount(req.auth.user) && !safeMethod && !isLogout) {
    throw ApiError.forbidden('演示账号仅供浏览，不允许修改共享演示数据', 'DEMO_ACCOUNT_READ_ONLY');
  }

  // 后台看板的 DAU / 留存数据源：每天每人一行，不记录页面路径和财务内容。
  // 后台表未迁移或 mz_app 尚未授权时采用降级策略，不影响用户正常记账。
  if (!dailyActiveUnavailable) {
    try {
      await db.query(
        `INSERT INTO user_daily_active (user_id, active_date, request_count)
         VALUES (?, CURDATE(), 1)
         ON DUPLICATE KEY UPDATE request_count = request_count + 1`,
        [req.auth.userId]
      );
    } catch (err) {
      if (['ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR'].includes(err.code)) {
        dailyActiveUnavailable = true;
        console.warn('[activity] 日活表不可用，已降级为不记录：', err.code);
      } else {
        throw err;
      }
    }
  }

  // 滑动续期：接近过期的 token 顺手换一张，通过响应头下发。
  // 用响应头而不是响应体，是为了不动 data 的形状 —— 前端 api.js 里
  // 一处拦截即可，各页面代码完全无感。
  if (auth.needsRenewal(decoded.issuedAt)) {
    res.set('X-Refreshed-Token', auth.signToken(decoded.userId, req.auth.tokenVersion));
    res.set('Access-Control-Expose-Headers', 'X-Refreshed-Token');
  }

  next();
}

module.exports = { requireAuth, loadAuthContext, USER_STATUS };
