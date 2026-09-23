/* ============================================================================
 * 明账（MingZhang）· 应用外壳
 *
 * 23 个原型页面此前各自内联了一份完全相同的侧边栏 + 顶栏（每份约 15KB）。
 * 本文件把它抽成单一实现，页面只需声明 data-page，外壳由 JS 注入。
 *
 * 注入点（页面里预留的空容器）：
 *   <div data-shell="sidebar"></div>      左侧固定导航（桌面端）
 *   <div data-shell="topbar"></div>       顶部工具栏
 *   <div data-shell="bottomnav"></div>    底部 Tab（移动端，PRD 5.2）
 *   <div data-shell="switcher"></div>     原型状态切换器（仅原型期使用）
 *
 * 页面通过 <body data-page="home-calm"> 声明自身身份，外壳据此：
 *   · 高亮当前导航项
 *   · 生成状态切换器里的前后页链接
 * ========================================================================== */

(function (global) {
  'use strict';

  var R = global.MZ_ROUTES;

  /* -------------------------------------------------------------------------
   * 当前页面上下文
   * ----------------------------------------------------------------------- */
  var current = R.fromFile(location.pathname.split('/').pop()) ||
                R.page(document.body.getAttribute('data-page')) ||
                null;

  var currentModule = current ? current.module : null;

  /** 该页面在主导航中对应的 key —— 用于侧边栏 / 底部 Tab 的高亮
   *  记账面板（record）不是导航目的地，而是从任意页面唤起的浮层，
   *  因此它没有对应的导航 key：此时改由「记一笔」按钮自身呈现激活态。 */
  function activeNavKey() {
    for (var i = 0; i < R.NAV.length; i++) {
      if (R.NAV[i].module === currentModule) return R.NAV[i].key;
    }
    return null;
  }

  /** 是否处于记账面板 —— 用于把「记一笔」入口渲染成激活态 */
  function onRecordSheet() {
    return currentModule === 'record';
  }

  /* -------------------------------------------------------------------------
   * 公开页回程
   * 帮助页在应用外壳之外，进去之后就找不到回路了。
   * 离开应用前把当前页存起来，公开页据此渲染「返回应用」。
   * file:// 下 sessionStorage 可能不可用，故一律降级为「不显示」而非报错。
   * ----------------------------------------------------------------------- */
  function writeReturn() {
    try {
      sessionStorage.setItem('mz-return', location.pathname.split('/').pop() + location.search);
    } catch (e) {}
  }

  function readReturn() {
    try {
      var f = sessionStorage.getItem('mz-return');
      // 只接受本原型 pages/ 下的页面文件名，避免把外部地址渲染进 href
      return f && /^\d\d-[a-z-]+\.html(\?.*)?$/.test(f) ? f : '';
    } catch (e) { return ''; }
  }

  /* -------------------------------------------------------------------------
   * 侧边栏
   * ----------------------------------------------------------------------- */
  function sidebar() {
    var active = activeNavKey();

    var items = R.NAV.map(function (n) {
      var on = n.key === active;
      var base = 'flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-colors';
      var cls = on
        ? base + ' bg-surface-container text-primary font-bold'
        : base + ' text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';
      // 当前页自身不再重复高亮到模块首屏，避免"点了却没动"的错觉
      var href = n.page === (current && current.key) ? '#' : R.href(n.page);
      return '' +
        '<a class="' + cls + '" href="' + href + '"' + (on ? ' data-active="true"' : '') + '>' +
          '<span class="material-symbols-outlined text-[1.25rem]">' + n.icon + '</span>' +
          '<span class="font-body-md text-body-md">' + n.label + '</span>' +
        '</a>';
    }).join('');

    return '' +
    '<aside class="hidden lg:flex fixed left-0 top-0 h-screen w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex-col justify-between py-margin-md">' +
      '<div class="flex flex-col gap-space-lg">' +

        /* 品牌区 */
        '<a class="px-margin-md flex items-center gap-space-sm" href="../index.html" title="返回原型导航台">' +
          '<img class="h-9 w-9 object-contain" src="../assets/img/logo.svg" alt="明账">' +
          '<span class="flex flex-col">' +
            '<span class="font-headline-sm text-headline-sm text-on-surface tracking-tight leading-none">明账</span>' +
            '<span class="font-label-sm text-label-sm text-on-surface-variant tracking-widest mt-space-xs">清晰记账 · 理智消费</span>' +
          '</span>' +
        '</a>' +

        /* 主操作：唤起记账面板（PRD 4.2，全产品生命线）
         * 记账面板没有对应的导航项，所以它自己就是「当前位置」的指示器 */
        '<div class="px-margin-md">' +
          '<a class="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md font-label-lg text-label-lg rounded-xl transition-all ' +
            (onRecordSheet()
              ? 'bg-primary-container text-on-primary-container ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest'
              : 'bg-primary text-on-primary shadow-[0_12px_24px_-6px_rgba(20,184,166,0.25)] hover:bg-primary-container hover:text-on-primary-container') +
            '" href="' + R.href('record-sheet') + '"' + (onRecordSheet() ? ' data-active="true"' : '') + '>' +
            '<span class="material-symbols-outlined text-[1.25rem]">' + (onRecordSheet() ? 'edit_note' : 'add') + '</span>' +
            '<span>' + (onRecordSheet() ? '记账中' : '记一笔') + '</span>' +
          '</a>' +
        '</div>' +

        '<nav class="flex flex-col gap-space-xs px-space-sm">' + items + '</nav>' +
      '</div>' +

      /* 底部：账本切换 + 用户 */
      '<div class="px-margin-md flex flex-col gap-space-sm">' +
        '<a class="bg-surface-container-low rounded-xl p-space-sm flex items-center justify-between hover:bg-surface-container transition-colors" href="' + R.href('settings-index') + '">' +
          '<span class="flex items-center gap-space-xs overflow-hidden">' +
            '<span class="material-symbols-outlined text-secondary text-[1.25rem]">account_balance_wallet</span>' +
            '<span class="flex flex-col truncate">' +
              '<span class="font-label-md text-label-md text-on-surface truncate">日常个人账本</span>' +
              '<span class="font-body-sm text-body-sm text-on-surface-variant">数据存于本机，可随时导出</span>' +
            '</span>' +
          '</span>' +
          '<span class="material-symbols-outlined text-on-surface-variant text-[1.125rem]">unfold_more</span>' +
        '</a>' +
        '<div class="flex items-center justify-between pt-space-xs">' +
          '<a class="flex items-center gap-space-sm" href="' + R.href('settings-index') + '">' +
            '<img class="w-8 h-8 rounded-full object-cover" src="../assets/img/avatar.svg" alt="">' +
            '<span class="flex flex-col">' +
              '<span class="font-label-md text-label-md text-on-surface">陈序</span>' +
              '<span class="font-body-sm text-body-sm text-on-surface-variant">chen.x@clarity.cc</span>' +
            '</span>' +
          '</a>' +
          '<a class="text-on-surface-variant hover:text-on-surface transition-colors" href="' + R.href('onboarding-landing') + '" title="退出登录" aria-label="退出登录">' +
            '<span class="material-symbols-outlined text-[1.25rem]">logout</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</aside>';
  }

  /* -------------------------------------------------------------------------
   * 顶栏
   * ----------------------------------------------------------------------- */
  function topbar() {
    var label = current ? current.title : '明账';
    return '' +
    '<header class="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-surface-bright/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-margin gap-space-sm lg:px-margin-lg">' +

      /* 移动端：显示当前页名，兼作返回导航台入口 */
      '<a class="lg:hidden flex items-center gap-space-xs text-on-surface-variant" href="../index.html">' +
        '<span class="material-symbols-outlined text-[1.25rem]">arrow_back</span>' +
        '<span class="font-label-md text-label-md truncate max-w-[10rem]">' + label + '</span>' +
      '</a>' +

      /* 搜索：PRD 4.5.2 关键词搜索。回车把关键词带到流水页执行筛选 */
      '<form class="hidden sm:flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-xl w-80" data-shell-search role="search">' +
        '<span class="material-symbols-outlined text-on-surface-variant text-[1.25rem]">search</span>' +
        '<input class="bg-transparent border-none outline-none font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant w-full" placeholder="搜索流水、分类、标签..." type="search" aria-label="搜索流水、分类、标签" name="q">' +
      '</form>' +

      '<div class="flex items-center gap-space-md ml-auto">' +
        /* 告急入口。红点用品牌色而非红色：红色按 PRD 13.5.2 只留给超支 / 删除 / 错误，
         * 一个常驻的未读角标不属于这三类，用红色会稀释警示强度。 */
        '<a class="flex items-center justify-center w-10 h-10 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors relative" href="' + R.href('home-alert') + '" title="预算预警">' +
          '<span class="material-symbols-outlined text-[1.25rem]">notifications</span>' +
          '<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary"></span>' +
        '</a>' +
        /* 帮助是公开页（无应用外壳），记下来路以便回得来 */
        '<a class="flex items-center justify-center w-10 h-10 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" href="' + R.href('onboarding-help') + '" title="帮助" data-shell-out="help">' +
          '<span class="material-symbols-outlined text-[1.25rem]">help_outline</span>' +
        '</a>' +
        /* 深色模式开关：全站可达，偏好写进 mz-theme，跨页生效 */
        '<button class="flex items-center justify-center w-10 h-10 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" type="button" data-shell-theme>' +
          '<span class="material-symbols-outlined text-[1.25rem]">dark_mode</span>' +
        '</button>' +
        '<div class="hidden md:block h-4 w-[1px] bg-outline-variant"></div>' +
        '<a class="hidden md:flex items-center gap-space-xs text-on-surface-variant" href="' + R.href('settings-privacy') + '">' +
          '<span class="material-symbols-outlined text-secondary text-[1.25rem]">verified_user</span>' +
          '<span class="font-label-sm text-label-sm">本地加密保护</span>' +
        '</a>' +
      '</div>' +
    '</header>';
  }

  /* -------------------------------------------------------------------------
   * 公开页顶栏
   * 引导 / 帮助这类未进入主应用的页面使用另一套头部：
   * 无侧边栏、内容居中于 max-w-7xl，强调品牌与安全背书。
   * ----------------------------------------------------------------------- */
  function publicTopbar() {
    /* 从应用内点「帮助」跳过来时，带一个回程入口；
     * 直接打开本页（无来路）则不显示，避免出现指向空历史的死按钮。 */
    var back = readReturn();
    var backLink = back
      ? '<a class="flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors" href="' + back + '">' +
          '<span class="material-symbols-outlined text-[1.25rem]">arrow_back</span>' +
          '<span class="hidden sm:inline">返回应用</span>' +
        '</a>'
      : '';

    /* 落地页自己就有登录 / 注册 / 免费试用三条入口，顶栏再来一个小人只是抢戏；
     * 帮助页单独打开时没有别的入口，保留它。 */
    var onLanding = current && current.key === 'onboarding-landing';
    var appEntry = onLanding
      ? ''
      : '<a class="w-8 h-8 rounded-full bg-primary flex items-center justify-center" href="' + R.href('home-calm') + '" title="进入应用">' +
          '<span class="material-symbols-outlined text-on-primary text-[18px]">person</span>' +
        '</a>';

    return '' +
    '<header class="w-full bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50">' +
      '<div class="h-16 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">' +
      '<div class="flex items-center gap-space-md">' + backLink +
        '<a class="flex items-center gap-space-md" href="../index.html">' +
          '<img class="h-9 w-9 object-contain" src="../assets/img/logo.svg" alt="明账">' +
          '<span class="flex items-center gap-space-xs">' +
            '<span class="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">明账</span>' +
            '<span class="hidden sm:inline-block font-label-md text-label-md text-on-surface-variant px-space-xs">·</span>' +
            '<span class="hidden sm:inline-block font-label-md text-label-md text-on-surface-variant font-medium">预算穿透记账</span>' +
          '</span>' +
        '</a>' +
        '<div class="flex items-center gap-space-md">' +
          '<span class="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-space-xs rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.03)]">' +
            '<span class="material-symbols-outlined text-primary text-[16px]">lock</span>' +
            '<span class="font-label-sm text-label-sm text-primary font-semibold tracking-wide uppercase">本地加密存储</span>' +
          '</span>' +
          '<button class="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors" type="button" data-shell-theme>' +
            '<span class="material-symbols-outlined text-[18px]">dark_mode</span>' +
          '</button>' +
          appEntry +
        '</div>' +
      '</div>' +
      '</div>' +
    '</header>';
  }

  /* -------------------------------------------------------------------------
   * 底部 Tab（移动端）
   * PRD 5.2：5 项，中间为凸起的圆形记账按钮
   * ----------------------------------------------------------------------- */
  function bottomNav() {
    var active = activeNavKey();

    function tab(nav) {
      var on = nav.key === active;
      var cls = on ? 'text-primary' : 'text-on-surface-variant';
      return '<a class="flex flex-col items-center justify-center gap-0.5 flex-1 h-full ' + cls + '" href="' + R.href(nav.page) + '">' +
        '<span class="material-symbols-outlined text-[1.375rem]">' + nav.icon + '</span>' +
        '<span class="font-label-sm text-label-sm">' + nav.label.slice(0, 2) + '</span>' +
      '</a>';
    }

    return '' +
    '<nav class="lg:hidden fixed bottom-0 left-0 right-0 h-[4.25rem] bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant z-50 flex items-stretch px-space-sm pb-[env(safe-area-inset-bottom)]">' +
      tab(R.NAV[0]) +   /* 首页 */
      tab(R.NAV[1]) +   /* 流水 */
      /* 记账面板是浮层而非目的地，故取「凸起按钮自身高亮」表示当前位置 */
      '<a class="flex items-center justify-center flex-1" href="' + R.href('record-sheet') + '" aria-label="记一笔"' + (onRecordSheet() ? ' data-active="true"' : '') + '>' +
        '<span class="flex items-center justify-center w-12 h-12 -mt-5 rounded-full text-on-primary ' +
          (onRecordSheet()
            ? 'bg-primary-container ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest'
            : 'bg-primary shadow-[0_12px_24px_-6px_rgba(20,184,166,0.45)]') +
        '">' +
          '<span class="material-symbols-outlined text-[1.5rem]">' + (onRecordSheet() ? 'edit_note' : 'add') + '</span>' +
        '</span>' +
      '</a>' +
      tab(R.NAV[3]) +   /* 统计 */
      tab(R.NAV[5]) +   /* 我的 */
    '</nav>';
  }

  /* -------------------------------------------------------------------------
   * 状态切换器
   *
   * 原型期专用：同一个模块下有多个状态（例如首页有 5 种预算健康度），
   * 这个浮层让评审者不必回到导航台就能逐个走查。
   * 正式开发时删除本函数与底部对 [data-shell="switcher"] 的注入即可。
   * ----------------------------------------------------------------------- */
  function switcher() {
    if (!current) return '';

    var s = R.siblings(current.key);
    var mod = R.module(currentModule);
    var list = R.pagesOf(currentModule);

    var options = list.map(function (p) {
      return '<option value="' + p.file + '"' + (p.key === current.key ? ' selected' : '') + '>' + p.title + '</option>';
    }).join('');

    var prev = s.prev
      ? '<a class="px-2 py-1 rounded-md hover:bg-surface-container-high" href="' + s.prev.file + '" title="上一状态：' + s.prev.title + '"><span class="material-symbols-outlined text-[1.125rem]">chevron_left</span></a>'
      : '<span class="px-2 py-1 opacity-30"><span class="material-symbols-outlined text-[1.125rem]">chevron_left</span></span>';

    var next = s.next
      ? '<a class="px-2 py-1 rounded-md hover:bg-surface-container-high" href="' + s.next.file + '" title="下一状态：' + s.next.title + '"><span class="material-symbols-outlined text-[1.125rem]">chevron_right</span></a>'
      : '<span class="px-2 py-1 opacity-30"><span class="material-symbols-outlined text-[1.125rem]">chevron_right</span></span>';

    return '' +
    '<div class="fixed bottom-24 lg:bottom-6 right-4 z-50 flex items-center gap-space-xs bg-surface-container-lowest/95 backdrop-blur-xl rounded-full shadow-[0_20px_25px_-5px_rgba(15,23,42,0.08)] border border-outline-variant pl-3 pr-1 py-1 font-label-md text-label-md text-on-surface">' +
      '<span class="material-symbols-outlined text-[1.125rem] text-primary" title="' + (mod ? mod.desc.replace(/"/g, '&quot;') : '') + '">' + (mod ? mod.icon : 'inventory_2') + '</span>' +
      prev +
      '<select class="bg-transparent border-none outline-none cursor-pointer max-w-[9rem] font-label-md text-label-md py-1" aria-label="切换原型状态">' + options + '</select>' +
      next +
      '<span class="pr-2 text-on-surface-variant font-label-sm text-label-sm whitespace-nowrap">' + (s.index + 1) + '/' + s.total + '</span>' +
    '</div>';
  }

  /* -------------------------------------------------------------------------
   * 挂载
   * ----------------------------------------------------------------------- */
  function mount() {
    var slots = {
      sidebar: sidebar,
      topbar: topbar,
      'public-topbar': publicTopbar,
      bottomnav: bottomNav,
      switcher: switcher,
    };

    Object.keys(slots).forEach(function (name) {
      var host = document.querySelector('[data-shell="' + name + '"]');
      if (host) host.outerHTML = slots[name]();
    });

    /* 状态切换器：选中即跳转 */
    var sel = document.querySelector('[data-shell-switcher-select]') ||
              document.querySelector('select[aria-label="切换原型状态"]');
    if (sel) {
      sel.addEventListener('change', function () { location.href = sel.value; });
    }

    /* 顶栏搜索：回车把关键词带到流水页执行筛选（PRD 4.5.2） */
    var search = document.querySelector('[data-shell-search]');
    if (search) {
      search.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = (search.querySelector('input[name="q"]').value || '').trim();
        location.href = R.href('ledger-list') + (q ? '?q=' + encodeURIComponent(q) : '');
      });
    }

    /* 离开应用去公开页（帮助）时记下当前页，供公开页渲染返回入口 */
    var out = document.querySelector('[data-shell-out]');
    if (out) {
      out.addEventListener('click', function () { writeReturn(); });
    }

    /* 深色模式开关：图标跟随当前主题，切换后写入 mz-theme 供全站复用 */
    var themeBtn = document.querySelector('[data-shell-theme]');
    if (themeBtn) {
      var themeIcon = themeBtn.querySelector('.material-symbols-outlined');
      var syncTheme = function () {
        var dark = global.MZ_THEME && global.MZ_THEME.get() === 'dark';
        if (themeIcon) themeIcon.textContent = dark ? 'light_mode' : 'dark_mode';
        themeBtn.title = dark ? '切换到浅色模式' : '切换到深色模式';
        themeBtn.setAttribute('aria-label', themeBtn.title);
      };
      themeBtn.addEventListener('click', function () {
        if (global.MZ_THEME) global.MZ_THEME.toggle();
      });
      document.addEventListener('mz:themechange', syncTheme);
      syncTheme();
    }

    /* 键盘快捷键：← → 在模块内切换状态，Esc 回到导航台
     *
     * Esc 让位规则：页面自带的处理器（如记账面板关抽屉）若已处理本次按键，
     * 就不再执行「整页返回导航台」，避免一次 Esc 同时关面板 + 跳页面。 */
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && R.siblings(current.key).prev) location.href = R.siblings(current.key).prev.file;
      if (e.key === 'ArrowRight' && R.siblings(current.key).next) location.href = R.siblings(current.key).next.file;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;              // 页面已自行处理
        if (document.querySelector('[role="dialog"]:not(.hidden)')) return;  // 有打开的浮层
        location.href = '../index.html';
      }
    });
  }

  global.MZ_SHELL = { mount: mount, current: current };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})(window);
