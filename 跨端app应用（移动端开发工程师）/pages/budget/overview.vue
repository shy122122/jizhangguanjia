<template>
  <mz-page title="预算管控" :back="false" tabbar>
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
        <view class="row items-center gap-1">
          <view class="pulse"></view>
          <text class="t-label-sm c-secondary">{{ periodMeta }}</text>
        </view>
      </view>

      <!-- 本月没设总预算时的引导条：比在任何一张卡片上显示「—」都直白 -->
      <view v-if="loaded && !hasBudget" class="banner">
        <mz-icon name="info" :size="20" color="#0F766E" />
        <text class="banner-text">这个月还没有设置总预算，设置后才能看到预算穿透与今日可花。</text>
        <view class="mz-btn mz-btn-primary banner-btn" @tap="editTotal">现在设置</view>
      </view>

      <!-- ===== 总预算主卡 ===== -->
      <view class="mz-card hero">
        <view class="between">
          <view class="row items-center gap-1">
            <mz-icon name="account_balance" :size="22" color="#0F766E" />
            <text class="kicker">月度总预算看板</text>
          </view>
          <text class="exec">{{ execRange }}</text>
        </view>

        <view class="grid-3 metrics">
          <view class="metric">
            <text class="metric-label">月度总额度</text>
            <text class="metric-value tnum">{{ moneyOr(totalAmount) }}</text>
          </view>
          <view class="metric">
            <text class="metric-label">已支出</text>
            <text class="metric-value tnum">{{ moneyOr(spent) }}</text>
          </view>
          <view class="metric">
            <text class="metric-label">剩余可用预算</text>
            <text class="metric-value tnum c-primary">{{ moneyOr(remaining) }}</text>
          </view>
        </view>

        <view class="progress">
          <view class="between">
            <text class="t-body-sm c-ink">综合开销进度</text>
            <text class="t-body-sm bold c-primary">{{ fmt.percent(usedPct) }}</text>
          </view>
          <view class="track">
            <view class="track-spent" :style="{ width: spentWidth + '%' }"></view>
            <view class="track-buffer" :style="{ width: bufferWidth + '%' }"></view>
          </view>
          <view class="legend">
            <view class="legend-item"><view class="dot dot-brand"></view><text>{{ moneyOr(spent) === '—' ? '已用 —' : '已用 ' + fmt.money(spent) }}</text></view>
            <view class="legend-item"><view class="dot dot-buffer"></view><text>{{ moneyOr(remaining) === '—' ? '剩余 —' : '剩余 ' + fmt.money(remaining) }}</text></view>
            <text class="legend-cap">{{ moneyOr(totalAmount) === '—' ? '预算上限 —' : '预算上限 ' + fmt.money(totalAmount) }}</text>
          </view>
        </view>

        <view class="guarantee">
          <mz-icon name="security" :size="20" color="#0E7490" />
          <text class="guarantee-text">柔性记账机制保障：即使单项超额，账单登记保持畅通无阻</text>
        </view>
      </view>

      <!-- ===== 今日可花（算法穿透） ===== -->
      <view class="quota bg-brand-gradient">
        <view class="quota-badge">
          <mz-icon name="auto_awesome" :size="16" color="#FFFFFF" />
          <text>算法穿透 · 动态平稳模型</text>
        </view>
        <text class="quota-label">今日建议可花额度（动态平衡）</text>
        <text class="quota-value tnum">{{ quotaText }}</text>

        <view class="formula">
          <view class="between">
            <text class="formula-kicker">穿透测算公式</text>
            <mz-icon name="functions" :size="18" color="rgba(255,255,255,0.7)" />
          </view>
          <view class="formula-row tnum">
            <text>{{ moneyOr(remaining) === '—' ? '剩余 —' : '剩余 ' + fmt.money(remaining) }}</text>
            <text class="dim">÷</text>
            <text>剩余 {{ remainingDays === null ? '—' : remainingDays }} 天</text>
            <text class="dim">=</text>
            <text class="bold">{{ quotaText }}</text>
          </view>
        </view>

        <view class="quota-hint">
          <mz-icon name="lightbulb" :size="20" color="#5EEAD4" />
          <text>{{ quotaHint }}</text>
        </view>
      </view>

      <!-- ===== 分类子预算 ===== -->
      <view class="section-head">
        <view class="row items-center gap-2">
          <text class="t-h3">分类子预算穿透</text>
          <text class="count-chip">{{ catItems.length }} 个生效中维度</text>
        </view>
        <view class="sorts">
          <text class="sort-label">排序</text>
          <text class="sort" :class="{ on: sort === 'ratio' }" @tap="setSort('ratio')">使用比例</text>
          <text class="sort-sep">/</text>
          <text class="sort" :class="{ on: sort === 'amount' }" @tap="setSort('amount')">预算规模</text>
        </view>
      </view>

      <view class="cat-grid">
        <view v-for="c in sortedCategories" :key="c.categoryId" class="mz-card cat-card">
          <view class="between">
            <view class="row items-center gap-2">
              <mz-icon :name="c.icon || 'category'" :size="22" color="#0F766E" />
              <text class="cat-name">{{ c.categoryName }}</text>
            </view>
            <text class="t-label-sm bold" :class="toneOf(c).text">{{ fmt.percent(c.usedPct) }}</text>
          </view>

          <view class="mz-track cat-track">
            <view class="mz-fill" :class="toneOf(c).fill" :style="{ width: fmt.clampPercent(c.usedPct) + '%' }"></view>
          </view>

          <view class="between">
            <text class="t-body-sm c-secondary">已用 {{ fmt.money(c.spent) }}</text>
            <text class="t-body-sm c-secondary">额度 {{ fmt.money(c.budgetAmount) }}</text>
          </view>

          <view class="cat-actions">
            <view class="mz-btn flex-1 cat-btn" @tap="editCategory(c)">调整</view>
            <view class="mz-btn cat-btn cat-del" @tap="removeCategory(c)">取消</view>
          </view>
        </view>

        <view class="add-card" @tap="editCategory(null)">
          <mz-icon name="add_circle" :size="30" color="#0F766E" />
          <text class="add-text">添加新预算分类</text>
        </view>
      </view>

      <!-- ===== 平衡保障 ===== -->
      <view class="mz-card balance">
        <view class="row items-center gap-3">
          <view class="bal-tile">
            <mz-icon name="format_image_left" :size="26" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="t-h3">预算平衡保障</text>
              <text class="bal-badge" :class="{ bad: catOverBudget }">{{ balanceBadge }}</text>
            </view>
            <text class="t-body-sm c-secondary">{{ sumNotice }}</text>
          </view>
        </view>

        <view class="bal-actions">
          <view class="mz-btn flex-1" @tap="archivePrev">
            <mz-icon name="history" :size="20" />
            <text>历史归档</text>
          </view>
          <view class="mz-btn mz-btn-primary flex-1" @tap="rebalance">
            <mz-icon name="published_with_changes" :size="20" />
            <text>一键智能平衡</text>
          </view>
        </view>
      </view>

      <!-- 顶部动作条：放在底部，拇指够得着 -->
      <view class="fab-row">
        <view class="mz-btn flex-1" @tap="editTotal">
          <mz-icon name="tune" :size="20" />
          <text>调整总预算</text>
        </view>
        <view class="mz-btn mz-btn-primary flex-1" @tap="editCategory(null)">
          <mz-icon name="add" :size="20" />
          <text>新增分类预算</text>
        </view>
      </view>
    </view>

    <!-- ===== 金额输入 ===== -->
    <mz-amount-dialog
      :visible="amountDlg.visible"
      :title="amountDlg.title"
      :initial="amountDlg.initial"
      @confirm="onAmountConfirm"
      @cancel="amountDlg.visible = false"
    />

    <!-- ===== 分类预算编辑（新增 / 调整） ===== -->
    <view v-if="catDlg.visible" class="mask" @tap="catDlg.visible = false">
      <view class="panel anim-fade" @tap.stop>
        <text class="panel-title">{{ catDlg.editing ? '调整分类预算' : '新增分类预算' }}</text>
        <text class="panel-hint">选择支出分类并设置本月额度。</text>

        <picker
          class="panel-pick"
          mode="selector"
          :range="expenseNames"
          :value="catDlg.index"
          :disabled="catDlg.editing"
          @change="onCatDlgPick"
        >
          <view class="pick" :class="{ disabled: catDlg.editing }">
            <text class="pick-text ellipsis">{{ catDlg.editing ? catDlg.name : expenseNames[catDlg.index] }}</text>
            <mz-icon name="expand_more" :size="18" color="var(--text-secondary)" />
          </view>
        </picker>

        <view class="panel-field">
          <text class="yuan">¥</text>
          <input
            v-model="catDlg.amount"
            class="panel-input tnum"
            type="digit"
            placeholder="0.00"
            placeholder-class="ph"
            focus
          />
        </view>

        <view class="panel-actions">
          <view class="mz-btn flex-1" @tap="catDlg.visible = false">取消</view>
          <view class="mz-btn mz-btn-primary flex-1" @tap="submitCategory">保存</view>
        </view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 总预算看板（浏览器版 10-budget-overview.html + assets/js/budget-pages.js）。
 *
 * 三件浏览器版里必须改的事：
 *   1. amountDialog / categoryDialog 原本是「造 DOM + 挂事件 + Promise」，
 *      这里金额框抽成了 mz-amount-dialog，分类框就地写成 overlay。
 *   2. 那个「柔性预算调配」模态框在浏览器版里**没有任何调用方**（openReallocateModal
 *      定义了但没人调）—— 是死代码，所以没有移植。
 *   3. 「历史预算归档」= 切到上一月，与浏览器的 archiveBtn 一致（它也只是 shiftPeriod(-1)）。
 * 数据来源、请求参数、排序与「一键智能平衡」的算法逐条照搬。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import mzAmountDialog from '@/components/mz-amount-dialog/mz-amount-dialog.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { toast, confirm } from '@/common/ui'
