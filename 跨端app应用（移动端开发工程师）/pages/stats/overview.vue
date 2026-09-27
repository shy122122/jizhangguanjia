<template>
  <mz-page title="消费洞察" :back="false" tabbar>
    <view class="page">
      <!-- ===== 周期切换 ===== -->
      <view class="between period">
        <view class="switcher">
          <view class="sw-btn" @tap="shiftPeriod(-1)">
            <mz-icon name="chevron_left" :size="20" />
          </view>
          <text class="sw-label">{{ fmt.period(period) }}</text>
          <view class="sw-btn" @tap="shiftPeriod(1)">
            <mz-icon name="chevron_right" :size="20" />
          </view>
        </view>
        <text class="t-label-sm c-secondary">全景透视现金流向</text>
      </view>

      <view v-if="loading" class="skeleton">
        <view v-for="n in 4" :key="n" class="sk-line"></view>
      </view>

      <view v-else-if="loadError" class="err">
        <mz-icon name="error_outline" :size="36" color="#0F766E" />
        <text class="err-text">{{ loadError }}</text>
        <view class="mz-btn mz-btn-primary" @tap="load">重新加载</view>
      </view>

      <template v-else>
        <!-- ===== 四张指标卡 ===== -->
        <view class="grid-2 metrics">
          <view class="mz-card metric">
            <view class="between">
              <text class="metric-label">本月支出</text>
              <mz-icon name="payments" :size="20" color="#0F766E" />
            </view>
            <text class="metric-value tnum">{{ fmt.money(o.expenseTotal) }}</text>
            <text class="metric-hint tnum">{{ o.expenseCount }} 笔 · 日均 {{ fmt.money(o.avgExpensePerDay) }}</text>
          </view>

          <view class="mz-card metric">
            <view class="between">
              <text class="metric-label">本月收入</text>
              <mz-icon name="account_balance" :size="20" color="#0E7490" />
            </view>
            <text class="metric-value tnum c-primary">+{{ fmt.money(o.incomeTotal) }}</text>
            <text class="metric-hint">{{ o.incomeCount }} 笔入账</text>
          </view>

          <view class="mz-card metric">
            <view class="between">
              <text class="metric-label">本月结余</text>
              <mz-icon name="savings" :size="20" color="#0F766E" />
            </view>
            <text class="metric-value tnum" :class="{ 'c-primary': netValue >= 0 }">{{ signedNet(netValue) }}</text>
            <text class="metric-hint">收入减去支出</text>
          </view>

          <view class="mz-card metric">
            <view class="between">
              <text class="metric-label">净资产</text>
              <mz-icon name="account_balance_wallet" :size="20" color="#0F766E" />
            </view>
            <text class="metric-value tnum">{{ fmt.money(acct.netWorth) }}</text>
            <text class="metric-hint tnum">{{ acct.accountCount || 0 }} 个账户 · 信用卡已用 {{ fmt.money(acct.creditUsedTotal) }}</text>
          </view>
        </view>

        <!-- ===== 每日支出趋势 ===== -->
        <view class="mz-card">
          <view class="between">
            <text class="t-h3">每日支出趋势</text>
            <text class="t-body-sm c-secondary">共 {{ trendTxnCount }} 笔</text>
          </view>

          <view v-if="bars.length" class="chart">
            <view class="chart-bars">
              <view
                v-for="b in bars"
                :key="b.bucket"
                class="bar"
                :style="{ height: b.h + '%' }"
                @tap="onBarTap(b)"
              ></view>
            </view>
            <view class="chart-axis">
              <text>{{ bars[0] && bars[0].bucket }}</text>
              <text>{{ bars[bars.length - 1] && bars[bars.length - 1].bucket }}</text>
            </view>
          </view>
          <view v-else class="inline-empty">
            <text>该月暂无支出</text>
          </view>
        </view>

        <!-- ===== 支出分类排行 ===== -->
        <view class="mz-card">
          <view class="between">
            <text class="t-h3">支出分类排行</text>
            <text class="t-body-sm c-secondary">{{ cat.txnCount || 0 }} 笔</text>
          </view>

          <view v-if="catItems.length" class="cats">
            <view
              v-for="c in catItems"
              :key="c.categoryId"
              class="cat-row"
              @tap="drill(c)"
            >
              <view class="cat-top">
                <view class="row items-center gap-2">
                  <mz-icon :name="iconOf(c)" :size="20" :color="colorOf(c) || '#0F766E'" />
                  <text class="cat-name ellipsis">{{ c.categoryName }}</text>
                </view>
                <text class="cat-amount tnum">{{ fmt.money(c.totalAmount) }}</text>
              </view>
              <view class="track-thin">
                <view class="fill-ok" :style="{ width: fmt.clampPercent(c.percent) + '%' }"></view>
              </view>
              <text class="cat-meta tnum">占 {{ fmt.percent(c.percent) }} · {{ c.txnCount }} 笔</text>
            </view>
          </view>
          <view v-else class="inline-empty">
            <text>该月暂无支出</text>
          </view>
        </view>

        <!-- ===== 账户分布 ===== -->
        <view class="mz-card">
          <text class="t-h3">账户分布</text>
          <view class="accts">
            <view v-for="a in acctItems" :key="a.accountId || a.id || a.name" class="acct">
              <text class="acct-name ellipsis">{{ a.name }}</text>
              <text class="acct-value tnum">{{ a.type === 'credit' ? '已用 ' + fmt.money(a.creditUsed) : fmt.money(a.balance) }}</text>
            </view>
          </view>
        </view>
      </template>
    </view>
  </mz-page>
</template>

