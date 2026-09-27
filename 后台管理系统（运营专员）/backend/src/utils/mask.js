'use strict';

/**
 * 脱敏。PRD 3.4 要求「列表默认脱敏」：手机号 138****1234、邮箱 d***@mingzhang.app。
 *
 * 一条容易被忽略的规则：**脱敏必须在服务端做**。
 * 如果后端返回明文、由前端负责遮起来，那明文已经进了浏览器、进了 DevTools、
 * 进了任何一层能读响应的东西（代理日志、前端错误上报）。脱敏的意义也就没了。
 *
 * 配套的取舍（PRD 3.4 已决策）：脱敏之后无法模糊搜索，所以搜索走**完整值精确匹配**。
 * 运营输入完整手机号 → 后端精确命中 → 返回的仍然是脱敏结果。
 */

/** 13812341234 → 138****1234。非 11 位手机号（含国际号）走通用规则。 */
function phone(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{11}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(7)}`;
  // 太短就整体打码，避免「只剩下最后一个字符是明文」这种假脱敏。
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${text.slice(0, 2)}${'*'.repeat(text.length - 4)}${text.slice(-2)}`;
}

/** demo@mingzhang.app → d***@mingzhang.app */
function email(value) {
  if (!value) return null;
  const text = String(value);
  const at = text.lastIndexOf('@');
  if (at <= 0) return '*'.repeat(text.length);
  const local = text.slice(0, at);
  const domain = text.slice(at);
  const head = local.slice(0, 1);
  // 本地部分只有 1 个字符时，星号也要给足，否则一眼就能猜出原文。
  return `${head}${'*'.repeat(Math.max(3, local.length - 1))}${domain}`;
}

/** IP 抹掉最后一段：192.168.1.42 → 192.168.1.* */
function ip(value) {
  if (!value) return null;
  const text = String(value);
  if (text.includes(':')) {
    // IPv6：只留前两组
    const parts = text.split(':');
    return parts.slice(0, 2).join(':') + '::*';
  }
  const parts = text.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return text;
}

module.exports = { phone, email, ip };
