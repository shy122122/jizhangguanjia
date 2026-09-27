#!/usr/bin/env node
'use strict';

/**
 * 算出「本周一 ~ 本周日」的日期边界，输出 JSON。
 *
 * 为什么值得单独写个脚本：跨月、跨年、闰年的周很容易算错，而周报的日期区间
 * 一旦错了，整份报告就失去了对照价值（"这周到底覆盖了哪几天"没人能确认）。
 * 把这段确定性计算从"模型现场心算"里摘出来，周报的准确性就不再依赖运气。
 *
 * 用法：
 *   node week-range.js              # 以今天为基准
 *   node week-range.js 2026-09-23   # 以指定日期为基准（出那一周的）
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO 8601 周号：以周四所在年为准，所以跨年那几天归属要看周四落在哪一年。 */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 周日算第 7 天
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 移到本周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7),
  };
}

function resolveBase(input) {
  if (!input || input === 'today') return new Date();
  const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    console.error(`日期格式必须为 YYYY-MM-DD，收到：${JSON.stringify(input)}`);
    process.exit(1);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const base = resolveBase(process.argv[2]);

// getDay() 里周日是 0，换成「周一=1 … 周日=7」才好定位本周一。
const dow = base.getDay() === 0 ? 7 : base.getDay();
const monday = new Date(base);
monday.setDate(base.getDate() - (dow - 1));
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);

const { year, week } = isoWeek(monday);
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

process.stdout.write(
  JSON.stringify(
    {
      monday: fmt(monday),
      sunday: fmt(sunday),
      since: `${fmt(monday)} 00:00:00`,
      until: `${fmt(sunday)} 23:59:59`,
      label: `${fmt(monday)}_${fmt(sunday)}`,
      isoWeek: `${year}-W${pad(week)}`,
      weekNo: week,
      base: fmt(base),
      baseWeekday: WEEKDAYS[base.getDay()],
    },
    null,
    2
  ) + '\n'
);
