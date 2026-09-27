'use strict';

/**
 * 注册 / 登录 / 验证码。
 *
 * 这一层是**唯一**会碰 `user.password_hash` 和登录计数字段的地方；
 * 纯密码学逻辑在 src/auth.js（不碰库），这里只负责流程与事务。
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const auth = require('../auth');
const validate = require('../utils/validate');
const period = require('../utils/period');
const { assertDemoAccountMutable } = require('../utils/demo-account');
const { ApiError } = require('../middleware/errors');
const { loadAuthContext, USER_STATUS } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// 短信验证码
//
// V1.0 没有接短信网关，验证码存在进程内存里。这有三个已知局限，
// 都属于「本地演示可接受、上线前必须换掉」：
//   1. 重启即失效
//   2. 多进程部署时各自的 Map 不共享（本机单进程无此问题）
//   3. IP 限流只保存在单进程内存中，多实例部署时必须迁移到 Redis 等共享存储
// 换真实网关时，把 sendSmsCode 的下半段换成厂家的 SDK 调用即可，
// 校验逻辑（verifySmsCode）不需要动。
// ---------------------------------------------------------------------------

const SMS_TTL_MS = 5 * 60 * 1000;
const SMS_RESEND_MS = 60 * 1000;
const SMS_MAX_VERIFY_ATTEMPTS = 5;
const SMS_IP_WINDOW_MS = 10 * 60 * 1000;
const SMS_IP_MAX_SENDS = 10;
const smsCodes = new Map();
const smsIpLimits = new Map();
const LOGIN_IP_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_IP_MAX_ATTEMPTS = 30;
const loginIpLimits = new Map();

function checkWindowLimit(store, key, { now, windowMs, max, code, message }) {
  if (store.size > 10_000) {
    for (const [storedKey, limit] of store) {
      if (now - limit.startedAt >= windowMs) store.delete(storedKey);
    }
  }
  const current = store.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    store.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= max) throw new ApiError(429, code, message);
  current.count += 1;
}

function checkSmsIpLimit(ip) {
  const key = String(ip || 'unknown');
  const now = Date.now();
  checkWindowLimit(smsIpLimits, key, {
    now,
    windowMs: SMS_IP_WINDOW_MS,
    max: SMS_IP_MAX_SENDS,
    code: 'SMS_IP_RATE_LIMITED',
    message: '验证码请求过于频繁，请稍后再试',
  });
}

function checkLoginIpLimit(ip) {
  checkWindowLimit(loginIpLimits, String(ip || 'unknown'), {
    now: Date.now(),
    windowMs: LOGIN_IP_WINDOW_MS,
    max: LOGIN_IP_MAX_ATTEMPTS,
    code: 'LOGIN_IP_RATE_LIMITED',
    message: '登录尝试过于频繁，请稍后再试',
  });
}

function sendSmsCode(phone, { ip } = {}) {
  const p = validate.phoneOf(phone);

  if (!config.smsDevMode) {
    // 没接网关就如实说，不要假装发成功了骗用户等短信。
    throw ApiError.notImplemented(
      '短信服务尚未接入，请联系管理员',
      'SMS_NOT_CONFIGURED'
    );
  }

  checkSmsIpLimit(ip);

  const now = Date.now();
  if (smsCodes.size > 10_000) {
    for (const [storedPhone, entry] of smsCodes) {
      if (now > entry.expiresAt) smsCodes.delete(storedPhone);
    }
  }
  const existing = smsCodes.get(p);
  if (existing && now < existing.nextSendAt) {
    const wait = Math.ceil((existing.nextSendAt - now) / 1000);
    throw new ApiError(429, 'SMS_TOO_FREQUENT', `发送过于频繁，请 ${wait} 秒后再试`);
  }

  const code = String(crypto.randomInt(100000, 1000000));
  smsCodes.set(p, {
    code,
    attempts: 0,
    expiresAt: now + SMS_TTL_MS,
    nextSendAt: now + SMS_RESEND_MS,
  });

  const payload = { phone: p, expiresInSeconds: SMS_TTL_MS / 1000 };
  // dev 模式把验证码直接回显在响应里 —— 否则本地根本走不完注册流程。
  if (config.smsDevMode) payload.devCode = code;
  return payload;
}

function verifySmsCode(phone, code) {
  const entry = smsCodes.get(phone);
  if (!entry || Date.now() > entry.expiresAt) {
    throw ApiError.badRequest('验证码已过期，请重新获取', 'SMS_CODE_EXPIRED');
  }
  const expected = Buffer.from(entry.code);
  const actual = Buffer.from(String(code));
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!matches) {
    entry.attempts += 1;
    if (entry.attempts >= SMS_MAX_VERIFY_ATTEMPTS) {
      smsCodes.delete(phone);
      throw new ApiError(429, 'SMS_CODE_ATTEMPTS_EXCEEDED', '验证码错误次数过多，请重新获取');
    }
    throw ApiError.badRequest('验证码不正确', 'SMS_CODE_INVALID');
  }
  smsCodes.delete(phone); // 一次性，用过即焚
}

// ---------------------------------------------------------------------------
// 新用户的默认分类与账户模板
//
// 为什么放在代码里而不是查库：category / account 都是 **ledger 级** 的
// （见 01_schema.sql 的 fk_category_ledger），种子脚本里那份属于演示账本，
// 新用户不能共用。02_seed.sql 末尾的注释也是这么说的 ——
// 「默认分类与账户应当在【用户注册时】按模板复制」。
// 所以模板的权威定义在这里，02_seed.sql 只是把同一份数据灌给演示账本。
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  ['餐饮美食', 'expense', 'restaurant', '#14B8A6'],
  ['交通出行', 'expense', 'directions_subway', '#06B6D4'],
  ['日用百货', 'expense', 'shopping_bag', '#0EA5E9'],
  ['居家生活', 'expense', 'home', '#6366F1'],
  ['休闲娱乐', 'expense', 'sports_esports', '#8B5CF6'],
  ['医疗保健', 'expense', 'medical_services', '#EC4899'],
  ['学习进修', 'expense', 'menu_book', '#F43F5E'],
  ['通讯', 'expense', 'cell_tower', '#F59E0B'],
  ['人情往来', 'expense', 'redeem', '#84CC16'],
  ['其他', 'expense', 'more_horiz', '#64748B'],
  ['工资', 'income', 'payments', '#14B8A6'],
  ['奖金', 'income', 'card_giftcard', '#06B6D4'],
  ['兼职', 'income', 'work', '#0EA5E9'],
  ['投资收益', 'income', 'trending_up', '#6366F1'],
  ['红包', 'income', 'redeem', '#8B5CF6'],
  ['其他', 'income', 'more_horiz', '#64748B'],
];

// 每行：名称 / 类型 / 图标 / 颜色 / 初始余额 / 信用授信 / 待还 / 尾号
// 初始余额一律 0：新用户还没录过任何账，给个 500 会让「总资产」凭空多出来。
// 演示账本里现金是 500.00，那是 02_seed.sql 为了让截图好看，不适用于真实注册。
const DEFAULT_ACCOUNTS = [
  ['现金', 'cash', 'payments', '#64748B', '0.00', null, null, null],
  ['微信支付钱包', 'wechat', 'chat', '#07C160', '0.00', null, null, null],
  ['支付宝', 'alipay', 'account_balance_wallet', '#1677FF', '0.00', null, null, null],
  ['储蓄卡', 'bank', 'account_balance', '#E11D48', '0.00', null, null, null],
  ['信用卡', 'credit', 'credit_card', '#7C3AED', '0.00', '20000.00', null, null],
];

const UID_WORDS = [
  'CLARITY', 'LUMEN', 'ORBIT', 'NIMBUS', 'ZENITH', 'HARBOR',
  'QUARTZ', 'VERTEX', 'AURORA', 'CINDER', 'MAPLE', 'SABLE',
];

function hex4() {
  return Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
}

/** 形如 9402-8841-CLARITY。对外的账号标识，与 id 无关。 */
function generateUid() {
  const word = UID_WORDS[Math.floor(Math.random() * UID_WORDS.length)];
  return `${hex4()}-${hex4()}-${word}`;
}

