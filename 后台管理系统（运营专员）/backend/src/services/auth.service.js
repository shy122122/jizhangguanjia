'use strict';

const db = require('../db');
const auth = require('../auth');
const period = require('../utils/period');
const validate = require('../utils/validate');
const audit = require('./audit.service');
const { ApiError } = require('../middleware/errors');

function minutesLeft(value) {
  const epoch = Date.parse(`${String(value).replace(' ', 'T')}+08:00`);
  return Math.max(1, Math.ceil((epoch - Date.now()) / 60000));
}

async function login(body, ip) {
  const username = validate.str(body.username, '用户名', { max: 50 });
  const password = validate.str(body.password, '密码', { max: 200 });
  const row = await db.queryOne('SELECT * FROM admin_user WHERE username = ?', [username]);
  if (!row) { await auth.burnTime(password); throw ApiError.unauthorized('用户名或密码不正确', 'LOGIN_FAILED'); }
  const now = period.nowDateTime();
  if (row.locked_until && String(row.locked_until) > now) {
    throw ApiError.locked(`登录失败次数过多，请 ${minutesLeft(row.locked_until)} 分钟后重试`, 'ACCOUNT_LOCKED');
  }
  const passwordOk = await auth.verifyPassword(password, row.password_hash);
  if (!passwordOk) {
    await db.transaction(async (conn) => {
      await conn.query(
        `UPDATE admin_user SET login_fail_count = login_fail_count + 1,
          locked_until = CASE WHEN login_fail_count + 1 >= ? THEN DATE_ADD(?, INTERVAL ? MINUTE) ELSE locked_until END
          WHERE id = ?`, [auth.MAX_LOGIN_FAILS, now, auth.LOCK_MINUTES, row.id]
      );
      await audit.append({ adminId: row.id, adminLabel: row.display_name, action: 'admin.login.failed',
        targetType: 'admin', targetId: row.id, targetLabel: row.username, reason: '后台登录失败', ip }, conn);
    });
    throw ApiError.unauthorized('用户名或密码不正确', 'LOGIN_FAILED');
  }
  if (Number(row.status) !== auth.ADMIN_STATUS.ACTIVE) throw ApiError.forbidden('后台账号已停用', 'ADMIN_DISABLED');
  await db.transaction(async (conn) => {
    await conn.query('UPDATE admin_user SET login_fail_count=0, locked_until=NULL, last_login_at=?, last_login_ip=? WHERE id=?', [now, ip, row.id]);
    await audit.append({ adminId: row.id, adminLabel: row.display_name, action: 'admin.login', targetType: 'admin',
      targetId: row.id, targetLabel: row.username, reason: '后台登录成功', ip }, conn);
  });
  return {
    token: auth.signToken(row.id, row.token_version),
    admin: { id: Number(row.id), username: row.username, displayName: row.display_name, lastLoginAt: now },
  };
}

async function logout(ctx, ip) {
  await db.transaction(async (conn) => {
    await conn.query('UPDATE admin_user SET token_version = token_version + 1 WHERE id = ?', [ctx.adminId]);
    await audit.append({ adminId: ctx.adminId, adminLabel: ctx.admin.displayName, action: 'admin.logout',
      targetType: 'admin', targetId: ctx.adminId, targetLabel: ctx.admin.username, reason: '主动退出后台', ip }, conn);
  });
  return { loggedOut: true };
}

module.exports = { login, logout };
