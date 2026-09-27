<template>
  <mz-page title="分类详情">
    <view class="page">
      <!-- 参数里没带分类、或该月一笔支出都没有：说清楚，而不是画一张全为 0 的报表 -->
      <view v-if="empty" class="mz-card blank">
        <mz-icon name="search_off" :size="40" color="#64748B" />
        <text class="blank-text">该月暂无分类支出</text>
        <view class="mz-btn" @tap="backToOverview">返回统计</view>
      </view>

      <!-- 正在换成真正的分类：先别画那张空壳，避免一帧的 0 -->
      <template v-else-if="!redirected">
      <view class="mz-card head">
        <view class="row items-center gap-3">
          <view class="tile" :style="tileStyle">
            <mz-icon :name="icon" :size="30" :color="color || '#0F766E'" />
          </view>
          <view class="col">
            <text class="t-body-sm c-secondary">{{ fmt.period(period) }}分类详情</text>
            <text class="t-h2 ellipsis">{{ name }}</text>
          </view>
        </view>

        <view class="grid-3 stats">
          <view class="stat">
            <text class="stat-label">合计支出</text>
            <text class="stat-value tnum">{{ fmt.money(selected.totalAmount) }}</text>
          </view>
          <view class="stat">
            <text class="stat-label">流水数量</text>
            <text class="stat-value tnum">{{ selected.txnCount }} 笔</text>
          </view>
          <view class="stat">
            <text class="stat-label">单笔平均</text>
            <text class="stat-value tnum">{{ fmt.money(selected.avgAmount) }}</text>
          </view>
        </view>
      </view>

      <view class="mz-card">
        <text class="t-h3">分类流水</text>

        <view v-if="txns.length" class="txns">
          <view v-for="(t, i) in txns" :key="t.id || i" class="txn">
            <view class="col txn-left">
              <text class="txn-title ellipsis">{{ txnTitle(t) }}</text>
              <text class="txn-sub ellipsis">{{ fmt.date(t.happenedAt) }} · {{ (t.account && t.account.name) || '' }}</text>
            </view>
            <text class="txn-amount tnum">{{ fmt.money(t.amount) }}</text>
          </view>
        </view>
        <view v-else class="inline-empty">
          <text>暂无流水</text>
        </view>
      </view>
      </template>
    </view>
  </mz-page>
</template>

<script>
/* 分类下钻（浏览器版 17-stats-category.html）。
 *
 * 两处行为必须和浏览器版一致：
 *   1. 没带 category 参数时，自动跳到分类占比最高的那一个（用户从统计页点进来
 *      可能只带了 period）。浏览器版用 location.replace 而不是 href —— 这样
 *      「返回」回到的是统计总览，而不是在同一个页面之间来回弹。这里用 redirectTo 对齐。
 *   2. 该月一笔支出都没有时，不是显示空列表，而是明确说「该月暂无分类支出」。
 *
 * 流水只取前 100 条（与浏览器版同一口径）：这是一张「看看钱花在哪」的报表，
 * 不是流水明细页，超过 100 条的深挖应该回流水页做。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'

function cssColor(c) {
  const s = String(c == null ? '' : c).replace(/[^#0-9A-Fa-f]/g, '')
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : ''
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      period: '',
      categoryId: null,
      selected: {},
      txns: [],
      empty: false,
      redirected: false,
    }
  },
  computed: {
    name() {
      return this.selected.categoryName || ''
    },
    icon() {
      return this.selected.icon || 'category'
    },
    color() {
      return cssColor(this.selected.color)
    },
    tileStyle() {
      const c = this.color
      if (!c) return {}
      // 浏览器版用 color + '18' 拼出 9% 透明的底（#RRGGBB18）
      return { backgroundColor: c + '18', color: c }
    },
  },
  onLoad(query) {
    this.period = (query && query.period) || fmt.currentPeriod()
    const n = Number(query && query.category)
    this.categoryId = isFinite(n) && n > 0 ? n : null
    this.load()
  },
  methods: {
    txnTitle(t) {
      return t.merchant || t.note || this.name
    },
    /** 空态没有可返回的上一页时（redirectTo 之后栈里就一层）兜底回统计总览 */
    backToOverview() {
      const pages = getCurrentPages()
      if (pages.length > 1) uni.navigateBack()
      else uni.reLaunch({ url: '/pages/stats/overview' })
    },
    load() {
      const self = this
      const p = this.period
      return Promise.all([
        api.get('/stats/category', { period: p, type: 'expense' }),
        api.get(
          '/transactions',
          { period: p, page: 1, pageSize: 100, categoryId: this.categoryId || undefined },
          { raw: true }
        ),
      ]).then(function (values) {
        const breakdown = values[0] || {}
        const items = breakdown.items || []
        const selected =
          items.filter(function (x) {
            return x.categoryId === self.categoryId
          })[0] || items[0]

        if (!selected) {
          self.empty = true
          return
        }

        // 参数缺失或对不上：换成真正的那个分类，redirectTo 保证返回栈里不留这一层
        if (!self.categoryId || self.categoryId !== selected.categoryId) {
          self.redirected = true
          uni.redirectTo({
            url: '/pages/stats/category?period=' + p + '&category=' + selected.categoryId,
          })
          return
        }

        self.selected = selected
        const page = values[1] || {}
        self.txns = (page.data && page.data.items) || page.data || []
      })
    },
  },
}
</script>

<style lang="scss" scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 24rpx 24rpx 0;
}

.head { gap: 32rpx; }
.tile {
  width: 104rpx;
  height: 104rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-low));
}
.stats { margin-top: 8rpx; }
.stat { display: flex; flex-direction: column; gap: 8rpx; }
.stat-label { font-size: 22rpx; color: var(--text-secondary); }
.stat-value { font-size: 34rpx; font-weight: 700; color: var(--text-primary); }

.txns {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
}
.txn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.txn:last-child { border-bottom: none; }
.txn-left { flex: 1; min-width: 0; gap: 8rpx; }
.txn-title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.txn-sub { font-size: 22rpx; color: var(--text-secondary); }
.txn-amount { font-size: 30rpx; font-weight: 700; color: var(--text-primary); }

.inline-empty {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}

.blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 120rpx 40rpx;
}
.blank-text {
  font-size: 28rpx;
  color: var(--text-secondary);
  text-align: center;
}
</style>