// ---------------------------------------------------------------------------

async function register({ phone, code, password, displayName, email }) {
  const p = validate.phoneOf(phone);
  const codeText = validate.smsCodeOf(code);
  const pwd = validate.passwordOf(password);
  const mail = validate.emailOf(email, { required: false });
  const name =
    validate.optionalStr(displayName, '昵称', { max: 50 }) || `用户${p.slice(-4)}`;

  verifySmsCode(p, codeText);

  const dup = await db.queryOne(
    `SELECT id FROM \`user\`
      WHERE phone = ? ${mail ? 'OR email = ?' : ''} LIMIT 1`,
    mail ? [p, mail] : [p]
  );
  if (dup) throw ApiError.conflict('该手机号或邮箱已注册，请直接登录', 'ACCOUNT_EXISTS');

  const passwordHash = await auth.hashPassword(pwd);

  const { userId, ledgerId } = await db.transaction(async (conn) => {
    let newUserId = null;
    for (let attempt = 0; attempt < 5 && !newUserId; attempt += 1) {
      try {
        const [ins] = await conn.query(
          `INSERT INTO \`user\`
             (\`uid\`, \`phone\`, \`email\`, \`password_hash\`, \`display_name\`, \`status\`)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [generateUid(), p, mail, passwordHash, name]
        );
        newUserId = ins.insertId;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        // 撞的是 uid 还是手机号？手机号撞了就没必要重试。
        const [taken] = await conn.query('SELECT id FROM `user` WHERE phone = ? LIMIT 1', [p]);
        if (taken.length > 0) {
          throw ApiError.conflict('该手机号已注册，请直接登录', 'ACCOUNT_EXISTS');
        }
      }
    }
    if (!newUserId) {
      throw ApiError.conflict('账号创建冲突，请稍后重试', 'UID_CONFLICT');
    }

    const [ledgerIns] = await conn.query(
      `INSERT INTO \`ledger\` (\`owner_id\`, \`name\`, \`type\`, \`currency\`, \`is_default\`)
       VALUES (?, '日常个人账本', 'personal', 'CNY', 1)`,
      [newUserId]
    );
    const newLedgerId = ledgerIns.insertId;

    await conn.query(
      `INSERT INTO \`user_preference\`
         (\`user_id\`, \`theme\`, \`language\`, \`currency\`, \`sound_enabled\`, \`default_ledger_id\`)
       VALUES (?, 'system', 'zh-CN', 'CNY', 1, ?)`,
      [newUserId, newLedgerId]
    );

    // 分类模板由运营后台维护。后台表尚未迁移或运行账号尚未授权时，仍使用
    // 代码常量兜底，避免注册链路因管理端故障而不可用。
    let categoryTemplates = [];
    try {
      [categoryTemplates] = await conn.query(
        `SELECT name, type, icon, color, sort_order
           FROM category_template WHERE is_enabled = 1 ORDER BY type, sort_order, id`
      );
    } catch (err) {
      if (!['ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR'].includes(err.code)) throw err;
    }
    const catValues = categoryTemplates.length
      ? categoryTemplates.map((x) => [newLedgerId, x.name, x.type, x.icon, x.color, x.sort_order, 1])
      : DEFAULT_CATEGORIES.map(([n, t, icon, color], i) => [
          newLedgerId, n, t, icon, color, t === 'expense' ? i + 1 : i - 9, 1,
        ]);
    await conn.query(
      `INSERT INTO \`category\`
         (\`ledger_id\`, \`name\`, \`type\`, \`icon\`, \`color\`, \`sort_order\`, \`is_system\`)
       VALUES ?`,
      [catValues]
    );

    let accountTemplates = [];
    try {
      [accountTemplates] = await conn.query(
        `SELECT name, type, icon, color, initial_balance, credit_limit, bill_due, card_tail,
                is_default, sort_order
           FROM account_template WHERE is_enabled = 1 ORDER BY sort_order, id`
      );
    } catch (err) {
      if (!['ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR'].includes(err.code)) throw err;
    }
    const accValues = accountTemplates.length
      ? accountTemplates.map((x) => [newLedgerId, x.name, x.type, x.icon, x.color,
          x.initial_balance, x.credit_limit, x.bill_due, x.card_tail, x.is_default, x.sort_order])
      : DEFAULT_ACCOUNTS.map(([n, t, icon, color, init, limit, bill, tail], i) => [
          newLedgerId, n, t, icon, color, init, limit, bill, tail,
          i === 0 ? 1 : 0, i + 1,
        ]);
    await conn.query(
      `INSERT INTO \`account\`
         (\`ledger_id\`, \`name\`, \`type\`, \`icon\`, \`color\`, \`initial_balance\`,
          \`credit_limit\`, \`bill_due\`, \`card_tail\`, \`is_default\`, \`sort_order\`)
       VALUES ?`,
      [accValues]
    );

    return { userId: Number(newUserId), ledgerId: Number(newLedgerId) };
  });

  return issueSession(userId);
}

/**
 * locked_until 存的是 UTC+8 的墙上时间字符串。
 * 把它当 UTC 解析得到的是「假 epoch」，减去 8 小时偏移才是真实时间点。
 */
function lockRemainingMinutes(lockedUntil) {
  const lockEpoch = Date.parse(`${String(lockedUntil).replace(' ', 'T')}Z`) - config.timezoneOffsetMs;
  return Math.max(1, Math.ceil((lockEpoch - Date.now()) / 60000));
}

/** 登录态：一张 token + 一份完整身份上下文。三条登录路径共用。 */
async function issueSession(userId) {
  const ctx = await loadAuthContext(userId);
  return { token: auth.signToken(userId, ctx.tokenVersion), ...ctx };
}

/**
 * 手机号 + 验证码登录（PRD 4.1.2 的第一种登录方式，也是记账类 App 的主流入口）。
 *
 * 与密码登录的两点不同：
 *   1. 不计失败次数、不看 locked_until —— 能收到验证码就证明手机在本人手里，
 *      没必要因为密码输错把人挡在门外。成功时顺手把锁定状态清掉。
 *   2. **不会自动注册**。原型上那句「无需事先注册」是占位文案，实际不做：
 *      user.password_hash 是 NOT NULL，凭空建一个「自己都不知道密码」的账号会
 *      绕过明确的注册确认流程。所以这里回 404，引导去注册；已注册用户可另走
 *      手机验证码找回密码。
 */
async function loginByCode({ phone, code }) {
  const p = validate.phoneOf(phone);
  const codeText = validate.smsCodeOf(code);

  // 先校验验证码再查账号：反过来的话，接口会变成一个
  // 「这个手机号注册过没有」的探测器，而验证码是这道门唯一的锁。
  verifySmsCode(p, codeText);

  const user = await db.queryOne(
    `SELECT id, status, login_fail_count FROM \`user\` WHERE phone = ?`,
    [p]
  );
  if (!user) {
    throw ApiError.notFound('该手机号还没有账号，请先注册', 'ACCOUNT_NOT_FOUND');
  }

  if (Number(user.status) === USER_STATUS.DISABLED) {
    throw ApiError.forbidden('账号已停用，请联系支持', 'USER_DISABLED');
  }
  if (Number(user.status) === USER_STATUS.CANCELLED) {
    throw ApiError.forbidden('账号已注销', 'USER_CANCELLED');
  }

  await db.query(
    `UPDATE \`user\`
        SET login_fail_count = 0, locked_until = NULL, last_login_at = ?
      WHERE id = ?`,
    [period.nowDateTime(), user.id]
  );

  return issueSession(Number(user.id));
}

async function login({ account, password, ip }) {
  const raw = String(account ?? '').trim();
  if (!raw) throw ApiError.badRequest('请输入手机号或邮箱', 'MISSING_FIELD', { field: 'account' });
  const pwd = String(password ?? '');
  if (!pwd) throw ApiError.badRequest('请输入密码', 'MISSING_FIELD', { field: 'password' });
  checkLoginIpLimit(ip);

  const byEmail = raw.includes('@');
  const user = await db.queryOne(
    `SELECT id, uid, phone, email, password_hash, display_name, avatar_url, status,
            login_fail_count, locked_until
       FROM \`user\`
      WHERE ${byEmail ? 'email' : 'phone'} = ?`,
    [byEmail ? raw.toLowerCase() : raw]
  );

  // 用户不存在也要烧掉一次 bcrypt 的时间，否则响应快慢就成了
  // 「这个邮箱注册过没有」的探测器。
  if (!user) {
    await auth.burnTime(pwd);
    throw ApiError.unauthorized('账号或密码不正确', 'LOGIN_FAILED');
  }

  // 顺序很关键：先看锁，再比密码。
  // 反过来的话，锁定期间狂试密码会不断刷新计数，等于永久锁不上。
  const nowWall = period.nowDateTime();
  if (user.locked_until && String(user.locked_until) > nowWall) {
    const minutes = lockRemainingMinutes(String(user.locked_until));
    throw ApiError.locked(
      `密码连续输错次数过多，账号已锁定，请 ${minutes} 分钟后再试`,
      'ACCOUNT_LOCKED'
    );
  }

  const passwordOk = await auth.verifyPassword(pwd, user.password_hash);
  if (!passwordOk) {
    // 原子递增，避免多个并发错误请求都读到同一个旧值、互相覆盖，从而绕过锁定。
    await db.query(
      'UPDATE `user` SET locked_until = CASE ' +
        'WHEN login_fail_count + 1 >= ? THEN DATE_ADD(?, INTERVAL ? MINUTE) ' +
        'ELSE locked_until END, login_fail_count = login_fail_count + 1 WHERE id = ?',
      [auth.MAX_LOGIN_FAILS, nowWall, auth.LOCK_MINUTES, user.id]
    );
    const failedState = await db.queryOne(
      'SELECT login_fail_count, locked_until FROM `user` WHERE id = ?',
      [user.id]
    );
    const fails = Number(failedState.login_fail_count);
    if (fails >= auth.MAX_LOGIN_FAILS) {
      throw ApiError.locked(
        `密码连续输错 ${auth.MAX_LOGIN_FAILS} 次，账号已锁定 ${auth.LOCK_MINUTES} 分钟`,
        'ACCOUNT_LOCKED'
      );
    }
    throw ApiError.unauthorized(
      `账号或密码不正确，还可尝试 ${auth.MAX_LOGIN_FAILS - fails} 次`,
      'LOGIN_FAILED'
    );
  }

  // 账号状态在密码正确之后才判 —— 否则输错密码也能探出「这个号被停用了」。
  if (Number(user.status) === USER_STATUS.DISABLED) {
    throw ApiError.forbidden('账号已停用，请联系支持', 'USER_DISABLED');
  }
  if (Number(user.status) === USER_STATUS.CANCELLED) {
    throw ApiError.forbidden('账号已注销', 'USER_CANCELLED');
  }

  await db.query(
    `UPDATE \`user\`
        SET login_fail_count = 0, locked_until = NULL, last_login_at = ?
      WHERE id = ?`,
    [nowWall, user.id]
  );

  return issueSession(Number(user.id));
}

/** 手机验证码找回密码；成功后吊销该账号全部旧 JWT，并清除登录锁定。 */
async function resetPassword({ phone, code, newPassword }) {
  const p = validate.phoneOf(phone);
  const codeText = validate.smsCodeOf(code);
  const password = validate.passwordOf(newPassword, '新密码');

  // 先验证手机控制权再查询账号，避免把接口变成手机号注册状态探测器。
  verifySmsCode(p, codeText);
  const user = await db.queryOne('SELECT id, email, status FROM `user` WHERE phone = ?', [p]);
  if (!user) {
    throw ApiError.notFound('该手机号还没有账号，请先注册', 'ACCOUNT_NOT_FOUND');
  }
  if (Number(user.status) !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('账号当前不可用，请联系支持', 'USER_UNAVAILABLE');
  }
  assertDemoAccountMutable(user, '重置密码');

  const passwordHash = await auth.hashPassword(password);
  await db.query(
    `UPDATE \`user\`
        SET password_hash = ?, token_version = token_version + 1,
            login_fail_count = 0, locked_until = NULL
      WHERE id = ?`,
    [passwordHash, user.id]
  );
  return { passwordReset: true, allSessionsRevoked: true };
}

/** 退出登录时递增版本号，立即吊销该账号此前签发的全部 JWT。 */
async function logout(userId) {
  await db.query('UPDATE `user` SET `token_version` = `token_version` + 1 WHERE id = ?', [userId]);
  return { loggedOut: true, allSessionsRevoked: true };
}

async function getMe(userId) {
  return loadAuthContext(userId);
}

/** 停用账号但保留数据，适用于需要保留财务记录的场景。 */
async function deactivate(userId) {
  await db.query(
    'UPDATE `user` SET status = ?, token_version = token_version + 1 WHERE id = ?',
    [USER_STATUS.DISABLED, userId]
  );
  return { status: USER_STATUS.DISABLED };
}

/**
 * 永久注销并删除 V1.0 个人账本数据。敏感操作必须重新验证密码，并要求输入 DELETE。
 * 先删账本触发业务数据级联，再删用户；整段放在事务里，避免留下半套数据。
 */
async function deleteAccount(userId, body) {
  if (String(body.confirmText ?? '') !== 'DELETE') {
    throw ApiError.badRequest('请输入 DELETE 确认永久注销', 'DELETE_CONFIRMATION_REQUIRED', {
      field: 'confirmText',
    });
  }
  const password = validate.existingPasswordOf(body.password, '当前密码');
  const user = await db.queryOne('SELECT email, password_hash FROM `user` WHERE id = ?', [userId]);
  if (!user) throw ApiError.notFound('账号不存在', 'USER_NOT_FOUND');
  assertDemoAccountMutable(user, '永久注销');
  if (!(await auth.verifyPassword(password, user.password_hash))) {
    throw ApiError.badRequest('当前密码不正确', 'INVALID_PASSWORD', { field: 'password' });
  }

  // V1.0 不开放共享账本，但表结构已经预留。若未来用户曾在他人账本记账，
  // 直接删 user 会触发外键失败；更不能擅自删除属于他人的共享账本流水。
  const sharedReference = await db.queryOne(
    `SELECT
       (SELECT COUNT(*) FROM \`transaction\` t JOIN ledger l ON l.id = t.ledger_id
         WHERE t.created_by = ? AND l.owner_id <> ?) AS transaction_count,
       (SELECT COUNT(*) FROM import_batch b JOIN ledger l ON l.id = b.ledger_id
         WHERE b.created_by = ? AND l.owner_id <> ?) AS batch_count`,
    [userId, userId, userId, userId]
  );
  if (Number(sharedReference.transaction_count) > 0 || Number(sharedReference.batch_count) > 0) {
    throw ApiError.conflict(
      '账号在共享账本中仍有记录，暂不能自动永久删除，请先退出或转移共享数据',
      'SHARED_LEDGER_DATA_EXISTS'
    );
  }

  await db.transaction(async (conn) => {
    await conn.query('DELETE FROM `event_log` WHERE `user_id` = ?', [userId]);
    await conn.query('DELETE FROM `ledger` WHERE `owner_id` = ?', [userId]);
    await conn.query('DELETE FROM `user` WHERE `id` = ?', [userId]);
  });
  return { deleted: true };
}

module.exports = {
  sendSmsCode,
  register,
  login,
  loginByCode,
  resetPassword,
  logout,
  getMe,
  deactivate,
  deleteAccount,
};
