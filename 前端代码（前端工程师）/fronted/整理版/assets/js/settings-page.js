/* 设置页：个人资料与资金账户的真实读写交互。 */
(function (global) {
  'use strict';
  var API = global.MZ_API, UI = global.MZ_UI, FMT = global.MZ_FMT;
  if (!API || !UI || !FMT) return;
  var context = null;
  var preferenceSnapshot = null;
  var budgetSnapshot = null;
  var accountTypes = {
    cash: { label: '现金', icon: 'payments' },
    wechat: { label: '微信钱包', icon: 'chat' },
    alipay: { label: '支付宝', icon: 'savings' },
    bank: { label: '银行卡', icon: 'account_balance' },
    credit: { label: '信用卡', icon: 'credit_card' },
  };
  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var node = byId(id); if (node) node.textContent = value == null ? '' : value; }

  function modal(content) {
    var layer = document.createElement('div');
    layer.className = 'fixed inset-0 z-[130] bg-inverse-surface/40 backdrop-blur-sm flex items-center justify-center p-4';
    layer.innerHTML = content;
    document.body.appendChild(layer);
    function close() { layer.remove(); }
    layer.querySelectorAll('[data-close]').forEach(function (button) { button.addEventListener('click', close); });
    layer.addEventListener('click', function (event) { if (event.target === layer) close(); });
    return { layer: layer, close: close };
  }

  function openProfileEditor() {
    API.get('/settings/profile').then(function (profile) {
      var defaultAvatar = '../assets/img/logo.svg';
      var dialog = modal(
        '<form class="w-full max-w-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-lg">' +
          '<div class="flex items-start justify-between"><div><h2 class="font-headline-md text-headline-md">编辑个人资料</h2><p class="mt-1 text-sm text-on-surface-variant">选择本地图片即可上传头像，手机号和邮箱需要验证码换绑。</p></div><button type="button" data-close><span class="material-symbols-outlined">close</span></button></div>' +
          '<div class="flex items-center gap-4"><img data-avatar-preview class="w-20 h-20 rounded-full object-cover border-2 border-surface-container" src="' + UI.esc(profile.avatarUrl || defaultAvatar) + '" alt="头像预览"><div class="flex-1"><label class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-surface-container px-4 py-2 text-primary"><span class="material-symbols-outlined text-base">upload</span><span>选择头像图片</span><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden"></label><p class="mt-2 text-xs text-on-surface-variant">支持 JPG、PNG、WebP、GIF，最大 5MB</p>' +
          (profile.avatarUrl ? '<button type="button" data-remove-avatar class="mt-2 text-xs text-error hover:underline">恢复默认头像</button>' : '') + '</div></div>' +
          '<label class="flex flex-col gap-2"><span>昵称</span><input name="displayName" maxlength="50" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + UI.esc(profile.displayName || '') + '" placeholder="请输入昵称"></label>' +
          '<div class="rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">登录账号：' + UI.esc(profile.email || profile.phone || '未绑定') + '<br>UID：' + UI.esc(profile.uid) + '</div>' +
          '<div class="flex justify-end gap-2"><button type="button" data-close class="px-4 py-2 rounded-xl bg-surface-container">取消</button><button type="submit" class="px-5 py-2 rounded-xl bg-primary text-on-primary">保存资料</button></div>' +
        '</form>'
      );
      var form = dialog.layer.querySelector('form');
      var fileInput = form.elements.avatar;
      var preview = dialog.layer.querySelector('[data-avatar-preview]');
      var previewUrl = null;
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
          UI.toast('仅支持 JPG、PNG、WebP 或 GIF 图片', 'error');
          fileInput.value = '';
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          UI.toast('头像图片不能超过 5MB', 'error');
          fileInput.value = '';
          return;
        }
        if (previewUrl) global.URL.revokeObjectURL(previewUrl);
        previewUrl = global.URL.createObjectURL(file);
        preview.src = previewUrl;
      });

      var removeButton = dialog.layer.querySelector('[data-remove-avatar]');
      if (removeButton) removeButton.addEventListener('click', function () {
        removeButton.disabled = true;
        API.del('/settings/avatar').then(function (updated) {
          preview.src = defaultAvatar;
          var avatar = byId('settings-user-avatar'); if (avatar) avatar.src = defaultAvatar;
          context.user = updated; UI.renderUser(updated, context.ledger);
          API.setSession({ token: API.getToken(), user: updated, ledger: context.ledger });
          UI.toast('已恢复默认头像', 'success');
          removeButton.remove();
        }).catch(function () { removeButton.disabled = false; });
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var submit = dialog.layer.querySelector('[type="submit"]'); submit.disabled = true;
        var displayName = form.elements.displayName.value.trim();
        var file = fileInput.files && fileInput.files[0];
        var request = API.put('/settings/profile', { displayName: displayName });
        if (file) {
          request = request.then(function () {
            var data = new FormData();
            data.append('avatar', file, file.name);
            return API.upload('/settings/avatar', data);
          });
        }
        request
          .then(function (updated) {
            setText('settings-user-name', updated.displayName || '用户');
            var avatar = byId('settings-user-avatar'); if (avatar) avatar.src = updated.avatarUrl || defaultAvatar;
            context.user = updated; UI.renderUser(updated, context.ledger);
            API.setSession({ token: API.getToken(), user: updated, ledger: context.ledger });
            if (previewUrl) global.URL.revokeObjectURL(previewUrl);
            UI.toast('个人资料已保存', 'success'); dialog.close();
          })
          .catch(function () { submit.disabled = false; });
      });
    });
  }

  function openLedgerEditor() {
    var dialog = modal(
      '<form class="w-full max-w-md rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-lg">' +
        '<div class="flex items-start justify-between"><div><h2 class="font-headline-md text-headline-md">编辑账本名称</h2><p class="mt-1 text-sm text-on-surface-variant">修改后会同步显示在侧边栏和数据导出中。</p></div><button type="button" data-close><span class="material-symbols-outlined">close</span></button></div>' +
        '<label class="flex flex-col gap-2"><span>账本名称</span><input name="name" required maxlength="50" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + UI.esc(context.ledger.name || '') + '"></label>' +
        '<div class="flex justify-end gap-2"><button type="button" data-close class="px-4 py-2 rounded-xl bg-surface-container">取消</button><button type="submit" class="px-5 py-2 rounded-xl bg-primary text-on-primary">保存名称</button></div>' +
      '</form>'
    );
    var form = dialog.layer.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      API.put('/settings/ledgers/' + context.ledger.id, { name: form.elements.name.value.trim() })
        .then(function (updated) {
          context.ledger.name = updated.name;
          var input = byId('settings-ledger-name'); if (input) input.value = updated.name;
          UI.renderUser(context.user, context.ledger);
          API.setSession({ token: API.getToken(), user: context.user, ledger: context.ledger });
          UI.toast('账本名称已更新', 'success');
          dialog.close();
        })
        .catch(function () { submit.disabled = false; });
    });
  }

  function accountForm(item) {
    var editing = !!item;
    var selectedType = item ? item.type : 'cash';
    var dialog = modal(
      '<form class="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-surface-container-lowest p-space-lg shadow-xl flex flex-col gap-space-md">' +
        '<div class="flex items-start justify-between"><div><h2 class="font-headline-md text-headline-md">' + (editing ? '编辑资金账户' : '添加新资金账户') + '</h2><p class="mt-1 text-sm text-on-surface-variant">账户余额由初始余额与后续流水共同计算。</p></div><button type="button" data-close><span class="material-symbols-outlined">close</span></button></div>' +
        '<label class="flex flex-col gap-2"><span>账户类型</span><select name="type" class="rounded-xl bg-surface-container-low px-4 py-3" ' + (editing ? 'disabled' : '') + '>' +
          Object.keys(accountTypes).map(function (key) { return '<option value="' + key + '" ' + (key === selectedType ? 'selected' : '') + '>' + accountTypes[key].label + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="flex flex-col gap-2"><span>账户名称</span><input name="name" required maxlength="50" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + UI.esc(item && item.name || '') + '" placeholder="例如：招商银行储蓄卡"></label>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="flex flex-col gap-2"><span>初始余额</span><input name="initialBalance" required type="number" min="0" step="0.01" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + (item ? item.initialBalance : '0') + '"></label>' +
        '<label class="flex flex-col gap-2"><span>卡号尾号（可选）</span><input name="cardTail" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + UI.esc(item && item.cardTail || '') + '" placeholder="4 位数字"></label></div>' +
        '<div data-credit-fields class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="flex flex-col gap-2"><span>授信额度</span><input name="creditLimit" type="number" min="0.01" step="0.01" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + (item && item.creditLimit != null ? item.creditLimit : '') + '"></label><label class="flex flex-col gap-2"><span>当期待还</span><input name="billDue" type="number" min="0" step="0.01" class="rounded-xl bg-surface-container-low px-4 py-3 outline-none" value="' + (item && item.billDue != null ? item.billDue : '') + '"></label></div>' +
        '<label class="flex items-center gap-2"><input name="isDefault" type="checkbox" class="w-4 h-4 accent-primary" ' + (item && item.isDefault ? 'checked' : '') + '><span>设为默认记账账户</span></label>' +
        '<div class="flex items-center justify-between gap-2">' + (editing && !item.isDefault ? '<button type="button" data-archive class="px-3 py-2 rounded-xl text-error hover:bg-error-container/30">归档账户</button>' : '<span></span>') + '<div class="flex gap-2"><button type="button" data-close class="px-4 py-2 rounded-xl bg-surface-container">取消</button><button type="submit" class="px-5 py-2 rounded-xl bg-primary text-on-primary">' + (editing ? '保存账户' : '创建账户') + '</button></div></div>' +
      '</form>'
    );
    var form = dialog.layer.querySelector('form');
    function updateCreditFields() {
      var type = form.elements.type.value;
      var fields = dialog.layer.querySelector('[data-credit-fields]');
      fields.style.display = type === 'credit' ? '' : 'none';
      form.elements.creditLimit.required = type === 'credit';
    }
    form.elements.type.addEventListener('change', updateCreditFields); updateCreditFields();
    var archive = dialog.layer.querySelector('[data-archive]');
    if (archive) archive.addEventListener('click', function () {
      var balanceText = item.balance ? '，当前余额为 ' + FMT.money(item.balance) : '';
      if (!global.confirm('归档后该账户不会出现在新记账选择器中，历史流水仍会保留' + balanceText + '。确认归档？')) return;
      archive.disabled = true;
      API.del('/accounts/' + item.id).then(function (result) {
        UI.toast(result.notice || '资金账户已归档', 'success');
        dialog.close();
        loadAccounts();
      }).catch(function () { archive.disabled = false; });
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var type = form.elements.type.value;
      var body = {
        name: form.elements.name.value.trim(),
        initialBalance: Number(form.elements.initialBalance.value || 0),
        cardTail: form.elements.cardTail.value.trim() || null,
        isDefault: form.elements.isDefault.checked,
      };
      if (!editing) { body.type = type; body.icon = accountTypes[type].icon; body.color = type === 'credit' ? '#8B5CF6' : '#14B8A6'; }
      if (type === 'credit') { body.creditLimit = Number(form.elements.creditLimit.value); body.billDue = form.elements.billDue.value === '' ? null : Number(form.elements.billDue.value); }
      var submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      var request = editing ? API.patch('/accounts/' + item.id, body) : API.post('/accounts', body);
      request.then(function () { UI.toast(editing ? '资金账户已更新' : '资金账户已添加', 'success'); dialog.close(); loadAccounts(); })
        .catch(function () { submit.disabled = false; });
    });
  }

  function loadAccounts() {
    return API.get('/accounts').then(function (accounts) {
      var container = byId('settings-account-list');
      if (!container) return;
      var netWorth = accounts.reduce(function (sum, item) { return sum + Number(item.balance || 0); }, 0);
      var liquid = accounts.filter(function (item) { return item.type !== 'credit'; }).reduce(function (sum, item) { return sum + Number(item.balance || 0); }, 0);
      var creditUsed = accounts.reduce(function (sum, item) { return sum + Number(item.creditUsed || 0); }, 0);
      setText('settings-net-worth', FMT.money(netWorth)); setText('settings-liquid-total', FMT.money(liquid)); setText('settings-credit-used', FMT.money(creditUsed));
      container.innerHTML = accounts.length ? UI.each(accounts, function (item) {
        var type = accountTypes[item.type] || accountTypes.cash;
        var amount = item.type === 'credit' ? '已用 ' + FMT.money(item.creditUsed || 0) : FMT.money(item.balance || 0);
        var detail = item.type === 'credit' ? '可用 ' + FMT.money(item.creditAvailable || 0) : '初始余额 ' + FMT.money(item.initialBalance || 0);
        return '<article class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-space-md bg-surface-bright rounded-xl gap-space-md" data-account-id="' + item.id + '">' +
          '<div class="flex items-center gap-space-md"><div class="w-12 h-12 rounded-xl flex items-center justify-center text-primary" style="background:' + UI.esc(item.color || '#14B8A6') + '18;color:' + UI.esc(item.color || '#14B8A6') + '"><span class="material-symbols-outlined">' + UI.esc(item.icon || type.icon) + '</span></div><div><div class="flex items-center gap-2"><strong>' + UI.esc(item.name) + '</strong>' + (item.isDefault ? '<span class="px-2 py-0.5 rounded bg-primary text-on-primary text-xs">默认账户</span>' : '') + '</div><p class="text-sm text-on-surface-variant">' + type.label + (item.cardTail ? ' · 尾号 ' + UI.esc(item.cardTail) : '') + ' · ' + detail + '</p></div></div>' +
          '<div class="flex items-center gap-3 self-end sm:self-auto"><strong>' + amount + '</strong>' + (!item.isDefault ? '<button data-default class="px-3 py-1.5 rounded-lg bg-surface-container text-primary">设为默认</button>' : '') + '<button data-edit class="w-9 h-9 rounded-lg hover:bg-surface-container" title="编辑账户"><span class="material-symbols-outlined">tune</span></button></div></article>';
      }) : '<p class="py-10 text-center text-on-surface-variant">还没有资金账户</p>';
      container.querySelectorAll('[data-account-id]').forEach(function (card) {
        var item = accounts.find(function (account) { return account.id === Number(card.getAttribute('data-account-id')); });
        card.querySelector('[data-edit]').addEventListener('click', function () { accountForm(item); });
        var setDefault = card.querySelector('[data-default]');
        if (setDefault) setDefault.addEventListener('click', function () { API.put('/accounts/' + item.id + '/default', {}).then(function () { UI.toast('默认账户已更新', 'success'); loadAccounts(); }); });
      });
    });
  }

  function preferenceControls() {
    return {
      language: byId('settings-language'),
      currency: byId('settings-currency'),
      sound: byId('settings-sound-enabled'),
      yellow: byId('settings-alert-yellow'),
      red: byId('settings-alert-red'),
      save: byId('settings-save-preferences'),
      discard: byId('settings-discard-preferences'),
      status: byId('settings-preferences-status'),
    };
  }

  function applyPreferenceState(preferences, budget) {
    var controls = preferenceControls();
    preferenceSnapshot = preferences;
    budgetSnapshot = budget;
    if (controls.language) controls.language.value = preferences.language || 'zh-CN';
    if (controls.currency) controls.currency.value = preferences.currency || 'CNY';
    if (controls.sound) controls.sound.checked = !!preferences.soundEnabled;
    if (controls.yellow) {
      controls.yellow.value = budget.hasBudget ? budget.alertYellowPct : 80;
      controls.yellow.disabled = !budget.hasBudget;
      setText('caution-val', controls.yellow.value + '%');
    }
    if (controls.red) {
      controls.red.value = budget.hasBudget ? budget.alertRedPct : 100;
      controls.red.disabled = !budget.hasBudget;
      setText('danger-val', controls.red.value + '%');
    }
    if (controls.save) controls.save.disabled = true;
    if (controls.status) controls.status.textContent = budget.hasBudget
      ? '偏好与本月预算预警参数已同步到服务端'
      : '通用偏好可保存；本月尚未设置预算，预警阈值请先到预算页配置';
  }

  function markPreferencesDirty() {
    var controls = preferenceControls();
    if (controls.save) controls.save.disabled = false;
    if (controls.status) controls.status.textContent = '有尚未保存的设置';
  }

  function loadPreferences() {
    var period = UI.currentPeriod();
    return Promise.all([
      API.get('/settings/preferences'),
      API.get('/budget', { period: period }),
    ]).then(function (results) {
      applyPreferenceState(results[0], results[1]);
      var controls = preferenceControls();
      [controls.language, controls.currency, controls.sound, controls.yellow, controls.red].forEach(function (control) {
        if (control) control.addEventListener('change', markPreferencesDirty);
      });
      if (controls.discard) controls.discard.addEventListener('click', function () {
        applyPreferenceState(preferenceSnapshot, budgetSnapshot);
        UI.toast('未保存的设置已放弃', 'info');
      });
      if (controls.save) controls.save.addEventListener('click', function () {
        var yellow = Number(controls.yellow && controls.yellow.value || 80);
        var red = Number(controls.red && controls.red.value || 100);
        if (red <= yellow) {
          UI.toast('红色阈值必须大于黄色阈值', 'error');
          return;
        }
        controls.save.disabled = true;
        var requests = [API.put('/settings/preferences', {
          language: controls.language.value,
          currency: controls.currency.value,
          soundEnabled: controls.sound.checked,
        })];
        if (budgetSnapshot.hasBudget) {
          requests.push(API.put('/budget', {
            period: budgetSnapshot.period,
            totalAmount: budgetSnapshot.totalAmount,
            alertYellowPct: yellow,
            alertRedPct: red,
            safeSpendMode: 'daily_flat',
          }));
        }
        Promise.all(requests).then(function (saved) {
          applyPreferenceState(saved[0], saved[1] || budgetSnapshot);
          UI.toast('设置已保存', 'success');
        }).catch(function () { controls.save.disabled = false; });
      });
    });
  }

  UI.boot(function (ctx) {
    context = ctx;
    var avatar = byId('settings-user-avatar');
    if (avatar) avatar.src = ctx.user.avatarUrl || '../assets/img/logo.svg';
    var profile = byId('settings-edit-profile'); if (profile) profile.addEventListener('click', openProfileEditor);
    var editLedger = byId('settings-edit-ledger'); if (editLedger) editLedger.addEventListener('click', openLedgerEditor);
    var addAccount = byId('settings-add-account'); if (addAccount) addAccount.addEventListener('click', function () { accountForm(null); });
    return Promise.all([loadAccounts(), loadPreferences()]);
  });
})(window);
