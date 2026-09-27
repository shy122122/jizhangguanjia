<template>
  <mz-page title="收支流水" :back="false" tabbar>
    <template #nav-right>
      <view class="icon-btn" @tap="goImport">
        <mz-icon name="upload_file" :size="22" />
      </view>
    </template>

    <view class="ledger">
      <!-- ===== 月度汇总 ===== -->
      <view class="summary">
        <view class="sum-item">
          <text class="sum-label">本月支出</text>
          <text class="sum-value tnum">{{ summary ? fmt.money(summary.expenseTotal) : '—' }}</text>
        </view>
        <view class="sum-div"></view>
        <view class="sum-item">
          <text class="sum-label">收入</text>
          <text class="sum-value tnum c-primary">{{ summary ? fmt.money(summary.incomeTotal) : '—' }}</text>
        </view>
        <view class="sum-div"></view>
        <view class="sum-item">
          <text class="sum-label">结余</text>
          <text class="sum-value tnum" :class="netClass">{{ netText }}</text>
        </view>
      </view>

      <!-- ===== 搜索 + 筛选开关 ===== -->
      <view class="search-bar">
        <view class="search-box">
          <mz-icon name="search" :size="20" color="var(--text-secondary)" />
          <input
            v-model="keywordInput"
            class="search-input"
            type="text"
            placeholder="搜索备注、商户或标签"
            placeholder-class="ph"
            confirm-type="search"
            @input="onKeyword"
            @confirm="applyKeyword"
          />
          <view v-if="keywordInput" class="search-clear" @tap="clearKeyword">
            <mz-icon name="close" :size="18" color="var(--text-secondary)" />
          </view>
        </view>
        <view class="filter-toggle" :class="{ on: showFilter }" @tap="showFilter = !showFilter">
          <mz-icon name="filter_alt" :size="20" :color="showFilter ? '#0F766E' : 'var(--text-secondary)'" />
          <text class="filter-toggle-text">筛选</text>
          <view v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</view>
        </view>
      </view>

      <!-- ===== 筛选面板 ===== -->
      <view v-if="showFilter" class="filter-panel anim-fade">
        <view class="filter-row">
          <text class="filter-label">时间</text>
          <view class="seg">
            <view
              v-for="r in RANGES"
              :key="r.value"
              class="seg-item"
              :class="{ on: range === r.value }"
              @tap="setRange(r.value)"
            >{{ r.label }}</view>
          </view>
        </view>

        <view class="filter-row">
          <text class="filter-label">类型</text>
          <view class="seg">
            <view
              v-for="t in TYPES"
              :key="t.value"
              class="seg-item"
              :class="{ on: type === t.value }"
              @tap="setType(t.value)"
            >{{ t.label }}</view>
          </view>
        </view>

        <view class="filter-row">
          <text class="filter-label">分类</text>
          <picker
            class="pick-wrap"
            mode="selector"
            :range="categoryNames"
            :value="catIndex"
            @change="onCatPick"
          >
            <view class="pick">
              <text class="pick-text ellipsis">{{ categoryLabel }}</text>
              <mz-icon name="expand_more" :size="18" color="var(--text-secondary)" />
            </view>
          </picker>
        </view>

        <view class="filter-row">
          <text class="filter-label">账户</text>
          <picker
            class="pick-wrap"
            mode="selector"
            :range="accountNames"
            :value="acctIndex"
            @change="onAcctPick"
          >
            <view class="pick">
              <text class="pick-text ellipsis">{{ accountLabel }}</text>
              <mz-icon name="expand_more" :size="18" color="var(--text-secondary)" />
            </view>
          </picker>
        </view>

        <view class="filter-row">
          <text class="filter-label">金额</text>
          <view class="amount-range">
            <input
              v-model="minInput"
              class="amount-input tnum"
              type="digit"
              placeholder="最小"
              placeholder-class="ph"
              @input="onAmount"
            />
            <text class="amount-dash">—</text>
            <input
              v-model="maxInput"
              class="amount-input tnum"
              type="digit"
              placeholder="最大"
              placeholder-class="ph"
              @input="onAmount"
            />
          </view>
        </view>
      </view>

      <!-- ===== 生效中的筛选条件 ===== -->
      <scroll-view v-if="chips.length" class="chips" scroll-x :show-scrollbar="false">
        <view class="chips-inner">
          <view v-for="c in chips" :key="c.key" class="mz-chip chips-item" @tap="clearFilter(c.key)">
            <text>{{ c.label }}</text>
            <mz-icon name="close" :size="14" />
          </view>
          <view class="chips-reset" @tap="resetFilters">重置</view>
        </view>
      </scroll-view>

      <!-- ===== 首屏加载 ===== -->
      <view v-if="firstLoading" class="card">
        <view v-for="n in 6" :key="n" class="skel-row">
          <view class="skel-tile"></view>
          <view class="col flex-1 gap-2">
            <view class="skel-line w60"></view>
            <view class="skel-line w40"></view>
          </view>
          <view class="skel-line w20"></view>
        </view>
      </view>

      <!-- ===== 加载失败 ===== -->
      <view v-else-if="loadError && !items.length" class="state">
        <view class="state-tile"><mz-icon name="error_outline" :size="28" color="var(--text-secondary)" /></view>
        <text class="t-h3">{{ loadError }}</text>
        <view class="mz-btn mz-btn-primary mt-space-sm" @tap="load(true)">重新加载</view>
      </view>

      <!-- ===== 空态（含筛选无结果） ===== -->
      <view v-else-if="!items.length" class="state">
        <view class="state-tile"><mz-icon name="search_off" :size="28" color="var(--text-secondary)" /></view>
        <text class="t-h3">{{ hasFilter ? '没有符合条件的记录' : '这个月还没有流水' }}</text>
        <text class="t-body-sm c-secondary">
          {{ hasFilter ? '换个关键词，或放宽分类、账户与金额区间试试' : '去记一笔，或从微信/支付宝导入账单' }}
        </text>
        <view v-if="hasFilter" class="mz-btn mt-space-sm" @tap="resetFilters">清空筛选条件</view>
        <view v-else class="mz-btn mz-btn-primary mt-space-sm" @tap="goRecord">记一笔</view>
      </view>

      <!-- ===== 按日分组的流水 ===== -->
      <view v-else class="card">
        <view v-for="g in groups" :key="g.day" class="day-group">
          <view class="day-head">
            <view class="row items-center gap-2">
              <text class="t-h3">{{ g.label }}</text>
              <text class="t-label-sm c-tertiary">{{ g.weekday }}</text>
            </view>
            <view class="day-bits">
              <text v-if="g.expense" class="day-bit">
                支出 <text class="tnum c-ink">{{ fmt.money(g.expense) }}</text>
              </text>
              <text v-if="g.income" class="day-bit">
                · 收入 <text class="tnum c-primary">{{ fmt.money(g.income) }}</text>
              </text>
              <text v-if="g.transfer" class="day-bit">
                · 转账 <text class="tnum c-tertiary">{{ fmt.money(g.transfer) }}</text>
              </text>
            </view>
          </view>

          <view
            v-for="t in g.items"
            :key="t.id"
            class="txn"
            :class="{ removing: removingId === t.id }"
            @longpress="onRowLongPress(t)"
          >
            <view class="txn-tile" :style="catColor(t)">
              <mz-icon :name="catIcon(t)" :size="20" />
            </view>

            <view class="col flex-1">
              <view class="row items-center gap-1">
                <text class="txn-title ellipsis">{{ txnTitle(t) }}</text>
                <text v-if="t.source === 'import'" class="tag-import">导入</text>
              </view>
              <text class="txn-sub ellipsis">{{ txnSub(t) }}</text>
              <!-- 预算渗透：有预算才画进度条，否则只留一句说明，不留空白 -->
              <view v-if="penetrationOf(t)" class="pen">
                <view class="between pen-top">
                  <text class="t-label-sm c-secondary ellipsis">{{ penetrationOf(t).label }}</text>
                  <text class="t-label-sm bold" :class="penetrationOf(t).tone.text">
                    {{ penetrationOf(t).remainText }}
                  </text>
                </view>
                <view class="mz-track mz-track-thin">
                  <view
                    class="mz-fill"
                    :class="penetrationOf(t).tone.fill"
                    :style="{ width: penetrationOf(t).pct + '%' }"
                  ></view>
                </view>
              </view>
              <text v-else class="pen-note">{{ penNote(t) }}</text>
            </view>

            <view class="col txn-right">
              <text class="t-num-data tnum" :class="amountClass(t)">{{ txnAmount(t) }}</text>
              <text class="txn-acct ellipsis">{{ t.account ? t.account.name : '' }}</text>
            </view>
          </view>
        </view>

        <!-- 分页：移动端用「加载更多」，与浏览器版的页码按钮取到的是同一批数据 -->
        <view class="foot">
          <text class="foot-text">已显示 {{ items.length }} / 共 {{ total }} 笔</text>
          <view v-if="items.length < total" class="mz-btn mz-btn-primary foot-btn" @tap="loadMore">
            <mz-icon name="expand_more" :size="18" />
            <text>加载更多</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ===== 删除后的 5 秒撤销条 ===== -->
    <view class="undo" :class="{ show: undo.show }">
      <view class="undo-inner">
        <mz-icon name="check_circle" :size="20" color="#5EEAD4" />
        <text class="undo-msg ellipsis">{{ undo.message }}</text>
        <view class="undo-sep"></view>
        <view class="undo-btn" @tap="undoDelete">
          <text>撤销</text>
          <text class="undo-count tnum">({{ undo.seconds }}s)</text>
        </view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 收支流水（浏览器版 13-ledger-list.html）。
 *
 * 【为什么筛选一定要走后端】浏览器版注释里已经写明：客户端筛选只在「全部数据都在
 * 当前页」时成立，一旦分页就会显示「共 3 笔」而库里其实有 30 笔。所以每个筛选条件
 * 都直接映射成一个查询参数，本地只算「分组头的当日小计」。
 *
 * 【相对浏览器版的改动，都是移动端形态所迫，不是功能取舍】
 *   1. 12 栏宽表 → 卡片行。760px 的表格在手机上只能横向滚动，读起来是灾难；
 *      改为「图标 + 标题/副标题 + 金额」的纵向行，渗透进度条挪到行内第三层。
 *   2. 页码按钮 + 每页条数 → 「加载更多」。手机上没有指针悬停，逐页翻的收益
 *      远低于一直往下滚；两者取到的是同一批数据，只是切片顺序不同。
 *   3. hover 才出现的编辑/删除 → 长按行弹出操作菜单。触屏没有悬停态。
 *   4. 「导出表格」按钮删掉（本次需求明确不要 CSV 导出）。
 *   5. 5 秒撤销条保留原样 —— 它是「软删 + restore」这套语义的唯一入口，
 *      改成 toast 就没地方放倒计时和撤销按钮了。
 * 其余数据来源、请求参数、删除/撤销语义与浏览器版逐条对应。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { EDIT_TRANSACTION_KEY } from '@/common/config'