import { meta, currentPeriod, rememberPeriod } from '@/common/store'

const EMPTY = []

/* 分类预算的展示档位。与 ledger/list.vue 同源 —— 后端没有分类预算的预警阈值定义
 * （PRD 未规定），80% / 100% 是照着设计稿的视觉档位定的。 */
function toneOf(c) {
  if (c.usedPct >= 100) return { fill: 'fill-over', text: 'c-danger' }
  if (c.usedPct >= 80) return { fill: 'fill-warning', text: 'c-warn' }
  return { fill: 'fill-ok', text: 'c-primary' }
}

export default {
  components: { mzIcon, mzPage, mzAmountDialog },
  data() {
    return {
      fmt,
      period: currentPeriod(),
      ctx: null,
      budget: null,
      categories: null,
      quotaData: null,
      sort: 'ratio',
      loaded: false,

      amountDlg: { visible: false, title: '', initial: '', resolve: null },
      catDlg: { visible: false, editing: false, index: 0, name: '', categoryId: null, amount: '' },
    }
  },
  computed: {
    hasBudget() { return !!(this.budget && this.budget.hasBudget) },
    totalAmount() { return this.hasBudget ? this.budget.totalAmount : null },
    spent() { return this.hasBudget ? this.budget.spent : null },
    remaining() { return this.hasBudget ? this.budget.remaining : null },
    usedPct() { return this.hasBudget ? this.budget.usedPct : 0 },
    remainingDays() {
      if (!this.hasBudget) return null
      return this.budget.remainingDays === undefined ? null : this.budget.remainingDays
    },
    spentWidth() { return fmt.clampPercent(this.usedPct) },
    bufferWidth() { return 100 - fmt.clampPercent(this.usedPct) },

    periodLabel() { return fmt.period(this.period) },
    periodMeta() { return this.hasBudget ? '预算数据已同步' : '本月尚未设置预算' },
    execRange() {
      if (!this.hasBudget) return '执行期：—'
      return '执行期：' + this.period + '-01 至 ' + this.budget.periodEndDate
    },

    quota() { return this.quotaData || {} },
    quotaText() {
      const q = this.quota.todayQuota
      return q === null || q === undefined ? '仅当前月计算' : fmt.money(q)
    },
    quotaHint() {
      return this.quota.todayQuota === null || this.quota.todayQuota === undefined
        ? '历史月份只展示预算执行情况'
        : '按当前剩余预算与剩余天数实时计算'
    },

    catItems() { return (this.categories && this.categories.items) || EMPTY },
    sortedCategories() {
      const items = this.catItems.slice()
      const byAmount = this.sort === 'amount'
      items.sort(function (a, b) {
        return byAmount ? b.budgetAmount - a.budgetAmount : b.usedPct - a.usedPct
      })
      return items
    },
    catTotal() { return (this.categories && this.categories.categoryBudgetTotal) || 0 },
    catOverBudget() { return this.hasBudget && this.catTotal > this.budget.totalAmount },
    balanceBadge() { return this.catOverBudget ? '分类合计超出总预算' : '校验通过' },
    sumNotice() {
      const head = '分类预算合计 ' + fmt.money(this.catTotal)
      return this.hasBudget ? head + '，月度总预算 ' + fmt.money(this.budget.totalAmount) + '。' : head + '。'
    },

    /** 分类编辑框的可选项：支出且未归档的分类（与浏览器版过滤条件一致） */
    expenseCategories() {
      const cats = (this.ctx && this.ctx.categories) || EMPTY
      return cats.filter(function (x) { return x.type === 'expense' && !x.isArchived })
    },
    expenseNames() {
      return this.expenseCategories.map(function (x) { return x.name })
    },
  },
  onShow() {
    this.load()
  },
  methods: {
    toneOf,

    /* ---------------- 取数 ---------------- */
    load() {
      const self = this
      if (!this.ctx) {
        return meta().then(function (ctx) {
          self.ctx = ctx
          return self.load()
        }).catch(function () {})
      }
      return Promise.all([
        api.get('/budget', { period: this.period }),
        api.get('/budget/categories', { period: this.period }),
        api.get('/home/quota', { period: this.period }),
      ]).then(function (values) {
        self.budget = values[0]
        self.categories = values[1]
        self.quotaData = values[2]
        self.loaded = true
      }).catch(function () {
        self.loaded = true
      })
    },

    saveTotal(amount) {
      const self = this
      const b = this.budget || {}
      return api.put('/budget', {
        period: this.period,
        totalAmount: amount,
        alertYellowPct: b.alertYellowPct || 80,
        alertRedPct: b.alertRedPct || 100,
        safeSpendMode: 'daily_flat',
      }).then(function () {
        toast('月度总预算已保存', 'success')
        return self.load()
      })
    },

    /* ---------------- 总预算 ---------------- */
    editTotal() {
      this.openAmount('设置 ' + this.periodLabel + '总预算', this.hasBudget ? this.budget.totalAmount : '')
    },
    openAmount(title, initial) {
      const self = this
      this.amountDlg.title = title
      this.amountDlg.initial = initial
      this.amountDlg.visible = true
      // 对话框只抛结果，要不要串后续请求由调用方决定
      this._amountNext = function (value) { return self.saveTotal(value) }
    },
    onAmountConfirm(value) {
      this.amountDlg.visible = false
      const next = this._amountNext
      this._amountNext = null
      if (next) next(value)
    },

    /* ---------------- 分类预算 ---------------- */
    editCategory(existing) {
      if (!this.hasBudget) {
        toast('请先设置月度总预算', 'error')
        return
      }
      if (existing) {
        this.catDlg = {
          visible: true,
          editing: true,
          index: 0,
          name: existing.categoryName,
          categoryId: existing.categoryId,
          amount: String(existing.budgetAmount),
        }
        return
      }
      // 新增：先把已设过预算的分类排除掉，避免重复设
      const used = {}
      this.catItems.forEach(function (x) { used[x.categoryId] = true })
      const free = this.expenseCategories.filter(function (x) { return !used[x.id] })
      if (!free.length) {
        toast('所有支出分类都已设过预算', 'info')
        return
      }
      this.catDlg = {
        visible: true,
        editing: false,
        index: 0,
        name: '',
        categoryId: free[0].id,
        amount: '',
      }
      this._freeCats = free
    },
    onCatDlgPick(e) {
      const i = Number(e.detail.value)
      const free = this._freeCats || []
      this.catDlg.index = i
      if (free[i]) this.catDlg.categoryId = free[i].id
    },
    submitCategory() {
      const d = this.catDlg
      const raw = String(d.amount || '').trim()
      const amount = Number(raw)
      if (!raw || !isFinite(amount) || amount < 0) {
        toast('请输入有效金额', 'error')
        return
      }
      const self = this
      const categoryId = d.editing ? d.categoryId : (this._freeCats && this._freeCats[d.index] ? this._freeCats[d.index].id : null)
      if (!categoryId) {
        toast('请选择分类', 'error')
        return
      }
      api.put('/budget/categories/' + categoryId, {
        period: this.period,
        amount: Math.round(amount * 100) / 100,
      }).then(function () {
        self.catDlg.visible = false
        toast('分类预算已保存', 'success')
        return self.load()
      })
    },
    removeCategory(item) {
      const self = this
      confirm('取消「' + item.categoryName + '」在 ' + fmt.period(this.period) + '的分类预算？', { danger: true })
        .then(function (ok) {
          if (!ok) return
          return api.del('/budget/categories/' + item.categoryId, undefined, {
            query: { period: self.period },
          }).then(function () {
            toast('分类预算已取消', 'success')
            return self.load()
          })
        })
    },

    /* ---------------- 周期 / 排序 / 平衡 ---------------- */
    shiftPeriod(direction) {
      this.period = direction < 0 ? fmt.prevPeriod(this.period) : fmt.nextPeriod(this.period)
      rememberPeriod(this.period)
      this.load()
    },
    archivePrev() { this.shiftPeriod(-1) },
    setSort(sort) { this.sort = sort },

    /**
     * 一键智能平衡：按现有分类预算的比例，把它们等比放大/缩小到总预算。
     * 最后一项用「总额 - 前面各项之和」补差，保证合计精确等于总预算
     * —— 逐项四舍五入会差几分钱，对账时很难解释。
     */
    rebalance() {
      const self = this
      const items = this.catItems
      if (!this.hasBudget || !items.length) {
        toast('请先设置总预算和分类预算', 'error')
        return
      }
      const sum = items.reduce(function (n, x) { return n + x.budgetAmount }, 0)
      if (!sum) return
      confirm('按现有分类比例，将分类预算合计调整为总预算？').then(function (ok) {
        if (!ok) return
        const total = self.budget.totalAmount
        const reqs = items.map(function (x, i) {
          let amount
          if (i === items.length - 1) {
            const head = items.slice(0, -1).reduce(function (n, y) {
              return n + Math.round(total * y.budgetAmount / sum * 100) / 100
            }, 0)
            amount = total - head
          } else {
            amount = Math.round(total * x.budgetAmount / sum * 100) / 100
          }
          return api.put('/budget/categories/' + x.categoryId, { period: self.period, amount: amount })
        })
        return Promise.all(reqs).then(function () {
          toast('分类预算已智能对齐', 'success')
          return self.load()
        })
      })
    },

    moneyOr(v) {
      return v === null || v === undefined ? '—' : fmt.money(v)
    },
  },
}
</script>

