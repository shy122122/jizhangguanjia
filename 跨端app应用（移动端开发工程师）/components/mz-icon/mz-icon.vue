<template>
  <text class="mz-icon" :class="{ 'is-filled': filled }" :style="style">{{ ch }}</text>
</template>

<script>
/* 图标。
 *
 * 浏览器版直接写 <span class="material-symbols-outlined">home</span>，
 * 靠字体的连字（ligature）把 "home" 这五个字母合成一个图形。
 * 小程序对 font-feature-settings:'liga' 的支持不稳定，所以这里改成
 * 「图标名 → PUA 码点」查表（common/icons.js），直接输出一个字符 ——
 * 三端都只是普通文本渲染，没有额外前提。
 *
 * size 传「设计稿 @375pt 的 px 值」（跟浏览器版的 text-[22px] 对齐），
 * 内部乘 2 转成 rpx，所以在大屏手机上会等比放大。
 */
import { glyph } from '@/common/icons'

export default {
  name: 'MzIcon',
  props: {
    name: { type: String, default: '' },
    /** 设计稿 px 值；也可直接传带单位的字符串，如 '32rpx' */
    size: { type: [Number, String], default: 22 },
    color: { type: String, default: '' },
    /** 实心变体（PRD 里导航选中态、部分强调图标用） */
    filled: { type: Boolean, default: false },
  },
  computed: {
    ch() {
      return glyph(this.name)
    },
    style() {
      const s =
        typeof this.size === 'number' ? this.size * 2 + 'rpx' : this.size
      const out = { fontSize: s, width: s, height: s, lineHeight: s }
      if (this.color) out.color = this.color
      return out
    },
  },
}
</script>

<style lang="scss" scoped>
.mz-icon {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  display: inline-block;
  flex-shrink: 0;
  text-align: center;
  /* 图标字形本身没有斜体/加粗语义，禁掉避免被父级继承带歪 */
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
.is-filled {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
</style>
