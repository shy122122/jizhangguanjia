<template>
  <view class="mz-navbar" :class="{ transparent: transparent }">
    <view class="left">
      <view v-if="back" class="icon-btn" @tap="goBack">
        <mz-icon name="arrow_back" :size="22" />
      </view>
      <slot name="left"></slot>
    </view>

    <view class="mid">
      <text class="title ellipsis">{{ title }}</text>
      <text v-if="subtitle" class="subtitle ellipsis">{{ subtitle }}</text>
    </view>

    <view class="right">
      <slot name="right"></slot>
    </view>
  </view>
</template>

<script>
/* 自定义导航栏（pages.json 里所有页面都设了 navigationStyle: custom）。
 *
 * 为什么不用原生导航栏：原生栏在 App、小程序、H5 上的高度与字体都不一致，
 * 而「今日可花」这类沉浸式页头需要导航栏与内容同色渐变，原生栏做不到。
 * 代价是状态栏高度、返回逻辑、右上角胶囊避让都得自己管 —— 见 mz-page 与下方 goBack。
 */
export default {
  name: 'MzNavbar',
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    back: { type: Boolean, default: true },
    transparent: { type: Boolean, default: false },
  },
  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        // 直接从分享链接 / 冷启动进来的页面没有上一页，回首页兜底，
        // 否则返回键会变成「什么都没发生」。
        uni.reLaunch({ url: '/pages/home/index' })
      }
    },
  },
}
</script>

<style lang="scss" scoped>
.mz-navbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: #{$navbar-h};
  padding: 0 24rpx;
  background-color: var(--bg);
  &.transparent {
    background-color: transparent;
  }
}
.left,
.right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  min-width: 88rpx;
}
.right {
  justify-content: flex-end;
}
.mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.subtitle {
  font-size: 22rpx;
  color: var(--text-tertiary);
  margin-top: 2rpx;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 9999rpx;
  color: var(--text-primary);
  &:active {
    background-color: rgb(var(--mz-surface-container-low));
  }
}
</style>
