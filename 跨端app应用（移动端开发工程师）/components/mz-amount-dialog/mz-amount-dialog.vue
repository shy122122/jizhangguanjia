<template>
  <view v-if="visible" class="mask" @tap="onCancel">
    <!-- @tap.stop：点面板本身不该关掉它 -->
    <view class="panel anim-fade" @tap.stop>
      <text class="title">{{ title }}</text>
      <text class="hint">{{ hint }}</text>

      <view class="field">
        <text class="yuan">¥</text>
        <input
          ref="input"
          v-model="text"
          class="input tnum"
          type="digit"
          :placeholder="placeholder"
          placeholder-class="ph"
          :focus="visible"
          confirm-type="done"
          @confirm="submit"
        />
      </view>

      <view class="actions">
        <view class="mz-btn flex-1" @tap="onCancel">取消</view>
        <view class="mz-btn mz-btn-primary flex-1" @tap="submit">确认保存</view>
      </view>
    </view>
  </view>
</template>

<script>
/* 金额输入框。
 *
 * 浏览器版 budget-pages.js 里的 amountDialog() 是「动态造一个 DOM + 挂事件 +
 * 用 Promise 把结果 resolve 出去」。Vue 里不需要那一套 —— 组件存在与否由
 * visible 控制，结果通过事件抛给父组件，父组件该 await 就 await。
 *
 * 为什么不用 uni.showModal({editable:true})：它给不了「¥ 前缀 + 说明文案 +
 * 品牌色按钮」这套设计，而这几个字段在浏览器版里是写进设计稿的。
 */
export default {
  name: 'MzAmountDialog',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '设置金额' },
    hint: { type: String, default: '请输入大于 0 的金额，最多保留两位小数。' },
    initial: { type: [String, Number], default: '' },
    placeholder: { type: String, default: '0.00' },
  },
  data() {
    return { text: '' }
  },
  watch: {
    visible(on) {
      // 每次打开都从 initial 重新开始，避免上次输了一半的值留在框里
      if (on) this.text = this.initial === null || this.initial === undefined ? '' : String(this.initial)
    },
  },
  methods: {
    /**
     * 只接受「大于 0、最多两位小数」。
     * 浏览器版用 Math.round(v * 100) / 100 收敛小数位；这里沿用同样的做法，
     * 保证发出去的和用户在浏览器版里发出去的是同一个数。
     */
    submit() {
      const raw = String(this.text || '').trim()
      const value = Number(raw)
      if (!raw || !isFinite(value) || value <= 0) {
        uni.showToast({ title: '请输入有效金额', icon: 'none' })
        return
      }
      this.$emit('confirm', Math.round(value * 100) / 100)
    },
    onCancel() {
      this.$emit('cancel')
    },
  },
}
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  background-color: rgba(15, 23, 42, 0.42);
}
.panel {
  width: 100%;
  max-width: 620rpx;
  padding: 40rpx;
  border-radius: 32rpx;
  display: flex;
  flex-direction: column;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier3);
}
.title { font-size: 34rpx; font-weight: 700; color: var(--text-primary); }
.hint { margin-top: 8rpx; font-size: 24rpx; color: var(--text-secondary); }
.field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  height: 104rpx;
  margin-top: 32rpx;
  padding: 0 32rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.yuan { font-size: 36rpx; font-weight: 600; color: var(--text-primary); }
.input {
  flex: 1;
  min-width: 0;
  font-size: 36rpx;
  font-weight: 600;
  color: var(--text-primary);
  background: transparent;
}
.ph { color: var(--text-tertiary); font-weight: 400; }
.actions {
  display: flex;
  flex-direction: row;
  gap: 20rpx;
  margin-top: 36rpx;
}
</style>