<script>
/* 消费洞察（浏览器版 15-stats-overview.html）。
 *
 * 浏览器版那个 HTML 里有一大段静态 mock：热力日历、近 6 个月双柱折线图、
 * 环形图、支付渠道分布。但 stats-pages.js 的 renderOverview() 在 boot 时
 * 会把 main.innerHTML 整体换掉 —— 也就是说那些静态块**从来没有真正显示过**。
 * 所以这里实现的是 renderOverview 那份真正跑起来的样子，不做静态 mock。
 *
 * 四张指标卡 = /stats/overview + /stats/account 两个接口，
 * 趋势图 = /stats/trend?granularity=day，分类排行 = /stats/category。
 * 浏览器版还有个「导出全部流水」按钮 —— 按需求本次不做导出，已去掉。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { currentPeriod, rememberPeriod } from '@/common/store'

const CHART_BOTTOM_PCT = 2 // 零支出的那天也留一根能看见的柱子，否则图会缺一格

/** 分类颜色来自数据库，进不了 style 的字符一律剔掉 */
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
      loading: true,
      loadError: '',
      o: {},
      cat: {},
      trend: [],
      acct: {},
    }
  },
  computed: {
    netValue() {
      return Number(this.o.net || 0)
    },
    catItems() {
      return (this.cat.items || []).slice(0, 8)
    },
    acctItems() {
      return this.acct.items || []
    },
    trendTxnCount() {
      return this.trend.reduce(function (n, x) {
        return n + (Number(x.txnCount) || 0)
      }, 0)
    },
    bars() {
      const items = this.trend
      if (!items.length) return []
      let max = 1
      items.forEach(function (x) {
        const v = Number(x.expenseTotal) || 0
        if (v > max) max = v
      })
      return items.map(function (x) {
        const v = Number(x.expenseTotal) || 0
        return {
          bucket: x.bucket,
          expenseTotal: v,
          txnCount: x.txnCount,
          h: Math.max(CHART_BOTTOM_PCT, (v / max) * 100),
        }
      })
    },
  },
  onLoad(query) {
    this.period = currentPeriod(query)
  },
  onShow() {
    this.load()
  },
  methods: {
    /** 结余的正负号看数值本身，和 fmt.signedMoney 那个按类型给号的不是一回事 */
    signedNet(v) {
      return (v < 0 ? '-¥' : '+¥') + fmt.amount(Math.abs(v))
    },
    iconOf(c) {
      return c.icon || 'category'
    },
    colorOf(c) {
      return cssColor(c.color)
    },
    shiftPeriod(step) {
      this.period = step < 0 ? fmt.prevPeriod(this.period) : fmt.nextPeriod(this.period)
      rememberPeriod(this.period)
      this.load()
    },
    onBarTap(b) {
      uni.showToast({
        title: b.bucket + ' 支出 ' + fmt.money(b.expenseTotal) + ' · ' + (b.txnCount || 0) + ' 笔',
        icon: 'none',
      })
    },
    drill(c) {
      uni.navigateTo({
        url: '/pages/stats/category?period=' + this.period + '&category=' + c.categoryId,
      })
    },
    load() {
      const self = this
      const p = this.period
      this.loading = true
      this.loadError = ''
      return Promise.all([
        api.get('/stats/overview', { period: p }),
        api.get('/stats/category', { period: p, type: 'expense' }),
        api.get('/stats/trend', { period: p, granularity: 'day' }),
        api.get('/stats/account'),
      ]).then(function (values) {
        self.o = values[0] || {}
        self.cat = values[1] || {}
        self.trend = (values[2] && values[2].items) || []
        self.acct = values[3] || {}
        self.loading = false
      }).catch(function (err) {
        self.loading = false
        self.loadError = (err && err.message) || '统计数据加载失败'
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

/* 周期切换 */
.period { padding: 0 4rpx; }
.switcher {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 6rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.sw-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(var(--mz-surface-container-lowest));
  color: var(--text-primary);
}
.sw-label { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }

/* 指标卡 */
.metrics { gap: 20rpx; }
.metric { gap: 12rpx; }
.metric-label { font-size: 24rpx; color: var(--text-secondary); }
.metric-value { font-size: 40rpx; font-weight: 800; color: var(--text-primary); }
.metric-hint { font-size: 22rpx; color: var(--text-secondary); }

/* 趋势柱 */
.chart { margin-top: 28rpx; }
.chart-bars {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 4rpx;
  height: 320rpx;
}
.bar {
  flex: 1;
  min-width: 4rpx;
  border-radius: 6rpx 6rpx 0 0;
  background-color: var(--brand-500);
  opacity: 0.7;
}
.chart-axis {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-top: 12rpx;
  font-size: 20rpx;
  color: var(--text-tertiary);
}

/* 分类排行 */
.cats { margin-top: 24rpx; display: flex; flex-direction: column; gap: 28rpx; }
.cat-row { display: flex; flex-direction: column; gap: 10rpx; }
.cat-top { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 16rpx; }
.cat-name {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.cat-amount { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.cat-meta { font-size: 22rpx; color: var(--text-secondary); }

/* 账户分布 */
.accts {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.acct {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.acct-name { flex: 1; min-width: 0; font-size: 28rpx; color: var(--text-primary); }
.acct-value { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }

/* 状态 */
.inline-empty {
  padding: 64rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}
.skeleton { display: flex; flex-direction: column; gap: 20rpx; }
.sk-line {
  height: 180rpx;
  border-radius: 28rpx;
  background-color: rgb(var(--mz-surface-container-low));
  animation: sk 1.2s ease-in-out infinite;
}
@keyframes sk {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.err {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 100rpx 40rpx;
}
.err-text { font-size: 26rpx; color: var(--text-secondary); text-align: center; }
</style>
