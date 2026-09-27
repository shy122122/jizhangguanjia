<template>
  <mz-page :navbar="false" tabbar>
    <view class="record">
      <!-- ===== 顶部：类型切换 / 连续记账 / 退出 ===== -->
      <view class="head">
        <view class="types">
          <view
            v-for="t in TYPES"
            :key="t.key"
            class="type-btn"
            :class="{ on: currentType === t.key }"
            @tap="setType(t.key)"
          >{{ t.label }}</view>
        </view>
        <view class="head-right">
          <view v-if="!editingId" class="cont" @tap="toggleContinuous">
            <text class="cont-label">连续记账</text>
            <view class="switch" :class="{ on: continuous }">
              <view class="knob" :class="{ on: continuous }"></view>
            </view>
          </view>
          <view class="exit-btn" @tap="exitSheet"><mz-icon name="close" :size="18" /></view>
        </view>
      </view>

      <!-- ===== 连续记账进度横幅 ===== -->
      <view v-if="!editingId && queue.length" class="banner anim-fade">
        <view class="banner-left">
          <mz-icon name="check_circle" :size="20" filled color="var(--brand-700)" />
          <text class="banner-text">
            已连续记录 <text class="c-primary bold">{{ queue.length }}</text> 笔 · 刚刚记录
            <text class="c-secondary">{{ lastLabel }}</text>
          </text>
        </view>
        <text v-if="quotaAfter != null" class="banner-quota">今日可花 {{ fmt.money(quotaAfter) }}</text>
      </view>

      <!-- ===== 1. 金额与算式终端 ===== -->
      <view class="terminal">
        <view class="between">
          <text class="t-label-sm c-secondary">
            {{ editingId ? '编辑' + TYPE_TITLE[currentType] : '记录第 ' + (queue.length + 1) + ' 笔' + TYPE_TITLE[currentType] }}
          </text>
          <text class="calc-hint"><mz-icon name="calculate" :size="14" /> 实时运算生效中</text>
        </view>
        <view class="expr-row">
          <text class="t-num-hero c-secondary">¥</text>
          <text class="expr t-display">{{ expr ? pretty(expr) : '0' }}</text>
          <view class="caret"></view>
          <view class="res">
            <text class="t-label-sm c-secondary">计算结果</text>
            <text class="t-h3" :class="amountError ? 'c-danger' : 'c-primary'">= {{ fmt.amount(amountShown) }}</text>
          </view>
        </view>

        <!-- 预算穿透条：基线已用 + 本笔预计占用（PRD 核心卖点） -->
        <view v-if="budgetLive" class="pen">
          <view class="between pen-head">
            <text class="pen-text">
              <mz-icon name="warning" :size="14" color="var(--warning-ink)" />
              {{ penetrationText }}
            </text>
            <text class="pen-pct" :class="penTone">{{ fmt.percent(afterPct) }}{{ penSuffix }}</text>
          </view>
          <view class="track">
            <view class="fill-base" :style="{ width: basePct.toFixed(2) + '%' }"></view>
            <view class="fill-delta" :style="{ width: deltaPct.toFixed(2) + '%' }"></view>
            <view class="mark" :style="{ left: fmt.clampPercent(yellowPct) + '%' }"></view>
          </view>
        </view>
      </view>

      <!-- ===== 2. 类目矩阵 ===== -->
      <view v-if="catLive" class="cat-block">
        <view class="between">
          <text class="t-label c-secondary">{{ currentType === 'expense' ? '选择消费类目' : '选择收入类目' }}</text>
          <view class="manage" @tap="goCategories">
            <text>管理类目</text><mz-icon name="chevron_right" :size="14" />
          </view>
        </view>
        <view class="grid grid-4 cat-grid">
          <view
            v-for="c in cats"
            :key="c.id"
            class="cat-item"
            :class="{ on: c.id === selectedCatId }"
            @tap="selectCategory(c.id, true)"
          >
            <mz-icon :name="c.icon || 'label'" :size="24" />
            <text class="cat-name ellipsis" :class="{ bold: c.id === selectedCatId }">{{ c.name }}</text>
          </view>
        </view>
      </view>

      <!-- ===== 3. 账户 / 时间 / 备注 ===== -->
      <view class="meta">
        <view class="grid grid-2 gap-1">
          <picker
            mode="selector"
            :range="accountOptions"
            range-key="label"
            :value="acctIndex"
            @change="onAcctChange"
          >
            <view class="meta-cell">
              <mz-icon :name="account ? account.icon || 'payments' : 'payments'" :size="18" color="var(--brand-700)" />
              <view class="col flex-1">
                <text class="t-label-sm c-secondary">{{ acctLabel }}</text>
                <text class="t-label ellipsis">{{ account ? account.name : '—' }}</text>
              </view>
              <mz-icon name="expand_more" :size="16" color="var(--text-secondary)" />
            </view>
          </picker>

          <view class="meta-cell">
            <mz-icon name="schedule" :size="18" color="var(--accent-700)" />
            <view class="col flex-1">
              <text class="t-label-sm c-secondary">发生时间</text>
              <view class="time-row">
                <picker mode="date" :value="dateStr" @change="onDateChange">
                  <text class="t-label">{{ fmt.date(dateStr) }}</text>
                </picker>
                <picker mode="time" :value="timeStr" @change="onTimeChange">
                  <text class="t-label">{{ timeStr }}</text>
                </picker>
              </view>
            </view>
            <mz-icon name="expand_more" :size="16" color="var(--text-secondary)" />
          </view>
        </view>

        <!-- 转入账户：仅转账需要，候选里排除转出账户自身（ck_txn_transfer 不允许两边相同） -->
        <picker
          v-if="canTransfer"
          mode="selector"
          :range="toAccountOptions"
          range-key="label"
          :value="toAcctIndex"
          @change="onToAcctChange"
        >
          <view class="meta-cell wide">
            <mz-icon name="swap_horiz" :size="18" color="var(--brand-700)" />
            <view class="col flex-1">
              <text class="t-label-sm c-secondary">转入账户</text>
              <text class="t-label ellipsis">{{ toAccount ? toAccount.name : '—' }}</text>
            </view>
            <mz-icon name="expand_more" :size="16" color="var(--text-secondary)" />
          </view>
        </picker>

        <view class="note-row">
          <mz-icon name="edit_note" :size="18" color="var(--text-secondary)" />
          <input
            v-model="note"
            class="note-input"
            type="text"
            placeholder="添加备注、商家或明细说明..."
            placeholder-class="ph"
          />
        </view>

        <!-- 快捷关键词：点一下选中它预判的类目，并填进备注 -->
        <scroll-view v-if="chips.length" scroll-x class="chips">
          <view class="chips-inner">
            <view
              v-for="r in chips"
              :key="r.keyword"
              class="chip"
              @tap="applyChip(r)"
            >{{ r.keyword }}</view>
          </view>
        </scroll-view>
      </view>

      <!-- ===== 4. 数字键盘 ===== -->
      <view class="grid grid-4 keypad">
        <view
          v-for="k in KEYPAD"
          :key="k.key"
          class="key"
          :class="{ op: k.op }"
          @tap="press(k.key)"
        >
          <mz-icon v-if="k.icon" :name="k.icon" :size="20" />
          <text v-else>{{ k.label }}</text>
        </view>
      </view>

      <!-- ===== 操作 ===== -->
      <view class="actions">
        <view class="save-btn" :class="{ off: !amountValid }" @tap="save">
          <mz-icon name="done_all" :size="20" color="#FFFFFF" />
          <text>{{ editingId ? '保存修改' : (continuous ? '保存并继续下一笔' : '保存') }}</text>
        </view>
        <view class="done-btn" @tap="exitSheet">{{ editingId ? '取消编辑' : '完成并退出' }}</view>
      </view>

      <!-- ===== 本次连续已记清单 ===== -->
      <view v-if="!editingId" class="queue">
        <view class="between">
          <view class="row items-center gap-1">
            <mz-icon name="queue_music" :size="16" color="var(--brand-700)" />
            <text class="t-label bold">本次连续已记清单</text>
            <text class="queue-count">{{ queue.length }} 笔</text>
          </view>
          <view class="row items-center gap-1">
            <text class="t-label-sm c-secondary">合计支出:</text>
            <text class="t-num-data tnum">{{ fmt.money(queueExpense) }}</text>
          </view>
        </view>
        <view class="queue-list">
          <view v-if="!queue.length" class="queue-empty">本次还没有记账</view>
          <view v-for="t in queue" :key="t.id" class="queue-card">
            <view class="row items-center gap-1 flex-1">
              <view class="q-tile">
                <mz-icon :name="qIcon(t)" :size="14" color="var(--brand-700)" />
              </view>
              <view class="col flex-1">
                <text class="t-label-sm bold ellipsis">{{ qTitle(t) }}</text>
                <text class="q-sub ellipsis">{{ qSub(t) }} · {{ fmt.time(t.happenedAt) }}</text>
              </view>
            </view>
            <view class="row items-center gap-2 shrink-0">
              <text class="t-num-data tnum" :class="t.type === 'income' ? 'c-primary' : 'c-ink'">
                {{ t.type === 'transfer' ? fmt.money(t.amount) : signed(t) }}
              </text>
              <view class="undo" @tap="undo(t.id)"><mz-icon name="undo" :size="16" /></view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 记账面板（PRD 4.2，全产品生命线）。
 *
 * 三条原则，与浏览器版一致：
 *   1. 预算数字一律来自接口，不在前端重算 —— 只有「这一笔会占到哪」是纯预览，
 *      按后端同一条百分比公式推，因为它还没入库。
 *   2. 不拿「本月总额」冒充「本类目额度」：选中类目没有分类预算就整块隐藏穿透条。
 *   3. 「本次已记清单」只列这次真的写进库的那几笔，撤回就是软删它，不是从数组里抹掉。
 *
 * 与浏览器版的两处平台差异：
 *   · 浏览器版是浮在看板上的抽屉（Esc / 点蒙层可关）；这里它是 TabBar 的第二格，
 *     是整页，退出统一走「完成并退出」→ 回首页。功能等价，交互更贴合原生。
 *   · 发生时间在浏览器是 <input type="datetime-local">，三端不通用，
 *     改成 uni 的 date + time 两个原生 picker 并排，取值拼回同一种字符串。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { toast, confirm } from '@/common/ui'
