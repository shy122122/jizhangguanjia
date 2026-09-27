/* 明账预算页：09 冷启动 + 10 预算看板，共用真实 API。 */
(function (global) {
  'use strict';

  var API = global.MZ_API;
  var UI = global.MZ_UI;
  var FMT = global.MZ_FMT;
  if (!API || !UI || !FMT) return;

  var state = { period: UI.currentPeriod(), ctx: null, budget: null, categories: null, sort: 'ratio' };

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var el = byId(id); if (el) el.textContent = value == null ? '' : value; }
  function setWidth(id, value) { var el = byId(id); if (el) el.style.width = FMT.clampPercent(value) + '%'; }

  function amountDialog(title, initialValue) {
    return new Promise(function (resolve) {
      var layer = document.createElement('div');
      layer.className = 'fixed inset-0 z-[120] bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4';
      layer.innerHTML =
        '<form class="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-md">' +
          '<div><h2 class="font-headline-md text-headline-md text-on-surface">' + UI.esc(title) + '</h2>' +
          '<p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">请输入大于 0 的金额，最多保留两位小数。</p></div>' +
          '<label class="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3">' +
            '<span class="font-headline-sm text-headline-sm">¥</span>' +
            '<input name="amount" type="number" min="0.01" step="0.01" required class="min-w-0 flex-1 bg-transparent outline-none font-numeric-data text-numeric-data" value="' + UI.esc(initialValue || '') + '">' +
          '</label>' +
          '<div class="flex justify-end gap-2"><button type="button" data-cancel class="px-4 py-2 rounded-xl bg-surface-container">取消</button>' +
          '<button type="submit" class="px-4 py-2 rounded-xl bg-primary text-on-primary">确认保存</button></div>' +
        '</form>';
      document.body.appendChild(layer);
      var input = layer.querySelector('input');
      input.focus(); input.select();
      function finish(value) { layer.remove(); resolve(value); }
      layer.querySelector('[data-cancel]').addEventListener('click', function () { finish(null); });
      layer.addEventListener('click', function (e) { if (e.target === layer) finish(null); });
      layer.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var value = Number(input.value);
        if (!isFinite(value) || value <= 0) { UI.toast('请输入有效金额', 'error'); return; }
        finish(Math.round(value * 100) / 100);
      });
    });
  }

  function categoryDialog(existing) {
    var expense = (state.ctx.categories || []).filter(function (x) { return x.type === 'expense' && !x.isArchived; });
    return new Promise(function (resolve) {
      var layer = document.createElement('div');
      layer.className = 'fixed inset-0 z-[120] bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4';
      layer.innerHTML =
        '<form class="w-full max-w-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-md">' +
          '<div><h2 class="font-headline-md text-headline-md">' + (existing ? '调整分类预算' : '新增分类预算') + '</h2>' +
          '<p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">选择支出分类并设置本月额度。</p></div>' +
          '<select name="category" class="w-full rounded-xl bg-surface-container-low px-4 py-3 outline-none" ' + (existing ? 'disabled' : '') + '>' +
            UI.each(expense, function (x) { return '<option value="' + x.id + '" ' + (existing && x.id === existing.categoryId ? 'selected' : '') + '>' + UI.esc(x.name) + '</option>'; }) +
          '</select>' +
          '<label class="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3"><span>¥</span>' +
            '<input name="amount" type="number" min="0" step="0.01" required class="min-w-0 flex-1 bg-transparent outline-none" value="' + (existing ? existing.budgetAmount : '') + '"></label>' +
          '<div class="flex justify-end gap-2"><button type="button" data-cancel class="px-4 py-2 rounded-xl bg-surface-container">取消</button>' +
          '<button type="submit" class="px-4 py-2 rounded-xl bg-primary text-on-primary">保存</button></div>' +
        '</form>';
      document.body.appendChild(layer);
      function finish(value) { layer.remove(); resolve(value); }
      layer.querySelector('[data-cancel]').addEventListener('click', function () { finish(null); });
      layer.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var amount = Number(layer.querySelector('[name="amount"]').value);
        if (!isFinite(amount) || amount < 0) { UI.toast('请输入有效金额', 'error'); return; }
        finish({ categoryId: Number(existing ? existing.categoryId : layer.querySelector('[name="category"]').value), amount: Math.round(amount * 100) / 100 });
      });
    });
  }

  function load() {
    return Promise.all([
      API.get('/budget', { period: state.period }),
      API.get('/budget/categories', { period: state.period }),
      API.get('/home/quota', { period: state.period }),
    ]).then(function (values) {
      state.budget = values[0];
      state.categories = values[1];
      renderOverview(values[2]);
      return values;
    });
  }

  function saveTotal(amount) {
    return API.put('/budget', {
      period: state.period,
      totalAmount: amount,
      alertYellowPct: state.budget && state.budget.alertYellowPct || 80,
      alertRedPct: state.budget && state.budget.alertRedPct || 100,
      safeSpendMode: 'daily_flat',
    }).then(function () { UI.toast('月度总预算已保存', 'success'); return load(); });
  }

  function editTotal() {
    amountDialog('设置 ' + FMT.period(state.period) + '总预算', state.budget && state.budget.totalAmount)
      .then(function (value) { if (value != null) return saveTotal(value); });
  }

  function editCategory(existing) {
    if (!state.budget || !state.budget.hasBudget) { UI.toast('请先设置月度总预算', 'error'); return; }
    categoryDialog(existing).then(function (value) {
      if (!value) return;
      return API.put('/budget/categories/' + value.categoryId, { period: state.period, amount: value.amount })
        .then(function () { UI.toast('分类预算已保存', 'success'); return load(); });
    });
  }

  function removeCategory(item) {
    if (!global.confirm('取消「' + item.categoryName + '」在 ' + FMT.period(state.period) + '的分类预算？')) return;
    API.del('/budget/categories/' + item.categoryId, undefined, { query: { period: state.period } })
      .then(function () { UI.toast('分类预算已取消', 'success'); return load(); });
  }

  function renderOverview(quota) {
    if (document.body.getAttribute('data-page') !== 'budget-overview') return;
    var b = state.budget;
    setText('periodLabel', FMT.period(state.period));
    setText('periodMeta', b.hasBudget ? '预算数据已同步' : '本月尚未设置预算');
    var banner = byId('noBudgetBanner');
    if (banner) banner.style.display = b.hasBudget ? 'none' : '';
    if (!b.hasBudget) {
      ['totalInt', 'spentInt', 'remainingInt', 'quotaInt'].forEach(function (id) { setText(id, '—'); });
      renderCategories(); return;
    }
    setText('execRange', '执行期：' + state.period + '-01 至 ' + b.periodEndDate);
    setText('totalInt', FMT.money(b.totalAmount)); setText('totalDec', '');
    setText('spentInt', FMT.money(b.spent)); setText('spentDec', '');
    setText('remainingInt', FMT.money(b.remaining)); setText('remainingDec', '');
    setText('progressRightText', FMT.percent(b.usedPct)); setWidth('progressSpent', b.usedPct);
    setWidth('progressBuffer', 100 - FMT.clampPercent(b.usedPct));
    setText('legendSpent', '已用 ' + FMT.money(b.spent));
    setText('legendBuffer', '剩余 ' + FMT.money(b.remaining));
    setText('legendCap', '预算上限 ' + FMT.money(b.totalAmount));
    setText('quotaInt', quota.todayQuota == null ? '仅当前月计算' : FMT.money(quota.todayQuota)); setText('quotaDec', '');
    setText('formulaRemaining', '剩余 ' + FMT.money(b.remaining));
    setText('formulaDays', '剩余 ' + (b.remainingDays == null ? '—' : b.remainingDays) + ' 天');
    setText('formulaResult', quota.todayQuota == null ? '—' : FMT.money(quota.todayQuota));
    setText('quotaHint', quota.todayQuota == null ? '历史月份只展示预算执行情况' : '按当前剩余预算与剩余天数实时计算');
    renderCategories();
  }

  function renderCategories() {
    var grid = byId('catGrid'); if (!grid) return;
    var items = (state.categories && state.categories.items || []).slice();
    items.sort(function (a, b) { return state.sort === 'amount' ? b.budgetAmount - a.budgetAmount : b.usedPct - a.usedPct; });
    setText('catCount', items.length + ' 个生效中维度');
    var total = state.categories ? state.categories.categoryBudgetTotal : 0;
    setText('sumNotice', '分类预算合计 ' + FMT.money(total) + (state.budget && state.budget.hasBudget ? '，月度总预算 ' + FMT.money(state.budget.totalAmount) + '。' : '。'));
    setText('balanceBadge', state.budget && state.budget.hasBudget && total > state.budget.totalAmount ? '分类合计超出总预算' : '校验通过');
    grid.innerHTML = UI.each(items, function (x) {
      var pct = FMT.clampPercent(x.usedPct);
      var tone = x.usedPct >= 100 ? 'bg-error' : x.usedPct >= 80 ? 'bg-amber-500' : 'bg-primary';
      return '<article class="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm flex flex-col gap-space-md" data-category-id="' + x.categoryId + '">' +
        '<div class="flex items-center justify-between"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary">' + UI.esc(x.icon || 'category') + '</span><strong>' + UI.esc(x.categoryName) + '</strong></div><span>' + FMT.percent(x.usedPct) + '</span></div>' +
        '<div class="h-2 rounded-full bg-surface-container-high overflow-hidden"><div class="h-full ' + tone + ' rounded-full" style="width:' + pct + '%"></div></div>' +
        '<div class="flex justify-between text-sm text-on-surface-variant"><span>已用 ' + FMT.money(x.spent) + '</span><span>额度 ' + FMT.money(x.budgetAmount) + '</span></div>' +
        '<div class="flex gap-2"><button type="button" data-edit class="flex-1 rounded-xl bg-surface-container px-3 py-2">调整</button><button type="button" data-delete class="rounded-xl px-3 py-2 text-error hover:bg-error-container">取消</button></div>' +
      '</article>';
    }) + '<button type="button" data-add class="min-h-40 rounded-2xl bg-surface-container-low border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 text-primary"><span class="material-symbols-outlined">add_circle</span><span>添加新预算分类</span></button>';
    grid.querySelectorAll('[data-category-id]').forEach(function (card) {
      var item = items.find(function (x) { return x.categoryId === Number(card.getAttribute('data-category-id')); });
      card.querySelector('[data-edit]').addEventListener('click', function () { editCategory(item); });
      card.querySelector('[data-delete]').addEventListener('click', function () { removeCategory(item); });
    });
    grid.querySelector('[data-add]').addEventListener('click', function () { editCategory(null); });
  }

  function shiftPeriod(direction) {
    state.period = direction < 0 ? FMT.prevPeriod(state.period) : FMT.nextPeriod(state.period);
    load();
  }

  function bindOverview() {
    byId('periodPrevBtn').addEventListener('click', function () { shiftPeriod(-1); });
    byId('periodNextBtn').addEventListener('click', function () { shiftPeriod(1); });
    byId('editTotalBudgetBtn').addEventListener('click', editTotal);
    byId('noBudgetSetBtn').addEventListener('click', editTotal);
    byId('addCategoryBudgetBtn').addEventListener('click', function () { editCategory(null); });
    byId('sortByPctBtn').addEventListener('click', function () { state.sort = 'ratio'; renderCategories(); });
    byId('sortByAmountBtn').addEventListener('click', function () { state.sort = 'amount'; renderCategories(); });
    byId('archiveBtn').addEventListener('click', function () { shiftPeriod(-1); });
    byId('rebalanceBtn').addEventListener('click', function () {
      var items = state.categories && state.categories.items || [];
      if (!state.budget.hasBudget || !items.length) { UI.toast('请先设置总预算和分类预算', 'error'); return; }
      var sum = items.reduce(function (n, x) { return n + x.budgetAmount; }, 0);
      if (!sum) return;
      if (!global.confirm('按现有分类比例，将分类预算合计调整为总预算？')) return;
      Promise.all(items.map(function (x, i) {
        var amount = i === items.length - 1 ? state.budget.totalAmount - items.slice(0, -1).reduce(function (n, y) { return n + Math.round(state.budget.totalAmount * y.budgetAmount / sum * 100) / 100; }, 0) : Math.round(state.budget.totalAmount * x.budgetAmount / sum * 100) / 100;
        return API.put('/budget/categories/' + x.categoryId, { period: state.period, amount: amount });
      })).then(function () { UI.toast('分类预算已智能对齐', 'success'); return load(); });
    });
  }

  function bindSetup() {
    var recommend = byId('setup-recommend-btn');
    var custom = byId('setup-custom-btn');
    var apply = byId('setup-apply-btn');
    if (recommend) recommend.addEventListener('click', function () { saveTotal(3000).then(function () { global.location.href = '10-budget-overview.html?period=' + state.period; }); });
    if (custom) custom.addEventListener('click', editTotal);
    if (apply) apply.addEventListener('click', function () {
      var plan = { '餐饮美食': 1200, '交通出行': 400, '休闲娱乐': 300, '居家生活': 600, '服饰购物': 300 };
      saveTotal(3000).then(function () {
        var cats = (state.ctx.categories || []).filter(function (x) { return plan[x.name] != null; });
        return Promise.all(cats.map(function (x) { return API.put('/budget/categories/' + x.id, { period: state.period, amount: plan[x.name] }); }));
      }).then(function () { UI.toast('预算方案已启用', 'success'); global.location.href = '10-budget-overview.html?period=' + state.period; });
    });
  }

  UI.boot(function (ctx) {
    state.ctx = ctx;
    var page = document.body.getAttribute('data-page');
    if (page === 'budget-overview') bindOverview();
    if (page === 'budget-setup') bindSetup();
    return load();
  });
})(window);