import { toast } from '@/common/ui'
import { meta, indexBy, currentPeriod } from '@/common/store'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const EMPTY = []

const RANGES = [
  { value: 'month', label: '本月' },
  { value: 'last', label: '上月' },
  { value: 'quarter', label: '近3月' },
  { value: 'custom', label: '全部' },
]
const TYPES = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]
const TYPE_LABEL = { all: '全部', expense: '仅支出', income: '仅收入', transfer: '转账' }
const RANGE_LABEL = { month: '本月', last: '上月', quarter: '近 3 个月', custom: '全部时间' }

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}
/** '2026-09-24' → '9月24日' */
function monthLabel(dateOnly) {
  const p = String(dateOnly).split('-')
  return Number(p[1]) + '月' + Number(p[2]) + '日'
}
function weekdayLabel(dateOnly) {
  const p = String(dateOnly).split('-')
  return WEEK[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()]
}
function lastDayOf(periodValue) {
  const p = String(periodValue).split('-')
  const y = Number(p[0])
  const m = Number(p[1])
  return y + '-' + pad2(m) + '-' + pad2(new Date(y, m, 0).getDate())
}
/** 分类颜色来自数据库，进不了 style 的字符一律剔掉，避免拼出坏 CSS */
function cssColor(c) {
  const s = String(c == null ? '' : c).replace(/[^#0-9A-Fa-f]/g, '')
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : ''
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      RANGES,
      TYPES,
      period: currentPeriod(),
      range: 'month',
      type: 'all',
      categoryId: null,
      accountId: null,
      keyword: '',
      minAmount: null,
      maxAmount: null,
      page: 1,
      pageSize: 50,

      keywordInput: '',
      minInput: '',
      maxInput: '',
      showFilter: false,

      items: [],
      total: 0,
      totalPages: 1,

      ctx: null,
      budgetByCat: {},
      summary: null,
      alert: { yellowPct: 80, redPct: 100 },

      firstLoading: true,
      loadError: '',
      removingId: null,

      lastDeleted: null,
      undo: { show: false, message: '', seconds: 5 },
    }
  },
  computed: {
    categories() { return (this.ctx && this.ctx.categories) || EMPTY },
    accounts() { return (this.ctx && this.ctx.accounts) || EMPTY },
    categoryNames() {
      return ['全部分类'].concat(this.categories.map(function (c) { return c.name }))
    },
    accountNames() {
      return ['全部账户'].concat(this.accounts.map(function (a) { return a.name }))
    },
    catIndex() {
      if (!this.categoryId) return 0
      const i = this.categories.map(function (c) { return c.id }).indexOf(this.categoryId)
      return i < 0 ? 0 : i + 1
    },
    acctIndex() {
      if (!this.accountId) return 0
      const i = this.accounts.map(function (a) { return a.id }).indexOf(this.accountId)
      return i < 0 ? 0 : i + 1
    },
    categoryLabel() {
      if (!this.categoryId) return '全部分类'
      const hit = this.categories.filter((c) => c.id === this.categoryId)[0]
      return hit ? hit.name : '全部分类'
    },
    accountLabel() {
      if (!this.accountId) return '全部账户'
      const hit = this.accounts.filter((a) => a.id === this.accountId)[0]
      return hit ? hit.name : '全部账户'
    },
    hasFilter() {
      return this.range !== 'month' || this.type !== 'all' || !!this.categoryId ||
        !!this.accountId || !!this.keywordText ||
        this.minAmount !== null || this.maxAmount !== null
    },
    activeFilterCount() {
      let n = 0
      if (this.range !== 'month') n += 1
      if (this.type !== 'all') n += 1
      if (this.categoryId) n += 1
      if (this.accountId) n += 1
      if (this.keywordText) n += 1
      if (this.minAmount !== null || this.maxAmount !== null) n += 1
      return n
    },
    keywordText() { return String(this.keyword || '').trim() },
    netText() {
      if (!this.summary) return '—'
      const n = Number(this.summary.net)
      if (!isFinite(n)) return '—'
      return (n < 0 ? '-' : '+') + fmt.money(Math.abs(n))
    },
    netClass() {
      if (!this.summary) return 'c-tertiary'
      return Number(this.summary.net) < 0 ? 'c-danger' : 'c-primary'
    },
    chips() {
      const out = []
      out.push({ key: 'range', label: RANGE_LABEL[this.range] || '本月' })
      if (this.type !== 'all') out.push({ key: 'type', label: TYPE_LABEL[this.type] })
      if (this.categoryId) out.push({ key: 'cat', label: '分类：' + this.categoryLabel })
      if (this.accountId) out.push({ key: 'acct', label: '账户：' + this.accountLabel })
      if (this.minAmount !== null || this.maxAmount !== null) {
        out.push({
          key: 'amount',
          label: '金额 ' + (this.minAmount === null ? '' : this.minAmount) +
            '–' + (this.maxAmount === null ? '' : this.maxAmount),
        })
      }
      if (this.keywordText) out.push({ key: 'q', label: '“' + this.keywordText + '”' })
      return out
    },
    /** 按日期分组，并就地算出分组头的当日小计（分累加，避免浮点尾巴） */
    groups() {
      const order = []
      const byDay = {}
      this.items.forEach(function (t) {
        const d = String(t.happenedAt).slice(0, 10)
        if (!byDay[d]) {
          byDay[d] = []
          order.push(d)
        }
        byDay[d].push(t)
      })
      return order.map(function (d) {
        const list = byDay[d]
        const cents = { expense: 0, income: 0, transfer: 0 }
        list.forEach(function (t) { cents[t.type] += Math.round(Number(t.amount) * 100) })
        const rel = fmt.relDay(d + ' 00:00:00')
        return {
          day: d,
          label: rel === '今天' || rel === '昨天' ? rel + ' · ' + monthLabel(d) : monthLabel(d),
          weekday: weekdayLabel(d),
          items: list,
          expense: cents.expense / 100,
          income: cents.income / 100,
          transfer: cents.transfer / 100,
        }
      })
    },
  },
  onLoad(query) {
    // 顶栏搜索带 ?q= 进来时预置关键词（浏览器版读的是 location.search）
    if (query && query.q) {
      this.keyword = String(query.q).trim()
      this.keywordInput = String(query.q)
    }
    this.bootstrap()
  },
  onUnload() {
    if (this._kwTimer) clearTimeout(this._kwTimer)
    if (this._amtTimer) clearTimeout(this._amtTimer)
    this._kwTimer = null
    this._amtTimer = null
    this.clearUndoTimers()
  },
  methods: {
    /* ---------------- 启动 ---------------- */
    bootstrap() {
      const self = this
      return meta().then(function (ctx) {
        self.ctx = ctx
        self.paintDerived()
        return self.load(true)
      }).catch(function () {
        self.firstLoading = false
      })
    },

    /** 汇总 + 分类预算 + 预警阈值：三件都不阻塞列表，失败就静默留在旧值 */
    paintDerived() {
      this.reloadSummary()
      this.reloadBudget()
      api.get('/budget', { period: this.period }, { silent: true }).then((b) => {
        if (b && b.hasBudget) {
          if (b.alertYellowPct) this.alert.yellowPct = b.alertYellowPct
          if (b.alertRedPct) this.alert.redPct = b.alertRedPct
        }
      }).catch(function () {})
    },

    reloadSummary() {
      return api.get('/transactions/summary', { period: this.period }, { silent: true })
        .then((s) => { this.summary = s })
        .catch(function () {})
    },

    reloadBudget() {
      return api.get('/budget/categories', { period: this.period }, { silent: true })
        .then((d) => {
          const map = {}
          ;((d && d.items) || []).forEach(function (b) { map[b.categoryId] = b })
          this.budgetByCat = map
        })
        .catch(function () {})
    },

    /* ---------------- 查询 ---------------- */
    /** 时间范围 → period 或 from/to。自定义区间在原型里就没有日期选择器，等同不限时间。 */
    rangeParams() {
      if (this.range === 'month') return { period: this.period }
      if (this.range === 'last') return { period: fmt.prevPeriod(this.period) }
      if (this.range === 'quarter') {
        return {
          from: fmt.prevPeriod(fmt.prevPeriod(this.period)) + '-01',
          to: lastDayOf(this.period),
        }
      }
      return {}
    },

    listQuery() {
      const q = this.rangeParams()
      q.page = this.page
      q.pageSize = this.pageSize
      if (this.type !== 'all') q.type = this.type
      if (this.categoryId) q.categoryId = this.categoryId
      if (this.accountId) q.accountId = this.accountId
      if (this.keywordText) q.keyword = this.keywordText
      if (this.minAmount !== null) q.minAmount = this.minAmount
      if (this.maxAmount !== null) q.maxAmount = this.maxAmount
      return q
    },

    /** reset=true 时从第 1 页重来；否则追加下一页 */
    load(reset) {
      const self = this
      if (reset) {
        this.page = 1
        this.loadError = ''
        if (!this.items.length) this.firstLoading = true
      }
      return api.get('/transactions', this.listQuery(), { raw: true }).then(function (page) {
        const rows = (page && page.data) || []
        self.items = reset ? rows : self.items.concat(rows)
        self.total = (page && page.meta && page.meta.total) || 0
        self.totalPages = (page && page.meta && page.meta.totalPages) || 1
        self.firstLoading = false
      }).catch(function (err) {
        self.firstLoading = false
        if (!self.items.length) self.loadError = (err && err.message) || '数据加载失败'
      })
    },

    loadMore() {
      if (this.items.length >= this.total) return
      this.page += 1
      return this.load(false)
    },

    /** 任何筛选条件变动都回到第 1 页，否则会停在一个不存在的页码上 */
    refilter() {
      this.page = 1
      this.showFilter = false
      return this.load(true)
    },

    /* ---------------- 筛选交互 ---------------- */
    setRange(v) { if (this.range !== v) { this.range = v; this.refilter() } },
    setType(v) { if (this.type !== v) { this.type = v; this.refilter() } },

    onCatPick(e) {
      const i = Number(e.detail.value)
      this.categoryId = i === 0 ? null : this.categories[i - 1].id
      this.refilter()
    },
    onAcctPick(e) {
      const i = Number(e.detail.value)
      this.accountId = i === 0 ? null : this.accounts[i - 1].id
      this.refilter()
    },

    // 关键字与金额都是「打完一个字/一个数字」就查，防抖避免每敲一下就发一次请求
    onKeyword() {
      if (this._kwTimer) clearTimeout(this._kwTimer)
      this._kwTimer = setTimeout(() => {
        const next = String(this.keywordInput || '').trim()
        if (next === this.keywordText) return
        this.keyword = next
        this.refilter()
      }, 320)
    },
    applyKeyword() {
      if (this._kwTimer) clearTimeout(this._kwTimer)
      this.keyword = String(this.keywordInput || '').trim()
      this.refilter()
    },
    clearKeyword() {
      this.keywordInput = ''
      this.keyword = ''
      this.refilter()
    },
    onAmount() {
      if (this._amtTimer) clearTimeout(this._amtTimer)
      this._amtTimer = setTimeout(() => {
        this.minAmount = this.readAmount(this.minInput)
        this.maxAmount = this.readAmount(this.maxInput)
        this.refilter()
      }, 360)
    },
    readAmount(raw) {
      const s = raw == null ? '' : String(raw).trim()
      return s === '' ? null : s
    },

    clearFilter(key) {
      if (key === 'range') this.range = 'month'
      if (key === 'type') this.type = 'all'
      if (key === 'cat') this.categoryId = null
      if (key === 'acct') this.accountId = null
      if (key === 'amount') {
        this.minAmount = this.maxAmount = null
        this.minInput = ''
        this.maxInput = ''
      }
      if (key === 'q') {
        this.keyword = ''
        this.keywordInput = ''
      }
      this.refilter()
    },

    resetFilters() {
      this.range = 'month'
      this.type = 'all'
      this.categoryId = null
      this.accountId = null
      this.keyword = ''
      this.keywordInput = ''
      this.minAmount = this.maxAmount = null
      this.minInput = ''
      this.maxInput = ''
      this.refilter()
    },

    /* ---------------- 行渲染 ---------------- */
    catIcon(t) {
      if (t.type === 'transfer') return 'swap_horiz'
      if (t.category && t.category.icon) return t.category.icon
      return 'label'
    },
    catColor(t) {
      const hex = cssColor(t.category && t.category.color)
      return hex ? { color: hex } : {}
    },
    txnTitle(t) {
      if (t.merchant) return t.merchant
      if (t.type === 'transfer') {
        return (t.account ? t.account.name : '') + ' → ' + (t.toAccount ? t.toAccount.name : '')
      }
      return (t.category && t.category.name) || '未分类'
    },
    txnSub(t) {
      const parts = []
      parts.push(fmt.time(t.happenedAt))
      if (t.merchant && t.category) parts.push(t.category.name)
      else if (t.type === 'transfer') parts.push('账户流转')
      else parts.push(t.type === 'income' ? '收入' : '支出')
      if (t.note) parts.push(t.note)
      return parts.join(' · ')
    },
    amountClass(t) {
      if (t.type === 'transfer') return 'c-tertiary'
      // PRD：支出不标红（红只留给「超支」这类真正的异常）
      return t.type === 'income' ? 'c-primary' : 'c-ink'
    },
    txnAmount(t) {
      if (t.type === 'transfer') return fmt.money(t.amount)
      return fmt.signedMoney(t.type, t.amount)
    },

    /** 预算渗透列：只有「支出 + 该分类设了预算」才返回进度数据，其余返回 null */
    penetrationOf(t) {
      if (t.type !== 'expense') return null
      const b = t.category ? this.budgetByCat[t.category.id] : null
      if (!b) return null
      const used = fmt.clampPercent(b.usedPct)
      const level = used > this.alert.redPct ? 'red' : used > this.alert.yellowPct ? 'yellow' : 'normal'
      return {
        label: b.categoryName + '剩余',
        remainText: fmt.percent(Math.max(0, 100 - used)),
        pct: used,
        tone: {
          fill: level === 'red' ? 'fill-over' : level === 'yellow' ? 'fill-warning' : 'fill-ok',
          text: level === 'red' ? 'c-danger' : level === 'yellow' ? 'c-warn' : 'c-primary',
        },
      }
    },

    /** 没有预算可渗透时的说明文字（浏览器版是同样两句话的灰色小标签） */
    penNote(t) {
      return t.type === 'expense' ? '未设预算' : '不计入预算'
    },

    /* ---------------- 长按操作 ---------------- */
    onRowLongPress(t) {
      const self = this
      const label = this.txnTitle(t)
      uni.showActionSheet({
        itemList: ['编辑', '删除'],
        success(res) {
          if (res.tapIndex === 0) {
            try {
              // 记账页是 tabBar 页面，不能用 navigateTo 带 query；用一次性键传 ID，
              // 记账页消费后立刻删除，避免下次进入时重复打开编辑态。
              uni.setStorageSync(EDIT_TRANSACTION_KEY, t.id)
              uni.switchTab({
                url: '/pages/record/sheet',
                fail() {
                  try { uni.removeStorageSync(EDIT_TRANSACTION_KEY) } catch (e) { /* 忽略 */ }
                  toast('无法打开编辑页，请稍后重试', 'error')
                },
              })
            } catch (err) {
              toast('无法打开编辑页，请稍后重试', 'error')
            }
          } else if (res.tapIndex === 1) {
            self.removeRecord(t.id, label)
          }
        },
        fail() { /* 用户取消，无事发生 */ },
      })
    },

    /* ---------------- 删除 / 撤销 ---------------- */
    removeRecord(id, name) {
      const self = this
      const index = this.items.findIndex(function (x) { return x.id === id })
      if (index < 0) return
      const item = this.items[index]
      this.removingId = id

      api.del('/transactions/' + id).then(function () {
        self.items.splice(index, 1)
        self.total = Math.max(0, self.total - 1)
        self.totalPages = Math.max(1, Math.ceil(self.total / self.pageSize))
        self.removingId = null
        self.lastDeleted = { id: id, index: index, item: item, name: name }

        // 删空当前页且后面还有人，回退一页重载
        if (!self.items.length && self.page > 1) {
          self.page -= 1
          self.load(false)
        }
        self.showUndo('已删除「' + name + '」记录')
        // 汇总与分类预算都跟着变了，静默重取
        self.reloadSummary()
        self.reloadBudget()
      }).catch(function () {
        self.removingId = null
      })
    },

    undoDelete() {
      if (!this.lastDeleted) return
      const self = this
      const d = this.lastDeleted
      api.post('/transactions/' + d.id + '/restore').then(function () {
        const at = Math.min(d.index, self.items.length)
        self.items.splice(at, 0, d.item)
        self.total += 1
        self.totalPages = Math.max(1, Math.ceil(self.total / self.pageSize))
        self.lastDeleted = null
        self.hideUndo()
        self.reloadSummary()
        self.reloadBudget()
        toast('已撤销删除', 'success')
      }).catch(function () {})
    },

    showUndo(message) {
      this.clearUndoTimers()
      this.undo.show = true
      this.undo.message = message
      this.undo.seconds = 5
      const self = this
      // 5 秒后这条记录就真的留在回收站里了，撤销入口一并收掉
      this._undoTick = setInterval(function () {
        self.undo.seconds -= 1
        if (self.undo.seconds <= 0) clearInterval(self._undoTick)
      }, 1000)
      this._undoTimer = setTimeout(function () {
        self.hideUndo()
        self.lastDeleted = null
      }, 5000)
    },
    hideUndo() {
      this.clearUndoTimers()
      this.undo.show = false
      this.undo.seconds = 5
    },
    clearUndoTimers() {
      if (this._undoTick) { clearInterval(this._undoTick); this._undoTick = null }
      if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null }
    },

    /* ---------------- 跳转 ---------------- */
    goImport() { uni.navigateTo({ url: '/pages/import/main' }) },
    goRecord() { uni.switchTab({ url: '/pages/record/sheet' }) },
  },
}
</script>

