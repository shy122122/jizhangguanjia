'use strict';

/**
 * 公共演示账号的安全边界。
 *
 * 演示账号凭据会展示在客户端，因此任何人都能登录。它可以用于体验业务数据，
 * 但不能改密码、重置密码或永久注销，否则一个访客就能让所有人无法继续体验。
 */

const config = require('../config');
const { ApiError } = require('../middleware/errors');

const DEMO_EMAIL = 'demo@mingzhang.app';

function isDemoAccount(user) {
  return Boolean(user && String(user.email || '').trim().toLowerCase() === DEMO_EMAIL);
}

function assertDemoAccountMutable(user, action = '执行此操作') {
  if (config.demoAccountProtected && isDemoAccount(user)) {
    throw ApiError.forbidden(`演示账号不允许${action}`, 'DEMO_ACCOUNT_PROTECTED');
  }
}

module.exports = { DEMO_EMAIL, isDemoAccount, assertDemoAccountMutable };
