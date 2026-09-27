'use strict';

/**
 * /api/auth —— 注册、登录、验证码、当前用户。
 *
 * 路由层只做三件事：取参数 → 调 service → 套响应信封。
 * 任何 if/else 的业务判断都不该出现在这里，否则同一个规则会在
 * 「网页端」和「将来小程序端」各写一遍。
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const authService = require('../services/auth.service');
const { requireAuth } = require('../middleware/auth');
const { ApiError } = require('../middleware/errors');

const router = express.Router();

/** 登录/注册统一的返回形状：一张 token + 一份完整的身份上下文。 */
function session(session) {
  return {
    token: session.token,
    user: session.user,
    ledger: session.ledger,
  };
}

/** POST /api/auth/sms-code —— 发验证码（dev 模式直接回显） */
router.post('/sms-code', async (req, res) => {
  const body = validate.objectBody(req.body);
  const result = authService.sendSmsCode(body.phone, { ip: req.ip });
  http.ok(res, result);
});

/** POST /api/auth/register —— 手机号 + 验证码 + 密码 */
router.post('/register', async (req, res) => {
  const body = validate.objectBody(req.body);
  const result = await authService.register({
    phone: body.phone,
    code: body.code,
    password: body.password,
    displayName: body.displayName,
    email: body.email,
  });
  http.created(res, session(result));
});

/**
 * POST /api/auth/login —— 两种登录方式共用这一个入口（PRD 4.1.2）：
 *
 *   手机号 + 验证码   { phone, code }
 *   邮箱或手机号 + 密码 { account, password }
 *
 * 合在一个路由里而不是拆成 /login 与 /login-sms：对前端来说都是「提交登录表单」，
 * 拆开只会让调用方多一个 if。分流依据只看有没有传 code。
 */
router.post('/login', async (req, res) => {
  const body = validate.objectBody(req.body);
  const result =
    body.code != null
      ? await authService.loginByCode({
          phone: body.phone ?? body.account,
          code: body.code,
        })
      : await authService.login({
          account: body.account ?? body.email ?? body.phone,
          password: body.password,
          ip: req.ip,
        });
  http.ok(res, session(result));
});

/** POST /api/auth/reset-password —— 手机验证码校验通过后设置新密码。 */
router.post('/reset-password', async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(
    res,
    await authService.resetPassword({
      phone: body.phone,
      code: body.code,
      newPassword: body.newPassword,
    })
  );
});

/** GET /api/auth/me —— 当前登录态。前端刷新页面时用它确认 token 还有效。 */
router.get('/me', requireAuth, (req, res) => {
  http.ok(res, { user: req.auth.user, ledger: req.auth.ledger });
});

/** POST /api/auth/logout —— 递增令牌版本，吊销该账号全部现有 JWT。 */
router.post('/logout', requireAuth, async (req, res) => {
  http.ok(res, await authService.logout(req.auth.userId));
});

/** DELETE /api/auth/account —— 二次验密后永久删除账号及个人账本数据。 */
router.delete('/account', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await authService.deleteAccount(req.auth.userId, body));
});

/**
 * POST /api/auth/oauth/:provider —— 微信 / Apple 登录
 *
 * 当前未配置微信/Apple 开放平台凭据，user 表也没有 provider subject 字段。
 * 在回调验签、账号绑定/解绑规则明确前，不用假的 OAuth 成功响应误导前端。
 * 接入时先执行（README「第三方登录」一节有同样的 SQL）：
 *   ALTER TABLE `user` ADD COLUMN `wechat_openid` VARCHAR(64) DEFAULT NULL,
 *                       ADD UNIQUE KEY `uk_user_wechat` (`wechat_openid`);
 */
router.post('/oauth/:provider', (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!['wechat', 'apple'].includes(provider)) {
    throw ApiError.notFound(`不支持的登录方式：${provider}`, 'OAUTH_PROVIDER_UNKNOWN');
  }
  throw ApiError.notImplemented(
    `${provider} 登录尚未开放，请使用手机号或邮箱登录`,
    'OAUTH_NOT_IMPLEMENTED'
  );
});

module.exports = router;