<style lang="scss" scoped>
.ledger {
  padding: 0 24rpx 24rpx;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 9999rpx;
  &:active { background-color: rgb(var(--mz-surface-container-low)); }
}

/* ===== 月度汇总 ===== */
.summary {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  padding: 24rpx 0;
}
.sum-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.sum-div {
  width: 2rpx;
  background-color: var(--border);
  margin: 8rpx 0;
}
.sum-label { font-size: 22rpx; color: var(--text-tertiary); }
.sum-value { font-size: 30rpx; font-weight: 700; }

/* ===== 搜索 / 筛选 ===== */
.search-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
}
.search-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.search-input {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: var(--text-primary);
}
.ph { color: var(--text-tertiary); }
.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
}
.filter-toggle {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  &.on { background-color: rgb(var(--mz-primary-fixed)); }
}
.filter-toggle-text { font-size: 26rpx; color: var(--text-primary); }
.filter-badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 9999rpx;
  background-color: var(--brand-700);
  color: #FFFFFF;
  font-size: 20rpx;
  text-align: center;
  line-height: 32rpx;
}

/* ===== 筛选面板 ===== */
.filter-panel {
  margin-top: 16rpx;
  padding: 8rpx 24rpx 20rpx;
  border-radius: 28rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.filter-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 0;
  & + .filter-row { border-top: 2rpx solid var(--border); }
}
.filter-label {
  width: 72rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--text-tertiary);
}
.seg {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  padding: 6rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 10rpx 0;
  border-radius: 14rpx;
  font-size: 24rpx;
  color: var(--text-secondary);
  &.on {
    background-color: rgb(var(--mz-surface-container-lowest));
    color: var(--brand-700);
    font-weight: 600;
  }
}
.pick-wrap { flex: 1; min-width: 0; }
.pick {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.pick-text { font-size: 26rpx; color: var(--text-primary); }
.amount-range {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}
.amount-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 18rpx;
  font-size: 26rpx;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
}
.amount-dash { color: var(--text-tertiary); font-size: 24rpx; }

