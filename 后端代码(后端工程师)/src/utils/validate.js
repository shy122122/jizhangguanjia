'use strict';

/**
 * 轻量参数校验。刻意不引入 zod / joi —— 需要校验的字段不到三十个，
 * 为它加一个依赖和一套 schema DSL 不划算。
 *
 * 约定：所有校验器**失败即抛 ApiError.badRequest**，所以在路由里
 * 直接 `const amount = v.amountOf(req.body.amount)` 即可，不需要写 if。
 *
 * 注意这一层不是安全边界（数据库的 9 条 CHECK 才是），它存在的意义是
 * 给出**具体到字段**的中文提示，而不是让用户看到一句笼统的
 * 「数据不符合业务规则」。
 */

const { ApiError } = require('../middleware/errors');
const money = require('./money');

function fail(message, code, details) {
  throw ApiError.badRequest(message, code, details);
}

/** 请求体必须是对象（express.json 对空体会给 {}）。 */
function objectBody(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    fail('请求体应为 JSON 对象', 'INVALID_BODY');
  }
  return body;
}

function str(value, field, { min = 1, max = 255, trim = true } = {}) {
  const text = typeof value === 'string' ? (trim ? value.trim() : value) : '';
  if (text.length < min) fail(`${field}不能为空`, 'MISSING_FIELD', { field });
  if (text.length > max) fail(`${field}最长 ${max} 个字符`, 'FIELD_TOO_LONG', { field });
  return text;
}

function optionalStr(value, field, { max = 255 } = {}) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (text.length > max) fail(`${field}最长 ${max} 个字符`, 'FIELD_TOO_LONG', { field });
  return text;
}

function enumOf(value, field, allowed, { required = true, fallback } = {}) {
  if (value == null || value === '') {
    if (required) fail(`${field}不能为空`, 'MISSING_FIELD', { field });
    return fallback;
  }
  const text = String(value);
  if (!allowed.includes(text)) {
    fail(`${field}只能是 ${allowed.join(' / ')} 之一`, 'INVALID_ENUM', { field, allowed });
  }
  return text;
}

function intOf(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = true, fallback } = {}) {
  if (value == null || value === '') {
    if (required) fail(`${field}不能为空`, 'MISSING_FIELD', { field });
    return fallback;
  }
  const num = Number(value);
  if (!Number.isInteger(num)) fail(`${field}应为整数`, 'INVALID_INTEGER', { field });
  if (num < min || num > max) {
    fail(`${field}应在 ${min} ~ ${max} 之间`, 'OUT_OF_RANGE', { field });
  }
  return num;
}

/** 路径参数 / 查询串里的 id。 */
function idOf(value, field = 'id') {
  return intOf(value, field, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

/** 查询串里的分页参数，带默认值与硬上限。 */
function pagination(query = {}) {
  const page = intOf(query.page, 'page', { min: 1, max: 100000, required: false, fallback: 1 });
  const rawSize = intOf(query.pageSize, 'pageSize', {
    min: 1,
    max: 200,
    required: false,
    fallback: 20,
  });
  return { page, pageSize: Math.min(rawSize, 200), offset: (page - 1) * rawSize };
}

function boolOf(value, field, { required = true, fallback } = {}) {
  if (value == null || value === '') {
    if (required) fail(`${field}不能为空`, 'MISSING_FIELD', { field });
    return fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return 1;
  if (['0', 'false', 'no', 'off'].includes(text)) return 0;
  fail(`${field}应为布尔值`, 'INVALID_BOOLEAN', { field });
}

/** 交易金额：恒正、最多两位小数、不超过 9,999,999.99。与 ck_txn_amount_* 对齐。 */
function amountOf(value, field = '金额') {
  const text = String(value ?? '').trim();
  if (text === '') fail(`${field}不能为空`, 'MISSING_FIELD', { field });
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    fail(`${field}应为正数且最多两位小数`, 'INVALID_AMOUNT', { field });
  }
  if (!money.isValidTransactionAmount(text)) {
    fail(`${field}应大于 0 且不超过 9,999,999.99`, 'AMOUNT_OUT_OF_RANGE', { field });
  }
  return money.fromCents(money.toCents(text));
}

/** 预算/分类预算的金额：允许 0（对应 ck_budgetcat_amount）。 */
function nonNegativeAmountOf(value, field = '金额') {
  const text = String(value ?? '').trim();
  if (text === '') fail(`${field}不能为空`, 'MISSING_FIELD', { field });
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    fail(`${field}应为非负数且最多两位小数`, 'INVALID_AMOUNT', { field });
  }
  const cents = money.toCents(text);
  if (cents > money.MAX_AMOUNT_CENTS) {
    fail(`${field}不超过 9,999,999.99`, 'AMOUNT_OUT_OF_RANGE', { field });
  }
  return money.fromCents(cents);
}

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function phoneOf(value, { required = true, fallback = null } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) fail('手机号不能为空', 'MISSING_FIELD', { field: 'phone' });
    return fallback;
  }
  const text = String(value).trim();
  if (!PHONE_RE.test(text)) fail('请输入 11 位中国大陆手机号', 'INVALID_PHONE', { field: 'phone' });
  return text;
}

function emailOf(value, { required = true, fallback = null } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) fail('邮箱不能为空', 'MISSING_FIELD', { field: 'email' });
    return fallback;
  }
  const text = String(value).trim().toLowerCase();
  if (!EMAIL_RE.test(text)) fail('邮箱格式不正确', 'INVALID_EMAIL', { field: 'email' });
  return text;
}

/** 新密码规则：PRD 4.1.2 要求 8-32 位，且同时包含字母与数字。 */
function passwordOf(value, field = '密码') {
  const text = String(value ?? '');
  if (text.length < 8) fail(`${field}至少 8 位`, 'PASSWORD_TOO_SHORT', { field });
  if (text.length > 32) fail(`${field}最长 32 位`, 'PASSWORD_TOO_LONG', { field });
  if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) {
    fail(`${field}必须同时包含字母和数字`, 'PASSWORD_TOO_WEAK', { field });
  }
  return text;
}

/** 校验既有密码时保持兼容，避免历史账号因规则升级而无法修改密码。 */
function existingPasswordOf(value, field = '当前密码') {
  const text = String(value ?? '');
  if (text.length < 1) fail(`${field}不能为空`, 'MISSING_FIELD', { field });
  if (text.length > 72) fail(`${field}最长 72 位`, 'PASSWORD_TOO_LONG', { field });
  return text;
}

/** 6 位数字验证码。 */
function smsCodeOf(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{6}$/.test(text)) fail('验证码应为 6 位数字', 'INVALID_SMS_CODE', { field: 'code' });
  return text;
}

/** 颜色：'#RRGGBB'。 */
function colorOf(value, { required = true } = {}) {
  if (value == null || value === '') {
    if (required) fail('颜色不能为空', 'MISSING_FIELD', { field: 'color' });
    return null;
  }
  const text = String(value).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(text)) fail('颜色应为 #RRGGBB 格式', 'INVALID_COLOR', { field: 'color' });
  return text;
}

module.exports = {
  fail,
  objectBody,
  str,
  optionalStr,
  enumOf,
  intOf,
  idOf,
  pagination,
  boolOf,
  amountOf,
  nonNegativeAmountOf,
  phoneOf,
  emailOf,
  passwordOf,
  existingPasswordOf,
  smsCodeOf,
  colorOf,
  PHONE_RE,
  EMAIL_RE,
};
