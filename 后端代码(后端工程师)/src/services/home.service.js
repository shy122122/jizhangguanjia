'use strict';

/**
 * 首页。产品的核心差异化（「今日可花」）就挂在 /api/home/quota 上。
 *
 * 一个必须说清楚的行为：**没有预算时不报错，返回 200**。
 *
 * v_today_quota 视图在「当月没建预算」时返回 0 行 —— 这是视图的正确行为，
 * 不是故障。但接口层如果顺手返回 404，前端就会弹一个「请求失败」，
 * 而用户看到的是一个空白的首页大卡片，完全不知道该干什么。
 * 所以这里一律 200 + { hasBudget: false }，让前端能走「引导去设预算」这条正常分支。
 */

const db = require('../db');
const money = require('../utils/money');
const period = require('../utils/period');
const transactionService = require('./transaction.service');

/** 一行预算 → 前端契约。v_today_quota 与 v_budget_progress 的公共列。 */
function mapProgress(row, { withQuota }) {
  return {
    period: row.period_value,
    totalAmount: money.toNumber(row.total_amount),
    spent: money.toNumber(row.spent),
    remaining: money.toNumber(row.remaining),
    usedPct: row.used_pct == null ? 0 : Number(row.used_pct),
    alertLevel: row.alert_level,
    safeSpendMode: row.safe_spend_mode,
    periodEndDate: row.period_end_date,
    remainingDays: row.remaining_days == null ? null : Number(row.remaining_days),
    // 只有 v_today_quota 才提供；历史月份没有「今日可花」这个概念。
    todayQuota: withQuota ? money.toNumber(row.today_quota) : null,
  };
}

/**
 * 今日可花。
 *
 * 分两种情况：
 *   当月  → 查 v_today_quota（它自带 today_quota 与 remaining_days）
 *   非当月 → 查 v_budget_progress，返回预算进度但 todayQuota = null
 *
 * 第二种情况存在的理由：演示数据是 2026-09，而「今天」可能是别的月份。
 * 没有它，用 ?period=2026-09 回看历史时首页会直接变成「未设置预算」。
 */
async function quota(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);

  if (p === period.currentPeriod()) {
    const row = await db.queryOne(
      `SELECT period_value, total_amount, spent, remaining, used_pct, alert_level,
              safe_spend_mode, period_end_date, remaining_days, today_quota
         FROM \`v_today_quota\`
        WHERE ledger_id = ?`,
      [ledgerId]
    );

    if (!row) {
      return {
        hasBudget: false,
        period: p,
        isCurrentPeriod: true,
        message: '本月还没有设置预算，设置后就能看到「今日可花」',
      };
    }

    return { hasBudget: true, isCurrentPeriod: true, ...mapProgress(row, { withQuota: true }) };
  }

  const row = await db.queryOne(
    `SELECT period_value, total_amount, spent, remaining, used_pct, alert_level,
            safe_spend_mode, period_end_date, remaining_days
       FROM \`v_budget_progress\`
      WHERE ledger_id = ? AND period_value = ?`,
    [ledgerId, p]
  );

  if (!row) {
    return {
      hasBudget: false,
      period: p,
      isCurrentPeriod: false,
      message: `${p} 没有设置预算`,
    };
  }

  return { hasBudget: true, isCurrentPeriod: false, ...mapProgress(row, { withQuota: false }) };
}

/** [视图] v_budget_category_progress —— 首页/预算页的分类预算进度条。 */
async function categoryBudgetProgress(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);
  const rows = await db.query(
    `SELECT budget_category_id, period_value, category_id, category_name, icon, color,
            sort_order, budget_amount, spent, remaining, used_pct
       FROM \`v_budget_category_progress\`
      WHERE ledger_id = ? AND period_value = ?
      ORDER BY sort_order ASC, category_id ASC`,
    [ledgerId, p]
  );

  return rows.map((row) => ({
    budgetCategoryId: Number(row.budget_category_id),
    categoryId: Number(row.category_id),
    categoryName: row.category_name,
    icon: row.icon,
    color: row.color,
    budgetAmount: money.toNumber(row.budget_amount),
    spent: money.toNumber(row.spent),
    remaining: money.toNumber(row.remaining),
    usedPct: row.used_pct == null ? 0 : Number(row.used_pct),
    // 视图里没有 alert_level（分类预算只有一条进度，颜色由前端按 usedPct 决定）。
    // 这里也不臆造阈值 —— 分类预算的预警口径 PRD 没有规定。
  }));
}

/**
 * 今日支出合计。
 *
 * 这段为什么不在视图里：v_today_quota 给的是「今日可花」（还能花多少），
 * 而首页那张卡片要的是「今天已经花了多少」—— 两回事，视图里没有这个数。
 * 也不从 v_monthly_summary 推：那是月度口径，推不出当天。
 *
 * 所以这里补一条最小的、带 ledger_id 的查询。**没有重算任何视图已经算过的口径**，
 * 只是把一个视图没覆盖的、页面确实需要的数字取出来。
 * 上界用 DATE_ADD 而不是 DATE(happened_at) = ?：前者能走索引，后者会让索引失效。
 */
async function todayExpense(ledgerId) {
  const from = `${period.today()} 00:00:00`;
  const row = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS txn_count
       FROM \`transaction\`
      WHERE ledger_id = ?
        AND is_deleted = 0
        AND type = 'expense'
        AND happened_at >= ?
        AND happened_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [ledgerId, from, from]
  );
  return {
    todayExpense: money.toNumber(row.total),
    todayExpenseCount: Number(row.txn_count),
  };
}

/**
 * 首页概览。把首页要的五块数据一次给全：
 *   收支概览 / 预算进度 / 分类预算 / 今日支出 / 最近流水
 * 几个查询并行发 —— 它们之间没有依赖，串行纯属浪费往返时间。
 */
async function overview(ledgerId, periodInput, { recentLimit = 5 } = {}) {
  const p = period.normalizePeriod(periodInput);

  const [summaryResult, quotaResult, categoryProgress, today, recentTransactions] =
    await Promise.all([
      transactionService.summary(ledgerId, p),
      quota(ledgerId, p),
      categoryBudgetProgress(ledgerId, p),
      todayExpense(ledgerId),
      transactionService.recent(ledgerId, recentLimit),
    ]);

  return {
    period: p,
    summary: summaryResult,
    budget: quotaResult,
    categoryBudget: categoryProgress,
    today,
    recentTransactions,
  };
}

module.exports = { quota, overview, categoryBudgetProgress, todayExpense };