/* ===== 生效条件芯片 ===== */
.chips {
  margin-top: 16rpx;
  white-space: nowrap;
}
.chips-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}
.chips-item { flex-shrink: 0; }
.chips-reset {
  flex-shrink: 0;
  padding: 0 12rpx;
  font-size: 24rpx;
  color: var(--brand-700);
}

/* ===== 列表 ===== */
.card {
  margin-top: 16rpx;
  border-radius: 28rpx;
  overflow: hidden;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.day-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.day-bits {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6rpx;
  font-size: 22rpx;
  color: var(--text-tertiary);
}
.day-bit { font-size: 22rpx; color: var(--text-tertiary); }

.txn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  transition: opacity 240ms ease-out, transform 240ms ease-out;
  &:active { background-color: rgb(var(--mz-surface-container-low)); }
  &.removing { opacity: 0; transform: translateX(40rpx); }
}
.txn-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  flex-shrink: 0;
  border-radius: 22rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.txn-title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.txn-sub { font-size: 22rpx; color: var(--text-tertiary); margin-top: 2rpx; }
.tag-import {
  flex-shrink: 0;
  padding: 0 10rpx;
  border-radius: 8rpx;
  font-size: 18rpx;
  line-height: 28rpx;
  color: var(--accent-700);
  background-color: rgb(var(--mz-secondary-container));
}
.pen { margin-top: 10rpx; }
.pen-top { margin-bottom: 6rpx; }
.pen-note {
  display: inline-block;
  margin-top: 8rpx;
  padding: 2rpx 12rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  color: var(--text-tertiary);
  background-color: rgb(var(--mz-surface-container-high));
}
.txn-right {
  align-items: flex-end;
  flex-shrink: 0;
  max-width: 200rpx;
}
.txn-acct {
  max-width: 200rpx;
  font-size: 20rpx;
  color: var(--text-tertiary);
  margin-top: 2rpx;
}

