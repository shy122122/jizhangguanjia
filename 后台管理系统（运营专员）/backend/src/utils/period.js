'use strict';

/**
 * 周期工具。'2026-09' ↔ 起止时间，按 UTC+8 墙上时间计算。
 *
 * 时间一律用字符串和整数算，不经过 JS Date 的时区转换 —— 记账产品里
 * 日期错一天就是错账，而 Date 的时区行为取决于运行环境，不可依赖。
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidPeriod(value) {
  return typeof value === 'string' && PERIOD_RE.test(value);
}

function normalizePeriod(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!isValidPeriod(text)) return null;
  return text;
}

/** '2026-09' → ['2026-09-01 00:00:00', '2026-10-01 00:00:00')，左闭右开。 */
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01 00:00:00`,
    end: `${nextY}-${pad(nextM)}-01 00:00:00`,
  };
}

/** 'YYYY-MM-DD' → 当天 [00:00:00, 次日 00:00:00)。用于注册时间区间筛选。 */
function dayRange(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const [y, m, d] = String(date).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n) => String(n).padStart(2, '0');
  const end = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return { start: `${date} 00:00:00`, end: `${end} 00:00:00` };
}

function nowDateTime() {
  const now = new Date(Date.now() + 8 * 3_600_000);
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { isValidPeriod, normalizePeriod, periodRange, dayRange, nowDateTime };
