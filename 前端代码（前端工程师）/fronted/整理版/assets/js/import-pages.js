/* 明账导入：原始文本只在浏览器解析，后端仅接收结构化明细。 */
(function (global) {
  'use strict';
  var API = global.MZ_API, UI = global.MZ_UI, FMT = global.MZ_FMT;
  if (!API || !UI || !FMT) return;
  var state = { ctx: null, rows: [], duplicates: {}, source: 'import_text', fileName: null };
  function el(id) { return document.getElementById(id); }
  function text(id, value) { if (el(id)) el(id).textContent = value; }

  function defaultAccount() {
    return state.ctx.accounts.find(function (x) { return x.isDefault && !x.isArchived; }) ||
      state.ctx.accounts.find(function (x) { return !x.isArchived; });
  }
  function categoryFor(type, merchant) {
    var rules = (state.ctx.categoryRules || []).slice().sort(function (a, b) { return b.priority - a.priority; });
    var hit = rules.find(function (r) {
      if (r.categoryType !== type) return false;
      var hay = String(merchant || '').toLowerCase(), key = String(r.keyword || '').toLowerCase();
      return r.matchType === 'equals' ? hay === key : hay.indexOf(key) !== -1;
    });
    if (hit) return state.ctx.categories.find(function (c) { return c.id === hit.categoryId; });
    return state.ctx.categories.find(function (c) { return c.type === type && !c.isArchived; });
  }

  function parseLine(line, index) {
    var clean = String(line || '').trim();
    if (!clean) return null;
    var m = clean.match(/(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})(?:\s+|T)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s+([+-]?[¥￥]?\s*[\d,]+(?:\.\d{1,2})?)(?:\s+(.+))?$/);
    if (!m) return { error: '第 ' + (index + 1) + ' 行无法识别：请使用“日期 时间 商户 金额 渠道”格式' };
    var signed = Number(m[4].replace(/[¥￥,\s]/g, ''));
    if (!isFinite(signed) || signed === 0) return { error: '第 ' + (index + 1) + ' 行金额无效' };
    var type = signed > 0 ? 'income' : 'expense';
    var merchant = m[3].trim();
    var category = categoryFor(type, merchant);
    var account = defaultAccount();
    if (!category || !account) return { error: '请先在设置中创建可用的账户与分类' };
    return {
      type: type,
      amount: Math.abs(signed),
      happenedAt: m[1].replace(/\//g, '-') + ' ' + (m[2].length === 5 ? m[2] + ':00' : m[2]),
      merchant: merchant,
      note: (m[5] || '').trim().slice(0, 100),
      accountId: account.id,
      accountName: account.name,
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      selected: true,
    };
  }

  function parseText(raw) {
    var rows = [], errors = [];
    String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach(function (line, i) {
      var parsed = parseLine(line, i);
      if (!parsed) return;
      if (parsed.error) errors.push(parsed.error); else rows.push(parsed);
    });
    if (!rows.length) { UI.toast(errors[0] || '没有识别到可导入流水', 'error'); return; }
    if (errors.length) UI.toast('已跳过 ' + errors.length + ' 行无法识别的内容', 'info');
    state.rows = rows; state.duplicates = {};
    API.post('/import/dedup-check', { items: rows.map(function (x) { return { amount: x.amount, happenedAt: x.happenedAt, merchant: x.merchant }; }) })
      .then(function (result) {
        result.items.forEach(function (x) { if (x.duplicate) { state.duplicates[x.index] = x; state.rows[x.index].selected = false; } });
        renderPreview(); UI.toast('已解析 ' + rows.length + ' 笔，并完成重复检测', 'success');
      });
  }

  function renderPreview() {
    var body = el('import-preview-rows'); if (!body) return;
    if (!state.rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="py-16 text-center text-on-surface-variant">粘贴账单文本或选择 CSV/TXT 文件后，点击“立即智能解析”</td></tr>';
    } else {
      body.innerHTML = UI.each(state.rows, function (x, i) {
        var dup = !!state.duplicates[i];
        return '<tr class="hover:bg-surface-container-low/40 ' + (dup ? 'opacity-60' : '') + '">' +
          '<td class="py-3 pl-6 text-center"><input data-select="' + i + '" type="checkbox" class="w-4 h-4 accent-primary" ' + (x.selected ? 'checked' : '') + '></td>' +
          '<td class="py-3 px-2 whitespace-nowrap">' + UI.esc(x.happenedAt.slice(5, 16)) + '</td>' +
          '<td class="py-3 px-4"><strong>' + UI.esc(x.merchant) + '</strong><div class="text-outline text-xs">' + UI.esc(x.note || '无备注') + '</div></td>' +
          '<td class="py-3 px-2 text-right whitespace-nowrap ' + (x.type === 'income' ? 'text-primary' : '') + '">' + (x.type === 'income' ? '+' : '') + FMT.money(x.amount) + '</td>' +
          '<td class="py-3 px-4">' + UI.esc(x.categoryName) + '</td><td class="py-3 px-2">' + UI.esc(x.accountName) + '</td>' +
          '<td class="py-3 pr-6 text-center">' + (dup ? '<span class="text-secondary">疑似重复</span>' : '<span class="text-primary">待导入</span>') + '</td></tr>';
      });
      body.querySelectorAll('[data-select]').forEach(function (box) {
        box.addEventListener('change', function () { state.rows[Number(box.getAttribute('data-select'))].selected = box.checked; updateSummary(); });
      });
    }
    updateSummary();
  }

  function updateSummary() {
    var chosen = state.rows.filter(function (x) { return x.selected; });
    var duplicates = Object.keys(state.duplicates).length;
    var expense = chosen.filter(function (x) { return x.type === 'expense'; }).reduce(function (n, x) { return n + x.amount; }, 0);
    var income = chosen.filter(function (x) { return x.type === 'income'; }).reduce(function (n, x) { return n + x.amount; }, 0);
    text('import-total-count', state.rows.length); text('import-duplicate-count', duplicates); text('import-valid-count', chosen.length);
    text('import-expense-total', FMT.money(expense)); text('import-income-total', '+' + FMT.money(income));
    text('import-selected-label', '已选择 ' + chosen.length + ' 笔流水');
    text('import-selected-detail', duplicates ? '已自动取消 ' + duplicates + ' 笔疑似重复' : '未发现疑似重复');
    text('import-selected-amount', FMT.money(expense)); text('import-confirm-label', '确认导入到账本 (' + chosen.length + '笔)');
  }

  function confirmImport() {
    var chosen = state.rows.filter(function (x) { return x.selected; });
    if (!chosen.length) { UI.toast('请至少选择一笔流水', 'error'); return; }
    var batchNo = 'WEB-' + Date.now().toString(36).toUpperCase();
    API.post('/import/batches', {
      batchNo: batchNo, source: state.source, channel: 'other', fileName: state.source === 'import_csv' ? state.fileName : undefined,
      totalCount: state.rows.length, duplicateCount: Object.keys(state.duplicates).length,
      items: chosen.map(function (x) { return { type: x.type, amount: x.amount, happenedAt: x.happenedAt, merchant: x.merchant, note: x.note, accountId: x.accountId, categoryId: x.categoryId }; }),
    }).then(function (result) {
      try { sessionStorage.setItem('mz-last-import', JSON.stringify(result.batch)); } catch (e) {}
      global.location.href = '19-import-success.html?batch=' + result.batch.id;
    });
  }

  function bindMain(ctx) {
    state.ctx = ctx; renderPreview();
    el('import-parse-btn').addEventListener('click', function () { state.source = 'import_text'; state.fileName = null; parseText(el('raw-bill-input').value); });
    el('import-file-input').addEventListener('change', function () {
      var file = this.files && this.files[0]; if (!file) return;
      if (!/\.(csv|txt)$/i.test(file.name)) { UI.toast('当前仅支持 CSV 或 TXT 文本文件', 'error'); this.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () { state.source = 'import_csv'; state.fileName = file.name; el('raw-bill-input').value = String(reader.result || ''); parseText(reader.result); };
      reader.onerror = function () { UI.toast('文件读取失败', 'error'); };
      reader.readAsText(file, 'UTF-8');
    });
    el('import-history-btn').addEventListener('click', function () { global.location.href = '19-import-success.html'; });
    el('import-clear-btn').addEventListener('click', function () { state.rows = []; state.duplicates = {}; el('raw-bill-input').value = ''; renderPreview(); });
    el('import-confirm-btn').addEventListener('click', confirmImport);
    el('toggle-duplicates').addEventListener('change', function () {
      var hide = this.checked;
      el('import-preview-rows').querySelectorAll('[data-select]').forEach(function (box) {
        var row = box.closest('tr'), i = Number(box.getAttribute('data-select'));
        row.style.display = hide && state.duplicates[i] ? 'none' : '';
      });
    });
  }

  function bindSuccess() {
    var wanted = null;
    try { wanted = Number(new URLSearchParams(global.location.search).get('batch')); } catch (e) {}
    API.get('/import/batches', { page: 1, pageSize: 50 }, { raw: true }).then(function (result) {
      var list = result.data || [], batch = list.find(function (x) { return x.id === wanted; }) || list[0];
      document.querySelector('main').innerHTML = '<div class="max-w-[1100px] mx-auto p-margin-lg flex flex-col gap-space-lg">' +
        '<header class="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><p class="font-label-sm text-label-sm text-primary">数据管理</p><h1 class="font-headline-lg text-headline-lg">导入历史</h1><p class="mt-1 text-on-surface-variant">导入后 10 分钟内可撤销；撤销只移除本批次流水，不影响其他账目。</p></div><a href="18-import-main.html" class="px-5 py-3 rounded-xl bg-primary text-on-primary">继续导入</a></header>' +
        (batch ? '<section class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary">' + (batch.status === 'reverted' ? 'undo' : 'check_circle') + '</span><h2 class="font-headline-md text-headline-md" id="import-result-title">' + (batch.status === 'reverted' ? '最近批次已撤销' : '最近批次已完成') + '</h2></div><p class="mt-2 text-on-surface-variant"><strong>' + UI.esc(batch.batchNo) + '</strong> · 入账 ' + batch.importedCount + ' 笔 · 跳过 ' + batch.skippedCount + ' 笔</p><p class="mt-1 text-sm text-on-surface-variant">创建于 ' + UI.esc(batch.createdAt) + (batch.canUndo ? ' · 撤销剩余 <strong id="undo-countdown">--:--</strong>' : '') + '</p></div><div class="flex gap-2">' + (batch.canUndo ? '<button id="undo-btn" class="px-4 py-2 rounded-xl bg-error-container text-error">撤销本批次</button>' : '') + '<a href="13-ledger-list.html" class="px-4 py-2 rounded-xl bg-surface-container">查看流水</a></div></section>' : '<section class="rounded-2xl bg-surface-container-lowest p-16 text-center text-on-surface-variant">还没有导入记录</section>') +
        '<section class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm"><h2 class="font-headline-sm text-headline-sm">全部批次</h2><div class="mt-4 divide-y divide-surface-container">' + (list.length ? UI.each(list, function (x) { return '<div class="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><strong>' + UI.esc(x.batchNo) + '</strong><p class="text-sm text-on-surface-variant">' + UI.esc(x.createdAt) + ' · ' + (x.source === 'import_csv' ? '文件导入' : '文本导入') + '</p></div><div class="flex items-center gap-4"><span>入账 ' + x.importedCount + ' 笔</span><span class="px-2 py-1 rounded-lg ' + (x.status === 'reverted' ? 'bg-surface-container text-on-surface-variant' : 'bg-primary-fixed text-primary') + '">' + (x.status === 'reverted' ? '已撤销' : '已完成') + '</span></div></div>'; }) : '<p class="py-10 text-center text-on-surface-variant">暂无批次</p>') + '</div></section></div>';
      if (!batch) return;
      var timer = null;
      function tick() {
        var seconds = Math.max(0, Math.floor((new Date(String(batch.undoExpiresAt).replace(' ', 'T') + '+08:00').getTime() - Date.now()) / 1000));
        text('undo-countdown', String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'));
        var enabled = batch.canUndo && batch.status === 'completed' && seconds > 0;
        if (el('undo-btn')) { el('undo-btn').disabled = !enabled; el('undo-btn').classList.toggle('opacity-50', !enabled); }
        if (!seconds && timer) clearInterval(timer);
      }
      tick(); timer = setInterval(tick, 1000);
      if (el('undo-btn')) el('undo-btn').addEventListener('click', function () {
        if (!batch.canUndo || !global.confirm('确认撤销本次导入？本批次流水将从账本中移除。')) return;
        API.post('/import/batches/' + batch.id + '/undo', {}).then(function (data) { UI.toast('已撤销 ' + data.revertedCount + ' 笔导入流水', 'success'); bindSuccess(); });
      });
    });
  }

  UI.boot(function (ctx) {
    var page = document.body.getAttribute('data-page');
    if (page === 'import-main') bindMain(ctx);
    if (page === 'import-success') bindSuccess();
  });
})(window);