/* ===== 分页 ===== */
.foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx;
  border-top: 2rpx solid var(--border);
}
.foot-text { font-size: 22rpx; color: var(--text-tertiary); }
.foot-btn { height: 68rpx; padding: 0 28rpx; font-size: 26rpx; }

/* ===== 骨架 ===== */
.skel-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
}
.skel-tile {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.skel-line {
  height: 20rpx;
  border-radius: 9999rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.w60 { width: 60%; }
.w40 { width: 40%; }
.w20 { width: 100rpx; }

/* ===== 状态页 ===== */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 96rpx 32rpx;
  text-align: center;
}
.state-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104rpx;
  height: 104rpx;
  border-radius: 9999rpx;
  margin-bottom: 8rpx;
  background-color: rgb(var(--mz-surface-container-low));
}

/* ===== 撤销条 ===== */
.undo {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(#{$tabbar-h} + 24rpx);
  z-index: 90;
  opacity: 0;
  transform: translateY(48rpx);
  pointer-events: none;
  transition: opacity 260ms ease-out, transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
  &.show {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}
.undo-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 28rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-inverse-surface));
  box-shadow: var(--shadow-tier3);
}
.undo-msg {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: rgb(var(--mz-inverse-on-surface));
}
.undo-sep {
  width: 2rpx;
  height: 32rpx;
  background-color: rgb(var(--mz-outline));
}
.undo-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: rgb(var(--mz-primary-fixed));
}
.undo-count { font-size: 22rpx; }
</style>
