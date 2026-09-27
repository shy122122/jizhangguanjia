'use strict';

/**
 * 配置集中出口。读 .env → 校验 → 导出冻结对象。
 *
 * 设计取舍：宁可在启动时大声报错，也不要在运行到某个接口时才失败。
 * 因此这里对 JWT_SECRET / 数据库密码做了启动期校验。
 */

const path = require('path');

// 显式指定 .env 路径，而不是依赖 process.cwd()：
// 从仓库根目录跑 node 时 cwd 不是 backend/，用默认行为会静默读不到配置。
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const ROOT = path.resolve(__dirname, '..');

/** 把 '30d' / '12h' / '45m' / '30s' 解析成毫秒；纯数字按秒处理。 */
function parseDuration(input, fieldName) {
  if (input == null || input === '') return null;
  const m = String(input).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) throw new Error(`${fieldName} 格式无法识别：${input}（应形如 30d / 12h / 45m）`);
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * factor;
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

const smsDevMode =
  process.env.SMS_DEV_MODE == null
    ? appEnv !== 'production'
    : String(process.env.SMS_DEV_MODE).toLowerCase() === 'true';
if (appEnv === 'production' && smsDevMode) {
  throw new Error('生产环境禁止启用 SMS_DEV_MODE；请关闭验证码回显并接入真实短信网关。');
}

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  throw new Error('TRUST_PROXY_HOPS 必须是 0-10 的整数；直连用 0，单层 Nginx/网关用 1。');
}

// 前端目录：相对路径按后端项目根目录解析。前后端已拆分到同级目录，
// 所以只做 resolve，不做任何字符串拼接或 URL 编码。
const frontendDir = path.resolve(
  ROOT,
  process.env.FRONTEND_DIR || '../前端代码（前端工程师）/fronted/整理版'
);

const config = {
  env: appEnv,
  port: Number(process.env.PORT || 3000),
  trustProxyHops,
  root: ROOT,

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: required('DB_NAME', process.env.DB_NAME),
    poolSize: Number(process.env.DB_POOL_SIZE || 10),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    expiresMs: parseDuration(process.env.JWT_EXPIRES_IN || '30d', 'JWT_EXPIRES_IN'),
    renewAfterMs: parseDuration(process.env.JWT_RENEW_AFTER || '1d', 'JWT_RENEW_AFTER'),
  },

  smsDevMode,

  // 公共演示账号凭据会暴露在客户端，默认禁止改密、重置密码和永久注销。
  // 仅自动化测试可显式关闭；生产与普通开发环境都应保持开启。
  demoAccountProtected:
    String(process.env.DEMO_ACCOUNT_PROTECTED ?? 'true').toLowerCase() !== 'false',

  frontendDir,
};

// 业务上锁定的时区。数据库、Node、前端展示三层都用它，避免「今日」算错。
config.timezone = '+08:00';
config.timezoneOffsetMs = 8 * 3_600_000;

module.exports = Object.freeze(config);