import { meta } from '@/common/store'
import { EDIT_TRANSACTION_KEY } from '@/common/config'

const TYPE_TITLE = { expense: '金额', income: '收入', transfer: '转账' }
const TYPE_LABEL = { expense: '支出', income: '收入', transfer: '转账' }
const TYPES = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'transfer', label: '内部转账' },
]
const KEYPAD = [
  { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' }, { key: '/', label: '÷', op: true },
  { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' }, { key: '*', label: '×', op: true },
  { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }, { key: '-', label: '-', op: true },
  { key: '0', label: '0' }, { key: '.', label: '.' }, { key: 'back', icon: 'backspace' }, { key: '+', label: '+', op: true },
]

/* 常量空数组：computed 里写 `|| []` 每次求值都是新引用，会让 watch 反复触发 */
const EMPTY = []

function pad2(n) { return n < 10 ? '0' + n : String(n) }
function localNow() {
  const d = new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

/* 表达式求值：先切词，再两遍扫描（先乘除后加减），不碰 eval。
 * 末尾悬空的运算符先丢弃，于是「35+」也能给出 35 的实时结果。 */
function evaluate(src) {
  const m = String(src).match(/(\d+\.?\d*|\.\d+|[+\-*/])/g)
  if (!m) return null
  while (m.length && /^[+\-*/]$/.test(m[m.length - 1])) m.pop()
  if (!m.length) return null
  for (let i = 0; i < m.length; i += 1) {
    const isOp = /^[+\-*/]$/.test(m[i])
    if ((i % 2 === 0) === isOp) return null
  }
  if (m.length === 1) return parseFloat(m[0])

  const flat = [m[0]]
  for (let j = 1; j < m.length; j += 2) {
    const op = m[j]
    const v = parseFloat(m[j + 1])
    if (op === '*') flat[flat.length - 1] = parseFloat(flat[flat.length - 1]) * v
    else if (op === '/') flat[flat.length - 1] = parseFloat(flat[flat.length - 1]) / v
    else { flat.push(op); flat.push(v) }
  }
  let total = parseFloat(flat[0])
  for (let k = 1; k < flat.length; k += 2) {
    total = flat[k] === '+' ? total + parseFloat(flat[k + 1]) : total - parseFloat(flat[k + 1])
  }
  return isFinite(total) ? total : null
}

function pretty(s) { return String(s).replace(/\*/g, '×').replace(/\//g, '÷') }

export default {
  components: { mzIcon, mzPage },
  data() {
    const now = localNow()
    return {
      fmt,
      TYPES,
      KEYPAD,
      TYPE_TITLE,
      ctx: null,
      currentType: 'expense',
      selectedCatId: null,
      catTouched: false,
      accountId: null,
      toAccountId: null,
      continuous: true,
      expr: '',
      note: '',
      dateStr: now.slice(0, 10),
      timeStr: now.slice(11, 16),
      catBudget: [],
      yellowPct: 80,
      queue: [],
      lastPen: null,
      saving: false,
      editingId: null,
    }
  },
  computed: {
    accounts() { return (this.ctx && this.ctx.accounts) || EMPTY },
    categories() { return (this.ctx && this.ctx.categories) || EMPTY },
    rules() { return (this.ctx && this.ctx.categoryRules) || EMPTY },
    cats() { return this.categories.filter(function (c) { return c.type === this.currentType }, this) },
    catLive() { return this.currentType !== 'transfer' && this.cats.length > 0 },
    account() {
      const id = this.accountId
      return this.accounts.find(function (a) { return a.id === id }) || null
    },
    accountOptions() {
      const self = this
      return this.accounts.map(function (a) { return { id: a.id, label: self.accountLabel(a) } })
    },
    acctIndex() {
      const i = this.accountOptions.findIndex((o) => o.id === this.accountId)
      return i < 0 ? 0 : i
    },
    acctLabel() {
      if (this.currentType === 'income') return '收款账户'
      if (this.currentType === 'transfer') return '转出账户'
      return '支出账户'
    },
    toCandidates() {
      const id = this.accountId
      return this.accounts.filter(function (a) { return a.id !== id })
    },
    canTransfer() { return this.currentType === 'transfer' && this.toCandidates.length > 0 },
    toAccountOptions() {
      const self = this
      return this.toCandidates.map(function (a) { return { id: a.id, label: self.accountLabel(a) } })
    },
    toAcctIndex() {
      const i = this.toAccountOptions.findIndex((o) => o.id === this.toAccountId)
      return i < 0 ? 0 : i
    },
    toAccount() {
      const id = this.toAccountId
      return this.accounts.find(function (a) { return a.id === id }) || null
    },
    chips() {
      const type = this.currentType
      return this.rules
        .filter(function (r) { return r.categoryType === type })
        .sort(function (a, b) { return b.priority - a.priority || a.id - b.id })
        .slice(0, 8)
    },
    amountValue() { return evaluate(this.expr) },
    amountValid() { return this.amountValue !== null && this.amountValue > 0 },
    amountShown() { return this.amountValue === null ? 0 : this.amountValue },
    /* 空表达式不算错，别让面板一打开就是一片红；负数和非法表达式才是 */
    amountError() { return !!this.expr && !this.amountValid },
    happenedAt() { return this.dateStr + 'T' + this.timeStr },
    period() { return this.dateStr.slice(0, 7) },
    budgetRow() {
      if (this.selectedCatId === null) return null
      const id = this.selectedCatId
      return this.catBudget.find(function (r) { return r.categoryId === id }) || null
    },
    // 编辑时服务端预算统计已经包含原流水；若直接叠加新金额会误导，因此不展示新增预览条。
    budgetLive() { return !this.editingId && this.currentType === 'expense' && !!this.budgetRow },
    basePct() {
      if (!this.budgetLive) return 0
      const r = this.budgetRow
      return fmt.clampPercent((r.spent / r.budgetAmount) * 100)
    },
    deltaPct() {
      if (!this.budgetLive) return 0
      const r = this.budgetRow
      return Math.max(0, Math.min((this.amountShown / r.budgetAmount) * 100, 100 - this.basePct))
    },
    afterPct() {
      if (!this.budgetLive) return 0
      const r = this.budgetRow
      return ((r.spent + this.amountShown) / r.budgetAmount) * 100
    },
    penTone() {
      if (this.afterPct >= 100) return 'c-danger'
      if (this.afterPct >= this.yellowPct) return 'c-warn'
      return 'c-secondary'
    },
    penSuffix() {
      if (this.afterPct >= 100) return '（已超支）'
      if (this.afterPct >= this.yellowPct) return '（临界警戒）'
      return ''
    },
    penetrationText() {
      const r = this.budgetRow
      if (!r) return ''
      const amt = this.amountShown
      if (amt > 0) {
        const remain = r.budgetAmount - r.spent - amt
        return '若记录此笔 ' + fmt.money(amt) + '，本月' + r.categoryName + '将' +
          (remain < 0 ? '超出 ' + fmt.money(-remain) : '仅剩 ' + fmt.money(remain))
      }
      return '本月' + r.categoryName + '已用 ' + fmt.money(r.spent) + '，剩余 ' + fmt.money(r.remaining)
    },
    lastLabel() {
      const t = this.queue[0]
      if (!t) return ''
      const name = t.note || (t.category ? t.category.name : TYPE_LABEL[t.type])
      return '「' + name + ' ' + fmt.money(t.amount) + '」'
    },
    quotaAfter() {
      const p = this.lastPen
      if (!p || !p.hasBudget) return null
      const v = p.todayQuotaAfter
      return v === null || v === undefined ? null : v
    },
    queueExpense() {
      let cents = 0
      this.queue.forEach(function (t) {
        if (t.type === 'expense') cents += Math.round(t.amount * 100)
      })
      return cents / 100
    },
  },
  watch: {
    cats(list) {
      const id = this.selectedCatId
      if (!list.some(function (c) { return c.id === id })) {
        this.selectedCatId = list.length ? list[0].id : null
      }
    },
    accounts() { this.ensureAccount() },
    toCandidates() { this.ensureToAccount() },
    note(value) {
      if (this.catTouched) return
      const hit = this.matchRule(value)
      if (hit && hit.categoryId !== this.selectedCatId) this.selectCategory(hit.categoryId, false)
    },
  },
  onLoad() {
    this._ready = this.load()
  },
  onShow() {
    this.consumeEditRequest()
  },
  methods: {
    signed(t) { return (t.type === 'income' ? '+' : '') + fmt.money(t.amount) },
    pretty,

    accountLabel(a) {
      // 信用卡的余额是净资产口径（负数），展示要换成「可用额度」
      if (a.type === 'credit') {
        return a.name + '（可用 ' + fmt.money(a.creditAvailable === null ? 0 : a.creditAvailable) + '）'
      }
      return a.name + '（余 ' + fmt.money(a.balance) + '）'
    },

    ensureAccount() {
      const list = this.accounts
      if (!list.length) return
      if (list.some((a) => a.id === this.accountId)) return
      const def = list.find(function (a) { return a.isDefault })
      this.accountId = (def || list[0]).id
    },
    ensureToAccount() {
      const list = this.toCandidates
      if (!list.length) { this.toAccountId = null; return }
      if (list.some((a) => a.id === this.toAccountId)) return
      this.toAccountId = list[0].id
    },

    matchRule(value) {
      const s = String(value || '').trim()
      if (!s) return null
      const type = this.currentType
      const hits = this.rules
        .filter(function (r) { return r.categoryType === type && s.indexOf(r.keyword) !== -1 })
        .sort(function (a, b) { return b.priority - a.priority || a.id - b.id })
      return hits[0] || null
    },

    press(key) {
      if (key === 'back') {
        this.expr = this.expr.slice(0, -1)
        return
      }
      if (key === '.') {
        const seg = this.expr.split(/[+\-*/]/).pop()
        if (seg.indexOf('.') >= 0) return
        this.expr += seg === '' ? '0.' : '.'
        return
      }
      if (/^[+\-*/]$/.test(key)) {
        if (!this.expr) return
        // 连按运算符视为改主意，替换掉上一个而不是叠加
        this.expr = /[+\-*/]$/.test(this.expr)
          ? this.expr.slice(0, -1) + key
          : this.expr + key
        return
      }
      const tail = this.expr.split(/[+\-*/]/).pop()
      if (tail.indexOf('.') < 0 && tail.length >= 7) return
      this.expr += key
    },

    setType(type) {
      if (type === this.currentType) return
      this.currentType = type
      // 换个类型就是换了一套类目，之前手动选中的那个已经不适用了
      this.catTouched = false
      this.selectedCatId = null
    },
    selectCategory(id, touched) {
      this.selectedCatId = id
      if (touched) this.catTouched = true
    },
    applyChip(r) {
      this.note = r.keyword
      this.selectCategory(r.categoryId, true)
    },
    toggleContinuous() { this.continuous = !this.continuous },
    onAcctChange(e) {
      const opt = this.accountOptions[Number(e.detail.value)]
      if (opt) this.accountId = opt.id
    },
    onToAcctChange(e) {
      const opt = this.toAccountOptions[Number(e.detail.value)]
      if (opt) this.toAccountId = opt.id
    },
    onDateChange(e) {
      this.dateStr = e.detail.value
      this.reloadBudget()
    },
    onTimeChange(e) { this.timeStr = e.detail.value },
    goCategories() { uni.navigateTo({ url: '/pages/settings/categories' }) },
    exitSheet() {
      uni.reLaunch({ url: this.editingId ? '/pages/ledger/list' : '/pages/home/index' })
    },

    consumeEditRequest() {
      let id = null
      try {
        id = uni.getStorageSync(EDIT_TRANSACTION_KEY)
        if (id !== '' && id !== null && id !== undefined) {
          uni.removeStorageSync(EDIT_TRANSACTION_KEY)
        }
      } catch (err) {
        id = null
      }
      if (!id) return

      const self = this
      Promise.resolve(this._ready || this.load())
        .then(function () { return api.get('/transactions/' + id, null, { silent: true }) })
        .then(function (transaction) { self.applyEdit(transaction) })
        .catch(function (err) {
          toast((err && err.message) || '流水加载失败，请稍后重试', 'error')
          uni.reLaunch({ url: '/pages/ledger/list' })
        })
    },

    applyEdit(transaction) {
      if (!transaction || !transaction.id) return
      const happened = String(transaction.happenedAt || '').replace(' ', 'T')
      this.editingId = transaction.id
      this.currentType = transaction.type
      this.expr = String(transaction.amount)
      this.accountId = transaction.account ? transaction.account.id : null
      this.toAccountId = transaction.toAccount ? transaction.toAccount.id : null
      this.selectedCatId = transaction.category ? transaction.category.id : null
      this.catTouched = true
      this.note = transaction.note || ''
      if (happened.length >= 16) {
        this.dateStr = happened.slice(0, 10)
        this.timeStr = happened.slice(11, 16)
      }
      this.continuous = false
      this.queue = []
      this.lastPen = null
      this.reloadBudget()
    },

    qIcon(t) {
      /* 兜底图标用 label（字体子集里有）—— 'sell' 不在子集里，会渲染成空白方块 */
      if (t.category) return t.category.icon || 'label'
      return t.type === 'transfer' ? 'swap_horiz' : 'label'
    },
    qTitle(t) {
      if (t.note) return t.note
      if (t.type === 'transfer') return '内部转账'
      return t.category ? t.category.name : TYPE_LABEL[t.type] + '未备注'
    },
    qSub(t) {
      const cat = t.category
      if (t.type === 'transfer') {
        return (t.account ? t.account.name : '?') + ' → ' + (t.toAccount ? t.toAccount.name : '?')
      }
      return (cat ? cat.name : '未分类') + ' · ' + (t.account ? t.account.name : '')
    },

    save() {
      if (!this.ctx || this.saving) return
      const value = this.amountValue
      if (!(value > 0)) return
      if (!this.accountId) { toast('请先选择一个账户', 'error'); return }

      const body = {
        type: this.currentType,
        amount: Number(value.toFixed(2)),
        accountId: this.accountId,
        happenedAt: this.happenedAt,
      }
      if (this.note.trim()) body.note = this.note.trim()

      if (this.currentType === 'transfer') {
        if (!this.toAccountId) { toast('请选择转入账户', 'error'); return }
        body.toAccountId = this.toAccountId
      } else {
        if (!this.selectedCatId) { toast('请先选择一个类目', 'error'); return }
        body.categoryId = this.selectedCatId
      }

      this.saving = true
      const self = this
      const editingId = this.editingId
      const request = editingId
        ? api.patch('/transactions/' + editingId, body)
        : api.post('/transactions', body)
      request.then(function (result) {
        if (editingId) {
          toast('流水已更新', 'success')
          self.editingId = null
          setTimeout(function () { uni.reLaunch({ url: '/pages/ledger/list' }) }, 320)
          return
        }
        self.queue.unshift(result.transaction)
        self.lastPen = result.penetration || null
        self.expr = ''
        self.catTouched = false
        self.note = ''
        toast('已记录 ' + fmt.money(result.transaction.amount), 'success')
        self.reloadBudget()
        // 「保存」是一次性动作：给成功提示留半秒再离开，否则用户看不清存了什么
        if (!self.continuous) setTimeout(function () { self.exitSheet() }, 380)
      }).catch(function () {
        /* api.js 已提示 */
      }).finally(function () {
        self.saving = false
      })
    },

    /** 撤回 = 软删那一笔（不是从列表里抹掉假装没输过） */
    undo(id) {
      const self = this
      confirm('撤回这一笔记账？').then(function (ok) {
        if (!ok) return
        api.del('/transactions/' + id).then(function () {
          self.queue = self.queue.filter(function (t) { return t.id !== id })
          self.reloadBudget()
          toast('已撤回这一笔', 'success')
        })
      })
    },

    /** 记账/撤回后分类预算的已用部分变了，重拉一次视图再重画穿透条 */
    reloadBudget() {
      if (!this.ctx) return
      const self = this
      api.get('/budget/categories', { period: this.period }, { silent: true })
        .then(function (data) { self.catBudget = (data && data.items) || [] })
        .catch(function () { /* 拉不到就维持上一次的数字，不打断记账流程 */ })
    },

    load() {
      const self = this
      return meta().then(function (ctx) {
        self.ctx = ctx
        self.ensureAccount()
        self.ensureToAccount()
        // 警戒线位置和分类预算都要额外两条请求。其中一条失败不该让另一条的成果也丢掉，
        // 面板本来就能在缺数据时工作。
        return Promise.all([
          api.get('/budget', { period: self.period }, { silent: true })
            .then(function (b) { if (b && b.hasBudget && b.alertYellowPct) self.yellowPct = b.alertYellowPct })
            .catch(function () {}),
          api.get('/budget/categories', { period: self.period }, { silent: true })
            .then(function (d) { self.catBudget = (d && d.items) || [] })
            .catch(function () {}),
        ])
      })
    },
  },
}
</script>

<style lang="scss" scoped>
.record {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 16rpx 32rpx 24rpx;
}

/* ---- 顶部 ---- */
.head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.types {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  padding: 6rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
  flex: 1;
  min-width: 0;
}
.type-btn {
  flex: 1;
  text-align: center;
  white-space: nowrap;
  padding: 10rpx 16rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-secondary);
  &.on {
    background-color: rgb(var(--mz-primary));
    color: rgb(var(--mz-on-primary));
    box-shadow: var(--shadow-tier1);
  }
}
.head-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  flex-shrink: 0;
}
.cont {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
}
.cont-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.switch {
  width: 72rpx;
  height: 40rpx;
  border-radius: 9999rpx;
  padding: 4rpx;
  background-color: rgb(var(--mz-surface-container-high));
  transition: background-color 200ms;
  &.on { background-color: rgb(var(--mz-primary)); }
}
.knob {
  width: 32rpx;
  height: 32rpx;
  border-radius: 9999rpx;
  background-color: #fff;
  box-shadow: var(--shadow-tier1);
  transition: transform 200ms;
  &.on { transform: translateX(32rpx); }
}
.exit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  color: var(--text-secondary);
}

/* ---- 横幅 ---- */
.banner {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 16rpx 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.banner-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  flex: 1;
  min-width: 0;
}
.banner-text {
  font-size: 26rpx;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.banner-quota {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-lowest));
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
}

/* ---- 金额终端 ---- */
.terminal {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 32rpx;
  border-radius: 32rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.calc-hint {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4rpx;
  font-size: 22rpx;
  font-weight: 500;
  color: var(--brand-700);
}
.expr-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8rpx;
}
.expr {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.caret {
  width: 4rpx;
  height: 56rpx;
  background-color: rgb(var(--mz-primary));
  align-self: center;
}
.res {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* ---- 穿透条 ---- */
.pen {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding-top: 8rpx;
}
.pen-head { font-size: 22rpx; }
.pen-text {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
}
.pen-pct { font-weight: 600; flex-shrink: 0; }
.track {
  position: relative;
  display: flex;
  flex-direction: row;
  height: 16rpx;
  border-radius: 9999rpx;
  overflow: hidden;
  background-color: rgb(var(--mz-surface-container-high));
}
.fill-base {
  height: 100%;
  background-color: rgb(var(--mz-primary));
  transition: width 300ms;
}
.fill-delta {
  height: 100%;
  background-color: rgb(var(--mz-tertiary-container));
  transition: width 300ms;
}
.mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  opacity: 0.7;
}

/* ---- 类目 ---- */
.cat-block {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.manage {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2rpx;
  font-size: 22rpx;
  color: var(--brand-700);
}
.cat-grid { gap: 8rpx; }
.cat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 12rpx 4rpx;
  border-radius: 20rpx;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
  &.on {
    background-color: rgb(var(--mz-primary-container));
    color: rgb(var(--mz-on-primary-container));
  }
}
.cat-name {
  width: 100%;
  text-align: center;
  font-size: 20rpx;
  font-weight: 500;
}

/* ---- 元信息 ---- */
.meta {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 16rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.meta-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  border-radius: 16rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  min-width: 0;
}
.meta-cell.wide { width: 100%; }
.time-row {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.note-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.note-input {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--text-primary);
}
.ph { color: var(--text-tertiary); }
.chips { width: 100%; }
.chips-inner {
  display: flex;
  flex-direction: row;
  gap: 12rpx;
  white-space: nowrap;
}
.chip {
  flex-shrink: 0;
  padding: 6rpx 20rpx;
  border-radius: 9999rpx;
  font-size: 22rpx;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-lowest));
}

/* ---- 键盘 ---- */
.keypad { gap: 8rpx; }
.key {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  font-size: 36rpx;
  font-weight: 600;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
  &:active { background-color: rgb(var(--mz-surface-container)); }
  &.op {
    color: var(--accent-700);
    background-color: rgb(var(--mz-surface-container-high));
  }
}

/* ---- 操作 ---- */
.actions {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
}
.save-btn {
  flex: 2;
  height: 96rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: rgb(var(--mz-on-primary));
  background-color: rgb(var(--mz-primary));
  &.off { opacity: 0.4; }
}
.done-btn {
  flex: 1;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
}

/* ---- 已记清单 ---- */
.queue {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 24rpx 32rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.queue-count {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-high));
  padding: 2rpx 14rpx;
  border-radius: 9999rpx;
}
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.queue-empty {
  text-align: center;
  font-size: 22rpx;
  color: var(--text-secondary);
  padding: 16rpx 0;
}
.queue-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 12rpx;
  border-radius: 16rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.q-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-primary-container));
}
.q-sub {
  font-size: 18rpx;
  color: var(--text-secondary);
}
.undo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  color: var(--text-secondary);
}
</style>
