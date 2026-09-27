'use strict';

/**
 * 配置集中出口。读 .env → 校验 → 导出冻结对象。
 *
 * 与 C 端 config.js 的差异只有两处，都是后台特有的：
 *   1. JWT 密钥必须与 C 端不同 —— 见下面 assertNotSharedSecret 的说明。
 *   2. 多了一个 RESET_PASSWORD_DEV_MODE（PRD 待定问题 #1 的临时方案）。
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const ROOT = path.resolve(__dirname, '..');

/** '8h' / '30d' / '45m' / '30s' → 毫秒；纯数字按秒处理。 */
function parseDuration(input, fieldName) {
  if (input == null || input === '') return null;
  const m = String(input).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) throw new Error(`${fieldName} 格式无法识别：${input}（应形如 8h / 30d / 45m）`);
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
}

function required(name, value) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`缺少环境变量 ${name}。请从 .env.example 复制一份 .env 并填写。`);
  }
  return String(value).trim();
}

const dbPassword = required('DB_PASSWORD', process.env.DB_PASSWORD);
const jwtSecret = required('JWT_SECRET', process.env.JWT_SECRET);
const appEnv = process.env.NODE_ENV || 'development';

if (dbPassword.startsWith('请填写') || jwtSecret.startsWith('请替换')) {
  throw new Error('检测到 .env 仍是 .env.example 的占位值，请先把 DB_PASSWORD / JWT_SECRET 改成真实值。');
}
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET 至少需要 32 个字符，建议使用 48 字节随机值。');
}

/**
 * C 端的 JWT_SECRET 如果和后台相同，两个系统的 token 就能互相解通 ——
 * 而 PRD 3.1 要求「C 端 token 调后台接口必须被拒，反向也必须被拒」。
 * 密钥相同并不会直接放行（后台中间件还会校验 scope），但那是**只靠一层代码**在兜。
 * 让密钥本身就不同，等于把这条约束下沉到密码学层面，成本为零。
 *
 * 这里只在显式配置了 C 端密钥路径时才检查，避免把 C 端 .env 变成后台的硬依赖。
 */
function assertNotSharedSecret() {
  const cEndEnv = process.env.C_END_ENV_FILE;
  if (!cEndEnv) return;
  try {
    const fs = require('fs');
    const text = fs.readFileSync(cEndEnv, 'utf8');
    const m = text.match(/^\s*JWT_SECRET\s*=\s*(.+)$/m);
    if (m && m[1].trim() === jwtSecret) {
      throw new Error(
        '后台的 JWT_SECRET 与 C 端相同。PRD 3.1 要求两套 token 完全隔离，请改成不同的随机值。'
      );
    }
  } catch (err) {
    if (err.message.includes('PRD 3.1')) throw err;
    // 读不到文件（路径写错、权限不足）只警告，不阻断启动。
    console.warn('[config] 无法读取 C_END_ENV_FILE 做密钥比对：', err.message);
  }
}
assertNotSharedSecret();

const resetPasswordDevMode =
  process.env.RESET_PASSWORD_DEV_MODE == null
    ? appEnv !== 'production'
    : String(process.env.RESET_PASSWORD_DEV_MODE).toLowerCase() === 'true';
if (appEnv === 'production' && resetPasswordDevMode) {
  throw new Error(
    '生产环境禁止启用 RESET_PASSWORD_DEV_MODE：临时密码不允许出现在接口响应里，应走短信/邮件自助重置。'
  );
}

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  throw new Error('TRUST_PROXY_HOPS 必须是 0-10 的整数；直连用 0，单层 Nginx 用 1。');
}

// 前端目录路径含中文与空格，只做 resolve，不做字符串拼接或 URL 编码。
const frontendDir = path.resolve(ROOT, process.env.FRONTEND_DIR || '../frontend');

const config = {
  env: appEnv,
  port: Number(process.env.PORT || 3001),
  trustProxyHops,
  root: ROOT,

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'mz_admin',
    password: dbPassword,
    database: required('DB_NAME', process.env.DB_NAME),
    poolSize: Number(process.env.DB_POOL_SIZE || 10),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    expiresMs: parseDuration(process.env.JWT_EXPIRES_IN || '8h', 'JWT_EXPIRES_IN'),
    renewAfterMs: parseDuration(process.env.JWT_RENEW_AFTER || '1h', 'JWT_RENEW_AFTER'),
    /** PRD 3.1：后台 token 必须带这个标记，与 C 端 token 区分开。 */
    scope: 'admin',
  },

  resetPassword: {
    devMode: resetPasswordDevMode,
    ttlMinutes: Number(process.env.RESET_PASSWORD_TTL_MINUTES || 30),
  },

  frontendDir,
};

// 业务上锁定的时区。数据库、Node、前端三层都用它，避免「今天」算错。
config.timezone = '+08:00';
config.timezoneOffsetMs = 8 * 3_600_000;

module.exports = Object.freeze(config);