<style lang="scss" scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 0 24rpx 32rpx;
}

/* ===== 周期 ===== */
.switcher {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container));
}
.sw-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  &:active { background-color: rgb(var(--mz-surface-container-high)); }
}
.sw-label {
  padding: 0 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.pulse {
  width: 14rpx;
  height: 14rpx;
  border-radius: 9999rpx;
  background-color: var(--brand-500);
}

/* ===== 未设预算引导 ===== */
.banner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 28rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.banner-text { flex: 1; min-width: 0; font-size: 24rpx; color: var(--text-secondary); }
.banner-btn { flex-shrink: 0; height: 64rpx; padding: 0 24rpx; font-size: 24rpx; }

/* ===== 总预算主卡 ===== */
.hero {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx;
}
.kicker { font-size: 22rpx; letter-spacing: 0.06em; color: var(--text-secondary); }
.exec {
  padding: 6rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-low));
}
.metrics { gap: 20rpx; }
.metric { display: flex; flex-direction: column; gap: 4rpx; }
.metric-label { font-size: 22rpx; color: var(--text-secondary); }
.metric-value { font-size: 34rpx; font-weight: 700; color: var(--text-primary); }

.progress { display: flex; flex-direction: column; gap: 10rpx; }
.track {
  display: flex;
  flex-direction: row;
  gap: 6rpx;
  height: 22rpx;
  padding: 3rpx;
  border-radius: 9999rpx;
  background-color: rgb(var(--mz-surface-container-high));
  overflow: hidden;
}
.track-spent {
  height: 100%;
  border-radius: 9999rpx;
  background-color: rgb(var(--mz-primary));
  transition: width 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.track-buffer {
  height: 100%;
  border-radius: 9999rpx;
  background-color: rgba(204, 251, 241, 0.55);
  transition: width 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8rpx;
  font-size: 20rpx;
  color: var(--text-secondary);
}
.legend-item { display: flex; flex-direction: row; align-items: center; gap: 6rpx; }
.dot { width: 12rpx; height: 12rpx; border-radius: 9999rpx; }
.dot-brand { background-color: rgb(var(--mz-primary)); }
.dot-buffer { background-color: rgba(204, 251, 241, 0.9); }
.legend-cap { font-size: 20rpx; color: var(--text-secondary); }

.guarantee {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background-color: rgba(var(--mz-surface-container-low), 0.7);
}
.guarantee-text { flex: 1; min-width: 0; font-size: 22rpx; color: var(--text-secondary); }

/* ===== 今日可花 ===== */
.quota {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 32rpx;
  border-radius: 32rpx;
  color: #FFFFFF;
  box-shadow: var(--shadow-tier2);
}
.quota-badge {
  align-self: flex-start;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 18rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  background-color: rgba(255, 255, 255, 0.18);
}
.quota-label { margin-top: 8rpx; font-size: 24rpx; color: rgba(255, 255, 255, 0.82); }
.quota-value { font-size: 72rpx; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.formula {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background-color: rgba(0, 0, 0, 0.16);
}
.formula-kicker { font-size: 20rpx; color: rgba(255, 255, 255, 0.7); }
.formula-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  padding: 10rpx 16rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
  background-color: rgba(255, 255, 255, 0.1);
}
.formula-row .dim { color: rgba(255, 255, 255, 0.6); }
.formula-row .bold { font-weight: 700; }
.quota-hint {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.9);
}

