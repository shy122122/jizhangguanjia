/* 分类设置：用后端分类资源替换交付稿中的静态抽屉演示。 */
(function (global) {
  'use strict';
  var API = global.MZ_API, UI = global.MZ_UI;
  if (!API || !UI) return;
  var state = { items: [], type: 'expense' };
  var icons = ['restaurant', 'directions_subway', 'shopping_bag', 'home', 'sports_esports', 'medical_services', 'school', 'pets', 'payments', 'category'];
  var colors = ['#14B8A6', '#06B6D4', '#F59E0B', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];
  function root() { return document.querySelector('main'); }

  function load() {
    return API.get('/categories', { includeArchived: 0 }).then(function (items) { state.items = items; render(); });
  }

  function render() {
    var filtered = state.items.filter(function (x) { return x.type === state.type; });
    root().innerHTML = '<div class="max-w-[1120px] mx-auto p-margin-lg flex flex-col gap-space-lg">' +
      '<div class="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><p class="font-label-sm text-label-sm text-primary">设置 · 分类管理</p><h1 class="font-headline-lg text-headline-lg">收支分类</h1><p class="mt-1 text-on-surface-variant">分类变更会同步到记账、预算和统计页面；归档不会删除历史流水。</p></div>' +
      '<button data-create class="rounded-xl bg-primary text-on-primary px-5 py-3 flex items-center gap-2"><span class="material-symbols-outlined">add</span>新增分类</button></div>' +
      '<div class="inline-flex self-start rounded-xl bg-surface-container-low p-1"><button data-type="expense" class="px-5 py-2 rounded-lg ' + (state.type === 'expense' ? 'bg-surface-container-lowest text-primary shadow-sm' : '') + '">支出分类</button><button data-type="income" class="px-5 py-2 rounded-lg ' + (state.type === 'income' ? 'bg-surface-container-lowest text-primary shadow-sm' : '') + '">收入分类</button></div>' +
      '<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md" id="category-settings-grid">' +
      UI.each(filtered, function (x) {
        return '<article class="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm flex items-center justify-between gap-3" data-id="' + x.id + '">' +
          '<div class="flex items-center gap-3 min-w-0"><div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style="background:' + UI.esc(x.color || '#14B8A6') + '18;color:' + UI.esc(x.color || '#14B8A6') + '"><span class="material-symbols-outlined">' + UI.esc(x.icon || 'category') + '</span></div>' +
          '<div class="min-w-0"><strong class="block truncate">' + UI.esc(x.name) + '</strong><span class="text-xs text-on-surface-variant">' + (x.isSystem ? '系统预设' : '自定义分类') + '</span></div></div>' +
          '<button data-edit class="w-9 h-9 rounded-lg hover:bg-surface-container text-on-surface-variant"><span class="material-symbols-outlined">edit</span></button></article>';
      }) + '</section>' +
      '<a href="21-settings-index.html" class="self-start text-primary hover:underline">返回设置首页</a></div>';
    root().querySelector('[data-create]').addEventListener('click', function () { openEditor(null); });
    root().querySelectorAll('[data-type]').forEach(function (b) { b.addEventListener('click', function () { state.type = b.getAttribute('data-type'); render(); }); });
    root().querySelectorAll('[data-id]').forEach(function (card) {
      card.querySelector('[data-edit]').addEventListener('click', function () {
        openEditor(state.items.find(function (x) { return x.id === Number(card.getAttribute('data-id')); }));
      });
    });
  }

  function openEditor(item) {
    var layer = document.createElement('div');
    layer.className = 'fixed inset-0 z-[120] bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4';
    layer.innerHTML = '<form class="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-lg">' +
      '<div class="flex justify-between"><div><h2 class="font-headline-md text-headline-md">' + (item ? '编辑分类' : '新增分类') + '</h2><p class="text-on-surface-variant text-sm">名称最多 12 个字，类型创建后不可修改。</p></div><button type="button" data-close><span class="material-symbols-outlined">close</span></button></div>' +
      '<label class="flex flex-col gap-2"><span>分类类型</span><select name="type" class="rounded-xl bg-surface-container-low px-4 py-3" ' + (item ? 'disabled' : '') + '><option value="expense" ' + ((item ? item.type : state.type) === 'expense' ? 'selected' : '') + '>支出</option><option value="income" ' + ((item ? item.type : state.type) === 'income' ? 'selected' : '') + '>收入</option></select></label>' +
      '<label class="flex flex-col gap-2"><span>分类名称</span><input name="name" maxlength="12" required class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + UI.esc(item && item.name || '') + '"></label>' +
      '<div><span>图标</span><div class="mt-2 grid grid-cols-5 gap-2">' + UI.each(icons, function (icon) { return '<button type="button" data-icon="' + icon + '" class="h-12 rounded-xl bg-surface-container-low ' + ((item && item.icon || 'category') === icon ? 'ring-2 ring-primary text-primary' : '') + '"><span class="material-symbols-outlined">' + icon + '</span></button>'; }) + '</div></div>' +
      '<div><span>颜色</span><div class="mt-2 flex flex-wrap gap-3">' + UI.each(colors, function (color) { return '<button type="button" data-color="' + color + '" class="w-9 h-9 rounded-full ' + ((item && item.color || '#14B8A6').toUpperCase() === color ? 'ring-2 ring-offset-2 ring-primary' : '') + '" style="background:' + color + '"></button>'; }) + '</div></div>' +
      '<div class="flex items-center justify-between gap-3">' + (item ? '<button type="button" data-archive class="text-error px-3 py-2 rounded-xl hover:bg-error-container">归档分类</button>' : '<span></span>') + '<div class="flex gap-2"><button type="button" data-cancel class="px-4 py-2 rounded-xl bg-surface-container">取消</button><button type="submit" class="px-5 py-2 rounded-xl bg-primary text-on-primary">保存</button></div></div></form>';
    document.body.appendChild(layer);
    var chosenIcon = item && item.icon || 'category', chosenColor = item && item.color || '#14B8A6';
    function close() { layer.remove(); }
    layer.querySelectorAll('[data-close],[data-cancel]').forEach(function (b) { b.addEventListener('click', close); });
    layer.querySelectorAll('[data-icon]').forEach(function (b) { b.addEventListener('click', function () { chosenIcon = b.getAttribute('data-icon'); layer.querySelectorAll('[data-icon]').forEach(function (x) { x.classList.remove('ring-2', 'ring-primary', 'text-primary'); }); b.classList.add('ring-2', 'ring-primary', 'text-primary'); }); });
    layer.querySelectorAll('[data-color]').forEach(function (b) { b.addEventListener('click', function () { chosenColor = b.getAttribute('data-color'); layer.querySelectorAll('[data-color]').forEach(function (x) { x.classList.remove('ring-2', 'ring-offset-2', 'ring-primary'); }); b.classList.add('ring-2', 'ring-offset-2', 'ring-primary'); }); });
    var archive = layer.querySelector('[data-archive]');
    if (archive) archive.addEventListener('click', function () {
      if (!global.confirm('归档后新记账将不再显示该分类，但历史流水会保留。确认归档？')) return;
      API.del('/categories/' + item.id).then(function (result) { UI.toast(result.txnCount ? '已归档，' + result.txnCount + ' 笔历史流水保持不变' : '分类已归档', 'success'); close(); load(); });
    });
    layer.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); var name = layer.querySelector('[name="name"]').value.trim();
      if (!name) { UI.toast('请输入分类名称', 'error'); return; }
      var body = { name: name, icon: chosenIcon, color: chosenColor };
      var request = item ? API.patch('/categories/' + item.id, body) : API.post('/categories', Object.assign(body, { type: layer.querySelector('[name="type"]').value }));
      request.then(function () { UI.toast('分类已保存', 'success'); close(); load(); });
    });
  }

  UI.boot(load);
})(window);
