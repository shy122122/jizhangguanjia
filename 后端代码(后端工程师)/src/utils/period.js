'use strict';

/**
 * 周期与时间工具。
 *
 * ⚠️ 这里的核心是时区。视图里 v_today_quota 用 CURDATE() 判断「今天」，
 * 而 Node 进程的本地时区取决于部署环境。如果两边不一致，
 * 「今日可花」会整体偏一天 —— 而且现象很隐蔽：数字都对，就是日期不对。
 *
 * 做法：业务时区固定为 UTC+8，所有「现在」都通过把 epoch 时间加上偏移量
 * 再取 UTC 字段得到。这样无论进程时区设置成什么，结果都一样。
 */

const config = require('../config');
const { ApiError } = require('../middleware/errors');

const OFFSET = config.timezoneOffsetMs;

/** 当前时刻在业务时区（UTC+8）的墙上时间，以一个「UTC 字段即墙上时间」的 Date 表示。 */
function nowShifted() {
  return new Date(Date.now() + OFFSET);
}

/** 'YYYY-MM-DD' */
function today() {
  return nowShifted().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD HH:MM:SS' */
function nowDateTime() {
  return nowShifted().toISOString().slice(0, 19).replace('T', ' ');
}

/** 'YYYY-MM'，即当前账期。 */
function currentPeriod() {
  return today().slice(0, 7);
}

/** 校验一个真实存在的日历日期，挡掉 2026-02-30 这种正则能过、实际不存在的日期。 */
function assertRealDate(year, month, day, raw) {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw ApiError.badRequest(`日期不存在：${raw}`, 'INVALID_DATE');
  }
}

/**
 * 把请求里的 period 参数规范化成 'YYYY-MM'。
 * 不传则返回当前月 —— 调用方不需要自己处理「默认值」。
 */
function normalizePeriod(input) {
  if (input == null || String(input).trim() === '') return currentPeriod();

  const text = String(input).trim();
  const m = text.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    throw ApiError.badRequest(`周期格式应为 YYYY-MM，收到：${text}`, 'INVALID_PERIOD');
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw ApiError.badRequest(`月份应在 01-12 之间，收到：${text}`, 'INVALID_PERIOD');
  }
  if (year < 2000 || year > 2100) {
    throw ApiError.badRequest(`年份超出合理范围：${text}`, 'INVALID_PERIOD');
  }

  return `${m[1]}-${m[2]}`;
}

/**
 * 周期的起止时间，用于 SQL 的范围过滤。
 *   periodRange('2026-09') → { start:'2026-09-01 00:00:00', end:'2026-10-01 00:00:00' }
 *
 * ⚠️ end 是**开区间**。查询一律写 `happened_at >= ? AND happened_at < ?`，
 * 不要写 BETWEEN —— BETWEEN 两端都含，会把下月 1 号 0 点整那笔算进本月。
 */
function periodRange(period) {
  const p = normalizePeriod(period);
  const [year, month] = p.split('-').map(Number);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    period: p,
    start: `${p}-01 00:00:00`,
    end: `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`,
  };
}

function isCurrentPeriod(period) {
  return normalizePeriod(period) === currentPeriod();
}

/** 该月天数。用 UTC 构造避开夏令时之类的本地日历怪象。 */
function daysInPeriod(period) {
  const p = normalizePeriod(period);
  const [year, month] = p.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 该月「剩余天数」，含今天。
 * 非当前月返回 null —— 与 v_budget_progress.remaining_days 的语义保持一致，
 * 历史月份的「今日可花」没有意义。
 */
function remainingDaysInPeriod(period) {
  const p = normalizePeriod(period);
  if (p !== currentPeriod()) return null;
  const dayOfMonth = Number(today().slice(8, 10));
  return daysInPeriod(p) - dayOfMonth + 1;
}

/** 最近 count 个账期（含当前月），升序。用于趋势图。 */
function recentPeriods(count = 6) {
  const [year, month] = currentPeriod().split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    );
  }
  return out;
}

/**
 * 时间输入规范化 → 'YYYY-MM-DD HH:MM:SS'。
 *
 * 三种输入都支持：
 *   '2026-09-24'                → '2026-09-24 12:00:00'（只有日期时取正午，
 *                                 避免落在 0 点被误当成「前一天的深夜」）
 *   '2026-09-24T18:30'          → '2026-09-24 18:30:00'
 *   '2026-09-24T18:30:00.000Z'  → 按瞬时解析，换算到 UTC+8 的墙上时间
 */
function toDateTime(input, { defaultTime = '12:00:00' } = {}) {
  const text = String(input ?? '').trim();

  // 带时区标记：这是「瞬时」，不是墙上时间，必须先换算。
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(text)) {
    const instant = new Date(text);
    if (Number.isNaN(instant.getTime())) {
      throw ApiError.badRequest(`时间无法解析：${text}`, 'INVALID_DATETIME');
    }
    return new Date(instant.getTime() + OFFSET).toISOString().slice(0, 19).replace('T', ' ');
  }

  const withTime = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (withTime) {
    const [, y, mo, d, h, mi, s] = withTime;
    if (Number(h) > 23 || Number(mi) > 59 || Number(s || 0) > 59) {
      throw ApiError.badRequest(`时间超出范围：${text}`, 'INVALID_DATETIME');
    }
    assertRealDate(Number(y), Number(mo), Number(d), text);
    return `${y}-${mo}-${d} ${h}:${mi}:${s || '00'}`;
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    assertRealDate(Number(y), Number(mo), Number(d), text);
    return `${y}-${mo}-${d} ${defaultTime}`;
  }

  throw ApiError.badRequest(`时间格式无法识别：${text}`, 'INVALID_DATETIME');
}

/** 只保留 'YYYY-MM-DD' 部分。 */
function toDateOnly(input) {
  return toDateTime(input).slice(0, 10);
}

module.exports = {
  nowShifted,
  today,
  nowDateTime,
  currentPeriod,
  normalizePeriod,
  periodRange,
  isCurrentPeriod,
  daysInPeriod,
  remainingDaysInPeriod,
  recentPeriods,
  toDateTime,
  toDateOnly,
};
