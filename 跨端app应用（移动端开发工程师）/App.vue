<script>
import { initTheme } from './common/theme'

export default {
  onLaunch() {
    // 主题要在第一帧之前定下来，否则深色用户会先看到一闪的白。
    // 浏览器版靠 <head> 里同步执行的 theme.js 解决，小程序没有这个时机，
    // 只能在 onLaunch 尽早落地，代价是首页可能有极短的一帧浅色。
    initTheme()
  },
  onShow() {},
  onHide() {},
}
</script>

<style lang="scss">
/* App.vue 的样式是全局的（小程序里会编译成 app.wxss），只放三样东西：
 * 设计令牌、基础工具类、字体。组件自己的样式一律写在组件内。 */
@import './styles/fonts.scss';
@import './styles/tokens.scss';
@import './styles/base.scss';
</style>
