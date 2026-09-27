<template>
  <view class="mz-root" :class="{ 'mz-dark': dark }">
    <!-- 状态栏占位：页面用 navigationStyle:custom，状态栏高度得自己让出来 -->
    <view class="mz-statusbar" :style="{ height: statusBarHeight + 'px' }"></view>

    <mz-navbar
      v-if="navbar"
      :title="title"
      :subtitle="subtitle"
      :back="back"
      :transparent="transparentNav"
    >
      <template #right>
        <slot name="nav-right"></slot>
      </template>
    </mz-navbar>

    <view class="mz-body" :class="{ 'has-tabbar': tabbar }">
      <slot></slot>
    </view>

    <!-- 全局浮层出口：抽屉、对话框都挂在这里，保证层级在内容之上 -->
    <slot name="overlay"></slot>
  </view>
</template>

<script>
/* 页面外壳。
 *
 * 承担三件在浏览器版里由 shell.js 干的事：
 *   1. 输出 .mz-dark，让 CSS 变量随主题整体翻转（等价于 html.dark）
 *   2. 让出状态栏高度（自定义导航栏必须自己处理，否则内容会钻到刘海底下）
 *   3. 给有底部 Tab 的页面留出 Tab 高度的安全间距
 * 另外把它做成组件而不是每个页面抄一遍，是为了这三件事只可能改错一次。
 */
import { theme } from '@/common/theme'

let statusBarHeight = 0
try {
  statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0
} catch (e) {
  statusBarHeight = 0
}

export default {
  name: 'MzPage',
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    /** 是否显示导航栏 */
    navbar: { type: Boolean, default: true },
    /** 是否显示返回箭头 */
    back: { type: Boolean, default: true },
    /** 本页是否是底部 Tab 之一 —— 是的话内容底部要留出 Tab 高度 */
    tabbar: { type: Boolean, default: false },
    transparentNav: { type: Boolean, default: false },
  },
  data() {
    return { statusBarHeight }
  },
  computed: {
    dark() {
      return theme.mode === 'dark'
    },
  },
}
</script>

<style lang="scss" scoped>
.mz-root {
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--text-primary);
}
.mz-statusbar {
  width: 100%;
  background-color: transparent;
}
.mz-body {
  display: flex;
  flex-direction: column;
}
/* 底部固定 Tab 会盖住最后一段内容，这里先撑开等高的空白 */
.has-tabbar {
  padding-bottom: calc(#{$tabbar-h} + 24rpx);
}
</style>