/* ===== 分类子预算 ===== */
.section-head {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 8rpx;
}
.count-chip {
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container));
}
.sorts { display: flex; flex-direction: row; align-items: center; gap: 8rpx; font-size: 24rpx; }
.sort-label { color: var(--text-secondary); }
.sort { color: var(--text-secondary); }
.sort.on { color: var(--brand-700); font-weight: 700; }
.sort-sep { color: var(--text-tertiary); }

.cat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}
.cat-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx;
}
.cat-name { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.cat-track { height: 12rpx; }
.cat-actions { display: flex; flex-direction: row; gap: 12rpx; }
.cat-btn { height: 64rpx; padding: 0 16rpx; font-size: 24rpx; border-radius: 18rpx; }
.cat-del { flex-shrink: 0; color: var(--danger); background-color: var(--danger-bg); }

.add-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  min-height: 220rpx;
  padding: 24rpx;
  border-radius: 28rpx;
  border: 4rpx dashed var(--border-strong);
  background-color: rgb(var(--mz-surface-container-low));
}
.add-text { font-size: 24rpx; font-weight: 600; color: var(--brand-700); }

/* ===== 平衡保障 ===== */
.balance {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 28rpx;
}
.bal-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84rpx;
  height: 84rpx;
  flex-shrink: 0;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container));
}
.bal-badge {
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-high));
  &.bad { color: var(--danger); background-color: var(--danger-bg); }
}
.bal-actions { display: flex; flex-direction: row; gap: 20rpx; }

.fab-row {
  display: flex;
  flex-direction: row;
  gap: 20rpx;
  margin-top: 8rpx;
}

/* ===== 分类编辑浮层 ===== */
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
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 40rpx;
  border-radius: 32rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier3);
}
.panel-title { font-size: 34rpx; font-weight: 700; color: var(--text-primary); }
.panel-hint { font-size: 24rpx; color: var(--text-secondary); }
.panel-pick { margin-top: 16rpx; }
.pick {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  height: 96rpx;
  padding: 0 28rpx;
  border-radius: 22rpx;
  background-color: rgb(var(--mz-surface-container-low));
  &.disabled { opacity: 0.6; }
}
.pick-text { font-size: 28rpx; color: var(--text-primary); }
.panel-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  height: 96rpx;
  padding: 0 28rpx;
  border-radius: 22rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.yuan { font-size: 32rpx; font-weight: 600; color: var(--text-primary); }
.panel-input {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-primary);
  background: transparent;
}
.ph { color: var(--text-tertiary); font-weight: 400; }
.panel-actions { display: flex; flex-direction: row; gap: 20rpx; margin-top: 20rpx; }
</style>
