/* 统计页：直接展示后端统一统计口径，避免前端重复聚合。 */
(function (global) {
  'use strict';
  var API = global.MZ_API, UI = global.MZ_UI, FMT = global.MZ_FMT;
  if (!API || !UI || !FMT) return;
  var period = UI.currentPeriod();
  function main() { return document.querySelector('main'); }
  function signedMoney(value) { return Number(value) < 0 ? '-¥' + FMT.amount(Math.abs(Number(value))) : '+¥' + FMT.amount(Number(value)); }
  function changePeriod(step) { period = step < 0 ? FMT.prevPeriod(period) : FMT.nextPeriod(period); renderOverview(); }
  function card(label, value, hint, tone) { return '<article class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><p class="text-on-surface-variant">' + label + '</p><strong class="block mt-3 font-numeric-hero text-numeric-hero ' + (tone || '') + '">' + value + '</strong><p class="mt-2 text-sm text-on-surface-variant">' + hint + '</p></article>'; }

  function renderOverview() {
    Promise.all([
      API.get('/stats/overview', { period: period }), API.get('/stats/category', { period: period, type: 'expense' }),
      API.get('/stats/trend', { period: period, granularity: 'day' }), API.get('/stats/account'),
    ]).then(function (values) {
      var o = values[0], c = values[1], t = values[2], a = values[3];
      var maxTrend = Math.max.apply(null, t.items.map(function (x) { return x.expenseTotal; }).concat([1]));
      main().innerHTML = '<div class="max-w-[1200px] mx-auto p-margin-lg flex flex-col gap-space-lg">' +
        '<header class="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><p class="text-primary font-label-sm">数据洞察</p><h1 class="font-headline-lg text-headline-lg">收支统计</h1><p class="mt-1 text-on-surface-variant">所有金额均来自账本有效流水，不含转账与已删除记录。</p></div><div class="flex items-center gap-2"><button data-prev class="w-10 h-10 rounded-xl bg-surface-container">‹</button><strong class="px-3">' + FMT.period(period) + '</strong><button data-next class="w-10 h-10 rounded-xl bg-surface-container">›</button><button data-export class="ml-2 px-4 py-2 rounded-xl bg-primary text-on-primary">导出全部流水</button></div></header>' +
        '<section class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-md">' +
          card('本月支出', FMT.money(o.expenseTotal), o.expenseCount + ' 笔 · 日均 ' + FMT.money(o.avgExpensePerDay)) +
          card('本月收入', '+' + FMT.money(o.incomeTotal), o.incomeCount + ' 笔入账', 'text-primary') +
          card('本月结余', signedMoney(o.net), '收入减去支出', o.net >= 0 ? 'text-primary' : '') +
          card('净资产', FMT.money(a.netWorth), a.accountCount + ' 个账户 · 信用卡已用 ' + FMT.money(a.creditUsedTotal)) +
        '</section>' +
        '<section class="grid grid-cols-1 lg:grid-cols-5 gap-space-lg"><article class="lg:col-span-3 rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><div class="flex justify-between"><h2 class="font-headline-sm text-headline-sm">每日支出趋势</h2><span class="text-sm text-on-surface-variant">共 ' + t.items.reduce(function (n, x) { return n + x.txnCount; }, 0) + ' 笔</span></div><div class="mt-6 h-60 flex items-end gap-1">' + UI.each(t.items, function (x) { var h = Math.max(2, x.expenseTotal / maxTrend * 100); return '<div class="flex-1 bg-primary/70 hover:bg-primary rounded-t" style="height:' + h + '%" title="' + x.bucket + ' ' + FMT.money(x.expenseTotal) + '"></div>'; }) + '</div><div class="mt-2 flex justify-between text-xs text-outline"><span>' + UI.esc(t.items[0] && t.items[0].bucket || '') + '</span><span>' + UI.esc(t.items[t.items.length - 1] && t.items[t.items.length - 1].bucket || '') + '</span></div></article>' +
        '<article class="lg:col-span-2 rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><div class="flex justify-between items-center"><h2 class="font-headline-sm text-headline-sm">支出分类排行</h2><span class="text-sm text-on-surface-variant">' + c.txnCount + ' 笔</span></div><div class="mt-5 flex flex-col gap-4">' + (c.items.length ? UI.each(c.items.slice(0, 8), function (x) { return '<a href="17-stats-category.html?period=' + period + '&category=' + x.categoryId + '" class="group"><div class="flex justify-between"><span><span class="material-symbols-outlined align-middle mr-2" style="color:' + UI.esc(x.color || '#14B8A6') + '">' + UI.esc(x.icon || 'category') + '</span>' + UI.esc(x.categoryName) + '</span><strong>' + FMT.money(x.totalAmount) + '</strong></div><div class="mt-2 h-2 bg-surface-container rounded-full"><div class="h-full rounded-full bg-primary" style="width:' + FMT.clampPercent(x.percent) + '%"></div></div><p class="mt-1 text-xs text-on-surface-variant">占 ' + FMT.percent(x.percent) + ' · ' + x.txnCount + ' 笔</p></a>'; }) : '<p class="py-12 text-center text-on-surface-variant">该月暂无支出</p>') + '</div></article></section>' +
        '<section class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><h2 class="font-headline-sm text-headline-sm">账户分布</h2><div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' + UI.each(a.items, function (x) { return '<div class="rounded-xl bg-surface-container-low p-4 flex justify-between"><span>' + UI.esc(x.name) + '</span><strong>' + (x.type === 'credit' ? '已用 ' + FMT.money(x.creditUsed) : FMT.money(x.balance)) + '</strong></div>'; }) + '</div></section></div>';
      main().querySelector('[data-prev]').addEventListener('click', function () { changePeriod(-1); });
      main().querySelector('[data-next]').addEventListener('click', function () { changePeriod(1); });
      main().querySelector('[data-export]').addEventListener('click', function () { API.download('/settings/export.csv', '明账-全部流水.csv'); });
    });
  }

  function renderCategory() {
    var categoryId = null;
    try { categoryId = Number(new URLSearchParams(global.location.search).get('category')); } catch (e) {}
    Promise.all([API.get('/stats/category', { period: period, type: 'expense' }), API.get('/transactions', { period: period, page: 1, pageSize: 100, categoryId: categoryId || undefined }, { raw: true })]).then(function (values) {
      var breakdown = values[0], selected = breakdown.items.find(function (x) { return x.categoryId === categoryId; }) || breakdown.items[0];
      if (!selected) { main().innerHTML = '<div class="p-20 text-center">该月暂无分类支出，<a class="text-primary" href="15-stats-overview.html?period=' + period + '">返回统计</a></div>'; return; }
      if (!categoryId || categoryId !== selected.categoryId) return global.location.replace('17-stats-category.html?period=' + period + '&category=' + selected.categoryId);
      var txns = (values[1].data && values[1].data.items) || values[1].data || [];
      main().innerHTML = '<div class="max-w-[1000px] mx-auto p-margin-lg flex flex-col gap-space-lg"><a href="15-stats-overview.html?period=' + period + '" class="text-primary">← 返回统计总览</a><header class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><div class="flex items-center gap-3"><div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:' + UI.esc(selected.color || '#14B8A6') + '18;color:' + UI.esc(selected.color || '#14B8A6') + '"><span class="material-symbols-outlined text-3xl">' + UI.esc(selected.icon || 'category') + '</span></div><div><p class="text-on-surface-variant">' + FMT.period(period) + '分类详情</p><h1 class="font-headline-lg text-headline-lg">' + UI.esc(selected.categoryName) + '</h1></div></div><div class="mt-6 grid grid-cols-3 gap-4"><div><p class="text-on-surface-variant">合计支出</p><strong class="text-2xl">' + FMT.money(selected.totalAmount) + '</strong></div><div><p class="text-on-surface-variant">流水数量</p><strong class="text-2xl">' + selected.txnCount + ' 笔</strong></div><div><p class="text-on-surface-variant">单笔平均</p><strong class="text-2xl">' + FMT.money(selected.avgAmount) + '</strong></div></div></header><section class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><h2 class="font-headline-sm text-headline-sm">分类流水</h2><div class="mt-4 divide-y divide-surface-container">' + (txns.length ? UI.each(txns, function (x) { return '<div class="py-4 flex items-center justify-between"><div><strong>' + UI.esc(x.merchant || x.note || selected.categoryName) + '</strong><p class="text-sm text-on-surface-variant">' + UI.esc(x.happenedAt) + ' · ' + UI.esc(x.account && x.account.name || '') + '</p></div><strong>' + FMT.money(x.amount) + '</strong></div>'; }) : '<p class="py-12 text-center text-on-surface-variant">暂无流水</p>') + '</div></section></div>';
    });
  }

  UI.boot(function () { if (document.body.getAttribute('data-page') === 'stats-overview') renderOverview(); else renderCategory(); });
})(window);
