/* ============================================================================
 * 明账（MingZhang）· UI 运行时
 *
 * 这个文件和 api.js 是**同一层**的两半：api.js 管「怎么拿到数据」，
 * 这里管「拿到数据之后，页面上那些反复要做的小事」——
 * 转义、遍历拼串、提示条、登录守卫、侧边栏用户名回填。
 *
 * 这里**故意不做**的事（做了一定会后悔）：
 *   1. 不做模板引擎。页面各写各的 `each(...)` + 字符串拼接，
 *      因为每个页面的列表结构本来就不一样，抽象出来只会多一层看不懂的映射。
 *   2. 不做「自动渲染 data-mz 属性」的魔法。谁渲染、渲染成什么样，
 *      在页面的 inline script 里一眼能看完，比一个全局扫描器好排查。
 *   3. 不碰 shell.js 的 DOM 结构，只在它渲染完之后回填用户名这类**数据**。
 *
 * 依赖顺序：api.js → ui.js → 页面 inline script → shell.js
 * （shell.js 放最后是它自己的约定，ui.js 在它之前加载不代表要用它的 DOM——
 *   所有涉及 shell 的操作都挂在 DOMContentLoaded 上，那时 shell 已经渲染完。）
 * ========================================================================== */

(function (global) {
  'use strict';

  var API = global.MZ_API;
  var FMT = global.MZ_FMT;

  if (!API) {
    // 顺序错了就没法工作。早报错好过后面一堆 undefined 的花式报错。
    if (global.console) console.error('[ui] 必须先加载 assets/js/api.js');
    return;
  }

  /* -------------------------------------------------------------------------
   * 基础 DOM 工具
   * ----------------------------------------------------------------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /**
   * HTML 转义。**所有来自接口的字符串在拼进 innerHTML 前必须过这里** ——
   * 商户名、备注、分类名都是用户输入，直接拼就是 XSS。
   * 只做文本插入（textContent）的场景不用转义，但那种场景很少。
   */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  /** 把数组映射成拼接好的 HTML 字符串。空数组返回 ''。 */
  function each(list, fn) {
    if (!list || !list.length) return '';
    var out = '';
    for (var i = 0; i < list.length; i += 1) out += fn(list[i], i);
    return out;
  }

  /** innerHTML 赋值（调用方自己保证已转义，或者内容全部由本文件生成） */
  function html(el, value) { if (el) el.innerHTML = value; }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }

  /** Material Symbols 图标的统一写法，省得每处都抄一遍 class */
  function icon(name, extraClass) {
    return '<span class="material-symbols-outlined ' + (extraClass || '') + '">' + esc(name) + '</span>';
  }

  /* -------------------------------------------------------------------------
   * 提示条
   *
   * 为什么自己造而不是用 alert：alert 会打断输入、无法样式化、
   * 移动端上还会弹两次（一次是 alert 本身，一次是浏览器问「是否阻止此页面…」）。
   * api.js 的错误钩子最终也落到这里（见文件末尾的 setNotifier）。
   * ----------------------------------------------------------------------- */

  var TOAST_ID = 'mz-toast-root';
  var toastTimer = null;

  function ensureToastRoot() {
    var root = document.getElementById(TOAST_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = TOAST_ID;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    // 位置：移动端贴底部（避开顶部固定栏），桌面端居中偏上。
    root.className =
      'fixed z-[100] left-1/2 -translate-x-1/2 bottom-24 md:bottom-auto md:top-20 ' +
      'flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md';
    document.body.appendChild(root);
    return root;
  }

  var TOAST_STYLE = {
    error: 'bg-error-container text-on-error-container',
    success: 'bg-primary text-on-primary',
    info: 'bg-inverse-surface text-inverse-on-surface',
  };

  /**
   * toast('已保存') / toast('余额不足', 'error')
   * type: info（默认）| success | error
   * 同一条消息 300ms 内重复触发只显示一次 —— 否则列表页批量失败时会糊满屏幕。
   */
  var lastToast = { msg: '', at: 0 };

  function toast(message, type) {
    if (!message) return;
    var msg = String(message);
    var kind = TOAST_STYLE[type] ? type : 'info';
    var now = Date.now();
    if (msg === lastToast.msg && now - lastToast.at < 300) return;
    lastToast = { msg: msg, at: now };

    var root = ensureToastRoot();
    root.innerHTML =
      '<div class="pointer-events-auto w-full rounded-xl px-4 py-3 shadow-lg ' +
      'font-body-md text-body-md flex items-start gap-2 ' +
      'animate-[mz-toast-in_.18s_ease-out] ' + TOAST_STYLE[kind] + '">' +
      icon(kind === 'error' ? 'error' : kind === 'success' ? 'check_circle' : 'info',
        'text-[1.125rem] flex-shrink-0') +
      '<span class="flex-1">' + esc(msg) + '</span>' +
      '</div>';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { root.innerHTML = ''; }, kind === 'error' ? 4200 : 2600);
  }

  // 把 api.js 的默认「只打 console」换成真正的提示条。
  API.setNotifier(function (err) {
    if (!err) return;
    // 401 已经在 api.js 里处理成跳登录页了，再弹一条「登录过期」纯属噪音。
    if (err.status === 401) return;
    // 网络层的文案由 api.js 按「405 / 404 / file:// / 纯断网」分别写好，这里原样透出，
    // 不要再改写成统一的「无法连接服务器」—— 那样会把「页面根本不由这个后端托管」
    // 和「后端没启动」混成同一条，排查时白绕一圈。console 里补一份带 url 的便于对照。
    if (err.code === 'NETWORK_ERROR' && global.console) {
      console.error('[ui]', err.message, { url: err.url, method: err.method, status: err.status });
    }
    toast(err.message || '请求失败', 'error');
  });

  /* -------------------------------------------------------------------------
   * 登录守卫与身份回填
   * ----------------------------------------------------------------------- */

  /** 未登录就直接跳登录页并返回 false。页面第一行写 `if (!UI.requireLogin()) return;` */
  function requireLogin() {
    if (API.isLoggedIn()) return true;
    API.gotoLogin();
    return false;
  }

  /** 登录页用：登录成功后该回哪儿（?next= 优先，兜底首页） */
  function nextTarget(fallback) {
    var next = null;
    try {
      next = new URLSearchParams(global.location.search).get('next');
    } catch (e) {
      var m = /[?&]next=([^&]*)/.exec(global.location.search);
      next = m ? decodeURIComponent(m[1]) : null;
    }
    // 只接受站内路径。带 // 或 http 的是开放重定向，会被拿去做钓鱼跳板。
    if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') return next;
    return fallback || '/pages/04-home-calm.html';
  }

  function go(url) { global.location.href = url; }

  /**
   * 把当前用户写进侧边栏。
   *
   * shell.js 里用户名是写死的占位（「陈序 / chen.x@clarity.cc」）。我们不改 shell.js
   * （它是美术交付物，改了就跟着下次交付一起被覆盖），而是渲染完之后回来替换这两行。
   * 定位方式：从「退出登录」那个 a 往上找容器，再读它前面的资料卡 —— 比按文本匹配稳。
   */
  function renderUser(user, ledger) {
    if (!user) return;
    var logout = $('a[title="退出登录"]');
    if (logout) {
      var box = logout.parentNode;
      var nameEl = box && box.querySelector('.font-label-md');
      var mailEl = box && box.querySelector('.font-body-sm');
      if (nameEl) nameEl.textContent = user.displayName || user.display_name || '我';
      if (mailEl) mailEl.textContent = user.email || user.phone || '';
    }
    if (ledger) {
      var ledgerEl = $('a[href$="settings-index.html"] .font-label-md');
      if (ledgerEl && ledger.name) ledgerEl.textContent = ledger.name;
    }
  }

  /** 「退出登录」真的清 token。shell.js 只给了个链接，行为得由我们补。 */
  function bindLogout() {
    var logout = $('a[title="退出登录"]');
    if (!logout || logout.getAttribute('data-mz-bound')) return;
    logout.setAttribute('data-mz-bound', '1');
    logout.addEventListener('click', function (e) {
      e.preventDefault();
      if (logout.getAttribute('data-mz-logging-out')) return;
      logout.setAttribute('data-mz-logging-out', '1');

      // 服务端会递增令牌版本并吊销全部旧 JWT，所以要给请求一个完成窗口；
      // 网络异常时最多等 2 秒，随后仍清掉本地会话，避免退出按钮把用户卡住。
      var timeout = new Promise(function (resolve) { setTimeout(resolve, 2000); });
      Promise.race([
        API.post('/auth/logout', {}, { silent: true, redirectOn401: false }).catch(function () {}),
        timeout,
      ]).then(function () {
        API.clearSession();
        go('/pages/01-onboarding-landing.html');
      });
    });
  }

  /* -------------------------------------------------------------------------
   * 启动上下文（bootstrap）
   *
   * /meta/bootstrap 一次返回账户 + 分类 + 关键词规则 + 偏好，
   * 首页和记账面板都要用。缓存成 Promise（不是缓存结果）——
   * 同一页里两个渲染函数同时要它时，只会发一次请求。
   * ----------------------------------------------------------------------- */

  var metaPromise = null;

  function meta() {
    if (!metaPromise) {
      metaPromise = API.get('/meta/bootstrap').catch(function (err) {
        metaPromise = null; // 失败不缓存，下次重试
        throw err;
      });
    }
    return metaPromise;
  }

  /** 分类 id → 分类对象，列表页渲染图标/颜色时用 */
  function indexBy(list, key) {
    var map = {};
    (list || []).forEach(function (item) { map[item[key]] = item; });
    return map;
  }

  /* -------------------------------------------------------------------------
   * 周期
   *
   * 演示数据固定在 2026-09，所以这里的「当前周期」一旦跑偏，
   * 整个首页会看起来像坏了。允许 ?period= 覆盖，其余情况取本机当前月。
   * ----------------------------------------------------------------------- */

  function currentPeriod() {
    var p = null;
    try {
      p = new URLSearchParams(global.location.search).get('period');
    } catch (e) {}
    if (!p) {
      var d = new Date();
      p = d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    }
    return p;
  }

  /* -------------------------------------------------------------------------
   * 空态 / 骨架
   *
   * 页面在等数据时先显示骨架，别让用户对着 0 发愣；数据为空时显示空态，
   * 而不是显示一排 0 —— 「本月花了 ¥0.00」和「本月还没记账」是两回事。
   * ----------------------------------------------------------------------- */

  function skeleton(el, rows) {
    if (!el) return;
    var n = rows || 3;
    var block = '<div class="h-12 rounded-xl bg-surface-container-low animate-pulse"></div>';
    var out = '';
    for (var i = 0; i < n; i += 1) out += block;
    el.innerHTML = '<div class="flex flex-col gap-space-sm mt-space-xs">' + out + '</div>';
  }

  function empty(el, message, actionHtml) {
    if (!el) return;
    el.innerHTML =
      '<div class="flex flex-col items-center justify-center gap-space-sm py-space-xl text-center">' +
      '<div class="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-on-surface-variant">' +
      icon('inbox', 'text-[1.5rem]') + '</div>' +
      '<p class="font-body-md text-body-md text-on-surface-variant">' + esc(message) + '</p>' +
      (actionHtml || '') +
      '</div>';
  }

  /* -------------------------------------------------------------------------
   * 小工具
   * ----------------------------------------------------------------------- */

  /** 金额着色：PRD 13.5.2 —— 红色只留给超支 / 删除 / 错误，支出本身不标红。 */
  function amountClass(type, amount) {
    if (type === 'income') return 'text-primary';
    return 'text-on-surface';
  }

  /** 收入带 +，支出不带符号（支出标红是被 PRD 明令禁止的） */
  function signedMoney(type, amount) {
    return (type === 'income' ? '+' : '') + FMT.money(amount);
  }

  /** 预算用的黄/红档位，和 v_today_quota.alert_level 的口径保持一致 */
  var ALERT_CLASS = {
    normal: { text: 'text-primary', bar: 'bg-primary', dot: 'bg-[#0D9488]' },
    yellow: { text: 'text-amber-700', bar: 'bg-amber-500', dot: 'bg-amber-500' },
    red: { text: 'text-error', bar: 'bg-error', dot: 'bg-error' },
  };

  function alertClass(level) { return ALERT_CLASS[level] || ALERT_CLASS.normal; }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /**
   * 页面的启动样板。每个页面要做的事都是这四件，顺序还不能错：
   *   1. 没登录就先踢走（省掉后面每个请求都 401）
   *   2. 拉起 bootstrap（失败就提示，不继续渲染成空页面）
   *   3. 回填侧边栏、绑退出登录
   *   4. 交给页面的渲染函数
   *
   * 用法（页面 inline script 里）：
   *   MZ_UI.boot(function (ctx) { ... return 一个 Promise ... })
   * boot 返回的 Promise reject 时已经弹过提示条了，页面不用再 catch。
   */
  function boot(render) {
    onReady(function () {
      if (!requireLogin()) return;
      bindLogout();

      // 先用本地缓存把用户名画上，避免侧边栏空一格再跳一下。
      var cached = API.getSession();
      if (cached) renderUser(cached.user, cached.ledger);

      meta()
        .then(function (ctx) {
          renderUser(ctx.user, ctx.ledger);
          return render ? render(ctx) : null;
        })
        .catch(function (err) {
          // 提示条已经在 setNotifier 里弹过了，这里只把错误吐到控制台方便排查。
          if (global.console) console.warn('[ui] 启动失败', err);
        });
    });
  }

  global.MZ_UI = {
    $: $, $$: $$, esc: esc, each: each, html: html, text: text, icon: icon,
    toast: toast,
    requireLogin: requireLogin, nextTarget: nextTarget, go: go,
    renderUser: renderUser, bindLogout: bindLogout,
    meta: meta, indexBy: indexBy, currentPeriod: currentPeriod,
    skeleton: skeleton, empty: empty,
    amountClass: amountClass, signedMoney: signedMoney, alertClass: alertClass,
    onReady: onReady, boot: boot,
  };

})(window);
