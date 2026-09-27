<template>
  <mz-page :navbar="false" tabbar>
    <view class="home">
      <!-- ===== 问候 + 预算节奏 ===== -->
      <view class="hero-head">
        <view class="col flex-1">
          <view class="row items-center gap-1">
            <text class="t-h1">{{ greeting }}</text>
          </view>
          <view class="pace">
            <view class="dot"></view>
            <text class="pace-text">{{ paceText }}</text>
          </view>
          <text class="pace-desc">{{ paceDesc }}</text>
        </view>
      </view>

      <!-- ===== 快捷入口 ===== -->
      <view class="quick">
        <view class="quick-import" @tap="goImport">
          <view class="q-tile"><mz-icon name="upload_file" :size="18" color="var(--text-secondary)" /></view>
          <view class="col flex-1">
            <text class="t-label">微信 / 支付宝导入</text>
            <text class="t-label-sm c-secondary">支持智能对账排重</text>
          </view>
          <mz-icon name="chevron_right" :size="18" color="var(--text-secondary)" />
        </view>
        <view class="quick-record" @tap="goRecord">
          <mz-icon name="edit_note" :size="20" color="#FFFFFF" />
          <text>快速记账</text>
        </view>
      </view>

      <!-- ===== 今日可花（品牌渐变卡） ===== -->
      <view class="quota-card bg-brand-gradient">
        <view class="blob blob-a"></view>
        <view class="blob blob-b"></view>
        <view class="quota-top">
          <view class="row items-center gap-1">
            <mz-icon name="shield_lock" :size="20" color="rgba(255,255,255,0.9)" />
            <text class="quota-kicker">今日安全额度 · 动态演算</text>
          </view>
          <view class="quota-health">
            <view class="health-dot"></view>
            <text>{{ healthText }}</text>
          </view>
        </view>

        <view class="quota-main">
          <text v-if="hasBudget" class="quota-symbol">¥</text>
          <text class="quota-value" :class="{ small: !hasBudget }">{{ quotaValue }}</text>
          <text v-if="hasBudget" class="quota-unit">今日自由支配上限</text>
        </view>
        <text class="quota-desc">{{ quotaDesc }}</text>

        <view class="quota-foot">
          <view class="between">
            <text class="quota-foot-label">本月总预算渗透率</text>
            <text class="t-num-data tnum">{{ usedPctText }}</text>
          </view>
          <view class="quota-track">
            <view class="quota-fill" :style="{ width: usedBarPct + '%' }"></view>
          </view>
          <view class="between quota-foot-bottom">
            <text class="quota-spent">{{ spentText }}</text>
            <view class="row items-center gap-2">
              <text class="quota-remain">{{ remainText }}</text>
              <text class="quota-adjust" @tap="goBudgetSetup">调整</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 四张数卡 ===== -->
      <view class="grid grid-2 cards">
        <view class="stat">
          <view class="between">
            <text class="t-label-sm c-secondary">今日累计支出</text>
            <view class="stat-tile"><mz-icon name="shopping_bag" :size="18" color="var(--accent-700)" /></view>
          </view>
          <text class="t-h1 tnum">{{ todayExpenseText }}</text>
          <view class="between">
            <text class="t-label-sm c-secondary">{{ todayCountText }}</text>
            <text class="t-label-sm" :class="todayTagTone">{{ todayTag }}</text>
          </view>
        </view>

        <view class="stat">
          <view class="between">
            <text class="t-label-sm c-secondary">本月实际支出</text>
            <view class="stat-tile"><mz-icon name="trending_down" :size="18" color="var(--brand-700)" /></view>
          </view>
          <text class="t-h1 tnum">{{ monthExpenseText }}</text>
          <view class="between">
            <text class="t-label-sm c-secondary">{{ monthExpenseSub }}</text>
            <text class="t-label-sm c-primary">{{ monthExpenseTag }}</text>
          </view>
        </view>

        <view class="stat">
          <view class="between">
            <text class="t-label-sm c-secondary">本月到账收入</text>
            <view class="stat-tile"><mz-icon name="payments" :size="18" color="var(--brand-700)" /></view>
          </view>
          <text class="t-h1 c-primary tnum">{{ monthIncomeText }}</text>
          <view class="between">
            <text class="t-label-sm c-secondary">{{ monthIncomeSub }}</text>
            <text class="t-label-sm c-primary">{{ monthIncomeTag }}</text>
          </view>
        </view>

        <view class="stat">
          <view class="between">
            <text class="t-label-sm c-secondary">分类超支风险</text>
            <view class="stat-tile danger"><mz-icon name="warning_amber" :size="18" color="var(--danger)" /></view>
          </view>
          <view class="row items-end gap-1">
            <text class="t-h1 c-danger tnum">{{ riskCount }}</text>
            <text class="t-body-sm c-secondary">项类目超限</text>
          </view>
          <view class="between">
            <text class="t-label-sm ellipsis flex-1" :class="riskCount ? 'c-danger' : 'c-secondary'">{{ riskDetail }}</text>
            <text class="t-label-sm c-secondary" @tap="goBudgetSetup">平账</text>
          </view>
        </view>
      </view>

      <!-- ===== 最近流水明细 ===== -->
      <view class="panel">
        <view class="between">
          <view class="row items-center gap-1">
            <text class="t-h3">最近流水明细</text>
            <text class="badge">实时</text>
          </view>
          <view class="link" @tap="goLedger">
            <text>查看全部流水</text><mz-icon name="arrow_forward" :size="16" />
          </view>
        </view>

        <view v-if="loading" class="skel">
          <view v-for="i in 4" :key="i" class="skel-row"></view>
        </view>
        <view v-else-if="loadError" class="empty">
          <mz-icon name="error_outline" :size="24" color="var(--text-secondary)" />
          <text>{{ loadError }}</text>
        </view>
        <view v-else-if="!recent.length" class="empty">
          <mz-icon name="inventory_2" :size="24" color="var(--text-secondary)" />
          <text>还没有流水。点底部「记一笔」，这里就有了。</text>
        </view>
        <view v-else class="recent">
          <view class="between recent-head">
            <text class="t-label-sm c-secondary">最近 {{ recent.length }} 笔 · 按时间倒序</text>
            <text class="t-label-sm c-secondary">今日支出 {{ fmt.money(todayExpense) }}</text>
          </view>
          <view v-for="t in recent" :key="t.id" class="txn">
            <view class="row items-center gap-2 flex-1">
              <view class="txn-tile" :class="{ income: t.type === 'income' }">
                <mz-icon :name="txnIcon(t)" :size="20" />
              </view>
              <view class="col flex-1">
                <view class="row items-center gap-1">
                  <text class="t-h3 ellipsis">{{ txnTitle(t) }}</text>
                  <text class="acct-tag">{{ t.account ? t.account.name : '未指定账户' }}</text>
                </view>
                <view class="row items-center gap-1">
                  <text class="t-label-sm c-secondary">{{ fmt.relDay(t.happenedAt) }} {{ fmt.time(t.happenedAt) }}</text>
                  <text class="t-label-sm c-secondary">·</text>
                  <text class="t-label-sm" :class="t.type === 'income' ? 'c-primary' : 'c-secondary'">{{ txnLabel(t) }}</text>
                </view>
              </view>
            </view>
            <view class="txn-right">
              <text class="t-num-data tnum" :class="t.type === 'income' ? 'c-primary' : 'c-ink'">{{ txnAmount(t) }}</text>
              <text class="t-label-sm c-secondary">{{ TYPE_LABEL[t.type] }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 重点分类预算速览 ===== -->
      <view class="panel">
        <view class="between">
          <view class="col">
            <text class="t-h3">重点分类预算速览</text>
            <text class="t-body-sm c-secondary">穿透至单项子预算健康线</text>
          </view>
          <view class="stat-tile" @tap="goBudgetOverview"><mz-icon name="tune" :size="18" color="var(--text-secondary)" /></view>
        </view>

        <view v-if="loading" class="skel">
          <view v-for="i in 3" :key="i" class="skel-row"></view>
        </view>
        <view v-else-if="loadError" class="empty">
          <mz-icon name="error_outline" :size="24" color="var(--text-secondary)" />
          <text>数据加载失败</text>
        </view>
        <view v-else-if="!categoryBudget.length" class="empty">
          <mz-icon name="inventory_2" :size="24" color="var(--text-secondary)" />
          <text>本月还没有分类预算。给常花的几类各设一个上限，就能看到单项健康线。</text>
          <text class="link-text" @tap="goBudgetSetup">去设置分类预算</text>
        </view>
        <view v-else class="cat-list">
          <view v-for="c in categoryBudget" :key="c.categoryId" class="cat-row">
            <view class="between">
              <view class="row items-center gap-1 flex-1">
                <view class="cat-dot" :class="catTone(c).dot"></view>
                <text class="t-label ellipsis">{{ c.categoryName }}</text>
              </view>
              <text class="t-num-data tnum" :class="catTone(c).text">
                {{ fmt.money(c.spent) }} / {{ fmt.money(c.budgetAmount) }}
              </text>
            </view>
            <view class="cat-track">
              <view class="cat-fill" :class="catTone(c).bar" :style="{ width: fmt.clampPercent(c.usedPct) + '%' }"></view>
            </view>
            <view class="between">
              <text class="t-body-sm" :class="catTone(c).text">{{ catNote(c) }}</text>
              <text class="t-body-sm" :class="c.remaining < 0 ? catTone(c).text : 'c-secondary'">
                {{ c.remaining < 0 ? '已超额' : '剩余 ' + fmt.money(c.remaining) }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 隐私说明 ===== -->
      <view class="privacy">
        <view class="row items-center gap-2 flex-1">
          <view class="privacy-tile"><mz-icon name="cloud_sync" :size="20" color="var(--brand-700)" /></view>
          <view class="col flex-1">
            <text class="t-label">账本归你自己 · 数据在自建库</text>
            <text class="t-body-sm c-secondary">账单存于自建数据库，随时可一键导出，不进任何第三方模型</text>
          </view>
        </view>
        <view class="privacy-btn" @tap="goPrivacy">数据设置</view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 首页（PRD 4.1）。
 *
 * 五个视觉状态（平稳 / 配额 / 警戒 / 临界 / 超支）在浏览器版是五个 HTML，
 * 但驱动它们的脚本只有一份、且完全由数据决定分支 —— 所以这里就是**一个页面**，
 * 状态由 /home/overview 的 budget.alertLevel 自动落到对应文案与配色。
 *
 * 两个接口并行发：
 *   GET /home/overview  预算进度 / 今日支出 / 最近流水 / 分类预算 / 月度收支
 *   GET /stats/overview 只为了 avgExpensePerDay（本月日均支出）
 * 日均单独取一次是因为 v_monthly_summary 里没有这一列，而 stats 模块已按同一
 * 口径算好 —— 复用那份结果而不是在前端再算一遍，否则两个口径迟早漂移成两个数。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { meta, session, currentPeriod } from '@/common/store'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const ALERT_TEXT = { normal: '节奏平稳', yellow: '进入关注区间', red: '已超出预警线' }
const TYPE_LABEL = { expense: '支出', income: '收入', transfer: '转账' }
const EMPTY = []

/* 分类预算的颜色档位。
 * 这是**纯展示**规则，不是产品口径 —— 后端刻意没定义分类预算的预警阈值
 * （PRD 未规定），75% / 100% 是照着设计稿的视觉档位定的。 */
function categoryTone(pct) {
  if (pct > 100) return { dot: 'bg-danger', bar: 'bg-danger', text: 'c-danger' }
  if (pct >= 75) return { dot: 'bg-warning', bar: 'bg-warning', text: 'c-warn' }
  return { dot: 'bg-brand', bar: 'bg-brand', text: 'c-primary' }
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      TYPE_LABEL,
      loading: true,
      loadError: '',
      data: null,
      stats: null,
      period: '',
    }
  },
  computed: {
    budget() { return (this.data && this.data.budget) || {} },
    summary() { return (this.data && this.data.summary) || {} },
    today() { return (this.data && this.data.today) || {} },
    recent() { return (this.data && this.data.recentTransactions) || EMPTY },
    categoryBudget() { return (this.data && this.data.categoryBudget) || EMPTY },
    hasBudget() { return !!this.budget.hasBudget },

    greeting() {
      const name = (session.user && session.user.displayName) || '你好'
      return name + '，' + WEEK[new Date().getDay()] + '好！'
    },
    paceText() {
      if (!this.hasBudget) return '本月尚未设预算'
      return '本月剩余 ' + this.budget.remainingDays + ' 天 · ' + (ALERT_TEXT[this.budget.alertLevel] || '')
    },
    paceDesc() {
      if (!this.hasBudget) return this.budget.message || '设置预算后就能看到「今日可花」。'
      return fmt.period(this.period) + '预算 ' + fmt.money(this.budget.totalAmount) +
        '，已用 ' + fmt.percent(this.budget.usedPct) + '。预算每天按剩余天数重新平摊。'
    },
    healthText() { return this.hasBudget ? (ALERT_TEXT[this.budget.alertLevel] || '—') : '待设置' },
    quotaValue() { return this.hasBudget ? fmt.amount(this.budget.todayQuota) : '未设置' },
    quotaDesc() {
      if (!this.hasBudget) return '设置本月预算总额，就能开始算每天能花多少。'
      return '依当月剩余 ' + this.budget.remainingDays + ' 天平摊，花完即止无愧疚感。'
    },
    usedPctText() { return this.hasBudget ? fmt.percent(this.budget.usedPct) : '—' },
    usedBarPct() { return this.hasBudget ? fmt.clampPercent(this.budget.usedPct) : 0 },
    spentText() {
      if (!this.hasBudget) return '还没有预算可对照'
      return '已用 ' + fmt.money(this.budget.spent) + ' / ' + fmt.money(this.budget.totalAmount)
    },
    remainText() { return this.hasBudget ? '剩余 ' + fmt.money(this.budget.remaining) : '' },

    todayExpense() { return this.today.todayExpense || 0 },
    todayExpenseText() { return fmt.money(this.todayExpense) },
    todayCountText() { return '今日已入账 ' + (this.today.todayExpenseCount || 0) + ' 笔流水' },
    todayTag() {
      if (this.hasBudget && this.budget.todayQuota != null) {
        return this.todayExpense > this.budget.todayQuota ? '已超今日额度' : '今日额度内'
      }
      return '未设预算'
    },
    todayTagTone() {
      if (this.hasBudget && this.budget.todayQuota != null) {
        return this.todayExpense > this.budget.todayQuota ? 'c-danger' : 'c-primary'
      }
      return 'c-primary'
    },

    monthExpenseText() { return fmt.money(this.summary.expenseTotal || 0) },
    monthExpenseSub() { return this.stats ? '日均 ' + fmt.money(this.stats.avgExpensePerDay) : '—' },
    monthExpenseTag() { return (this.summary.expenseCount || 0) + ' 笔支出' },
    monthIncomeText() {
      const v = this.summary.incomeTotal || 0
      return (v > 0 ? '+' : '') + fmt.money(v)
    },
    monthIncomeSub() { return (this.summary.incomeCount || 0) + ' 笔入账' },
    monthIncomeTag() {
      const net = this.summary.net || 0
      return '结余 ' + (net >= 0 ? '+' : '') + fmt.money(net)
    },

    /* 分母是「设了分类预算的类目」，不是全部分类 */
    overItems() {
      const self = this
      return this.categoryBudget.filter(function (x) { return x.spent > x.budgetAmount })
    },
    riskCount() { return this.overItems.length },
    riskDetail() {
      if (!this.overItems.length) return '各分类都在预算内'
      const worst = this.overItems[0]
      return worst.categoryName + ' 超支 ' + fmt.money(worst.spent - worst.budgetAmount) +
        (this.overItems.length > 1 ? ' 等 ' + this.overItems.length + ' 项' : '')
    },
  },
  onShow() {
    this.load()
  },
  methods: {
    catTone: categoryTone,
    catNote(c) {
      return c.remaining < 0 ? '已超支 ' + fmt.money(-c.remaining) : '已用 ' + fmt.percent(c.usedPct)
    },
    txnIcon(t) {
      /* 兜底用 label（字体子集里有）—— 'sell' 不在子集里，会渲染成空白方块 */
      if (t.category) return t.category.icon || 'label'
      return t.type === 'transfer' ? 'swap_horiz' : 'receipt_long'
    },
    // 标题优先取商户，其次取分类；右侧小字留给备注，避免标题和右侧小字是同一句话
    txnTitle(t) {
      return t.merchant || (t.category && t.category.name) || TYPE_LABEL[t.type]
    },
    txnLabel(t) {
      if (t.note) return t.note
      if (t.merchant) return (t.category && t.category.name) || TYPE_LABEL[t.type]
      return TYPE_LABEL[t.type]
    },
    txnAmount(t) {
      if (t.type === 'transfer') return fmt.money(t.amount)
      return fmt.signedMoney(t.type, t.amount)
    },

    goRecord() { uni.switchTab({ url: '/pages/record/sheet' }) },
    goLedger() { uni.switchTab({ url: '/pages/ledger/list' }) },
    goImport() { uni.navigateTo({ url: '/pages/import/main' }) },
    goBudgetSetup() { uni.navigateTo({ url: '/pages/budget/setup' }) },
    goBudgetOverview() { uni.navigateTo({ url: '/pages/budget/overview' }) },
    goPrivacy() { uni.navigateTo({ url: '/pages/settings/privacy' }) },

    load() {
      const self = this
      self.loading = true
      self.loadError = ''
      // 周期在每次 load 时重取：用户可能在预算/流水页翻过月份，
      // 返回首页时应当跟着走，而不是停在进入时的那个月。
      self.period = currentPeriod()
      return meta().then(function (ctx) {
        session.user = ctx.user
        session.ledger = ctx.ledger
        const main = api.get('/home/overview', { period: self.period, recentLimit: 5 })
        // 日均是锦上添花：它挂了不该把整页拖垮，所以单独吞掉失败
        const stats = api.get('/stats/overview', { period: self.period }).catch(function () { return null })
        return Promise.all([main, stats]).then(function (res) {
          self.data = res[0]
          self.stats = res[1]
          self.loading = false
        })
      }).catch(function (err) {
        // 提示条已由 api.js 的 notifier 弹过；这里把骨架换成明确的失败态，
        // 否则用户会一直盯着脉冲动画，分不清是慢还是挂了
        self.loading = false
        self.loadError = '数据加载失败：' + ((err && err.message) || '请稍后重试')
        // onShow 生命周期不会消费 Promise rejection；界面已展示可重试错误态，
        // 此处结束链路，避免控制台产生未处理的 Promise 拒绝。
        return null
      })
    },
  },
}
</script>
