/* ============================================================================
 * 明账（MingZhang）· 主题引导
 *
 * 必须在 <head> 中、样式表之前同步加载：先把 html.dark 挂上再渲染，
 * 否则深色用户会先看到一帧白屏再翻黑（FOUC）。
 *
 * 配色本身不在这里 —— 颜色全部定义在 assets/css/tokens.css 的 --mz-* 变量，
 * 本文件只负责决定 html 上有没有 dark 这个类。
 * ========================================================================== */

(function (global) {
  'use strict';

  var KEY = 'mz-theme';
  var root = document.documentElement;

  /** 读取已保存的偏好；没有保存过则跟随系统 */
  function resolve() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function apply(mode) {
    root.classList.toggle('dark', mode === 'dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0B1220' : '#14B8A6');
  }

  /* 立即生效，抢在首次绘制之前 */
  apply(resolve());

  global.MZ_THEME = {
    /** 当前主题：'dark' | 'light' */
    get: function () {
      return root.classList.contains('dark') ? 'dark' : 'light';
    },
    /** 显式设置并持久化 */
    set: function (mode) {
      apply(mode);
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      document.dispatchEvent(new CustomEvent('mz:themechange', { detail: { mode: mode } }));
    },
    toggle: function () {
      var next = global.MZ_THEME.get() === 'dark' ? 'light' : 'dark';
      global.MZ_THEME.set(next);
      return next;
    },
  };

  /* 用户没手动选过时，跟随系统切换 */
  if (global.matchMedia) {
    var mq = global.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () {
      try { if (localStorage.getItem(KEY)) return; } catch (e) {}
      apply(mq.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

})(window);
