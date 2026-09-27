/* ============================================================================
 * 明账 · 主题
 *
 * 浏览器版把 dark 类挂在 <html> 上；小程序没有 html 元素，
 * 所以这里维护一个响应式状态，由每个页面最外层的 <mz-page> 输出 .mz-dark，
 * CSS 变量沿继承链往下传，效果等价（见 styles/tokens.scss）。
 *
 * 颜色本身不在这里 —— 全部定义在 tokens.scss 的变量里，
 * 本模块只负责回答一个问题：现在该不该加 .mz-dark。
 * ========================================================================== */

import { reactive } from 'vue'
import { THEME_KEY } from './config'

export const theme = reactive({
  /** 'light' | 'dark' */
  mode: 'light',
  /** 用户是否手动选过。没选过时跟随系统 */
  locked: false,
})

function systemPrefersDark() {
  try {
    // #ifdef H5
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    // #endif
    // #ifndef H5
    // uni.getSystemInfoSync().theme 在部分安卓机型上为空，取不到就当浅色
    return uni.getSystemInfoSync().theme === 'dark'
    // #endif
  } catch (e) {
    return false
  }
}

export function initTheme() {
  let saved = null
  try {
    saved = uni.getStorageSync(THEME_KEY)
  } catch (e) {
    saved = null
  }
  if (saved === 'dark' || saved === 'light') {
    theme.mode = saved
    theme.locked = true
  } else {
    theme.mode = systemPrefersDark() ? 'dark' : 'light'
    theme.locked = false
  }
  applyNativeBar()
}

/** 同步原生导航栏与 tabBar 的明暗（自定义导航栏的页面这两项不生效，但全局 Style 会用到） */
function applyNativeBar() {
  const dark = theme.mode === 'dark'
  try {
    uni.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#0B1220' : '#FFFFFF',
    })
  } catch (e) {
    /* 自定义导航栏的页面会报「navigationStyle 为 custom」的警告，忽略即可 */
  }
  try {
    uni.setTabBarStyle({
      color: dark ? '#64748B' : '#64748B',
      selectedColor: dark ? '#2DD4BF' : '#0F766E',
      backgroundColor: dark ? '#131C2E' : '#FFFFFF',
      borderStyle: dark ? 'black' : 'white',
    })
  } catch (e) {
    /* 非 tab 页调用会失败，忽略 */
  }
}

/** 显式设置并持久化（用户在设置页手动切换） */
export function setTheme(mode) {
  theme.mode = mode === 'dark' ? 'dark' : 'light'
  theme.locked = true
  try {
    uni.setStorageSync(THEME_KEY, theme.mode)
  } catch (e) {
    /* 存不下就只在本次会话生效 */
  }
  applyNativeBar()
}

/** 返回切换后的主题，方便调用方直接用来写文案 */
export function toggleTheme() {
  setTheme(theme.mode === 'dark' ? 'light' : 'dark')
  return theme.mode
}

export function isDark() {
  return theme.mode === 'dark'
}
