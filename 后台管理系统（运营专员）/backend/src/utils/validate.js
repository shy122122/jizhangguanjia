'use strict';

/**
 * 轻量参数校验。刻意不引 zod / joi —— 后台的入参只有十几种形状，
 * 引一个 schema 库换来的是「多一层翻译」而不是更少的代码。
 *
 * 每个函数要么返回规整后的值，要么抛 400，不返回 null 让调用点去判断。
 */

const { ApiError } = require('../middleware/errors');

function str(value, field, { min = 1, max = 200, required = true } = {}) {
  if (value == null || value === '') {
    if (required) throw ApiError.badRequest(`${field}不能为空`, 'FIELD_REQUIRED');
    return null;
  }
  const text = String(value).trim();
  if (text.length < min) throw ApiError.badRequest(`${field}至少 ${min} 个字符`, 'FIELD_TOO_SHORT');
  if (text.length > max) throw ApiError.badRequest(`${field}不能超过 ${max} 个字符`, 'FIELD_TOO_LONG');
  return text;
}

function int(value, field, { min = null, max = null, required = true, fallback = null } = {}) {
  if (value == null || value === '') {
    if (required) throw ApiError.badRequest(`${field}不能为空`, 'FIELD_REQUIRED');
    return fallback;
  }
  const num = Number(value);
  if (!Number.isInteger(num)) throw ApiError.badRequest(`${field}必须是整数`, 'FIELD_NOT_INT');
  if (min !== null && num < min) throw ApiError.badRequest(`${field}不能小于 ${min}`, 'FIELD_TOO_SMALL');
  if (max !== null && num > max) throw ApiError.badRequest(`${field}不能大于 ${max}`, 'FIELD_TOO_LARGE');
  return num;
}

function oneOf(value, field, allowed, { required = true, fallback = null } = {}) {
  if (value == null || value === '') {
    if (required) throw ApiError.badRequest(`${field}不能为空`, 'FIELD_REQUIRED');
    return fallback;
  }
  const text = String(value);
  if (!allowed.includes(text)) {
    throw ApiError.badRequest(
      `${field}只能是 ${allowed.join(' / ')} 之一`,
      'FIELD_NOT_ALLOWED'
    );
  }
  return text;
}

/**
 * 操作原因。PRD 3.3 要求每次后台写操作都必须留下痕迹，
 * 「原因必填」是让审计日志真正可读的那一半 —— 只有「谁在什么时候点了什么」
 * 是没有交接价值的。
 */
function reason(value, { min = 4, max = 200 } = {}) {
  const text = str(value, '操作原因', { min, max });
  return text;
}

/**
 * 二次确认短语。用于「标记注销」这类不可逆动作：
 * 让运营手打目标账号的 uid，避免点错行。
 */
function confirmPhrase(value, expected, label) {
  const text = str(value, '确认短语');
  if (text !== expected) {
    throw ApiError.badRequest(
      `请在确认框里完整输入${label || '目标标识'}「${expected}」`,
      'CONFIRM_PHRASE_MISMATCH'
    );
  }
  return text;
}

/** 关键词。中英文都允许，但不能只剩空白或全是标点。 */
function keyword(value) {
  const text = str(value, '关键词', { min: 1, max: 50 });
  if (!/[一-龥a-zA-Z0-9]/.test(text)) {
    throw ApiError.badRequest('关键词至少要包含一个汉字、字母或数字', 'KEYWORD_TOO_WEAK');
  }
  return text;
}

function hexColor(value, field = '颜色') {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(text)) {
    throw ApiError.badRequest(`${field}必须是 #RRGGBB 形式`, 'FIELD_NOT_COLOR');
  }
  return text.toUpperCase();
}

function dateString(value, field, { required = true } = {}) {
  if (value == null || value === '') {
    if (required) throw ApiError.badRequest(`${field}不能为空`, 'FIELD_REQUIRED');
    return null;
  }
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw ApiError.badRequest(`${field}必须是 YYYY-MM-DD 形式`, 'FIELD_NOT_DATE');
  }
  return text;
}

module.exports = {
  str,
  int,
  oneOf,
  reason,
  confirmPhrase,
  keyword,
  hexColor,
  dateString,
};
