<template>
  <mz-page title="资金账户">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">设置 · 资金账户</text>
        <text class="t-h1">资金账户管理</text>
        <text class="t-body-sm c-secondary lead">账户余额由初始余额与后续流水共同计算。</text>
      </view>

      <!-- ===== 资产汇总 ===== -->
      <view class="mz-card">
        <view class="asset-strip">
          <view class="asset">
            <text class="t-label-sm c-secondary">实时聚合流动净资产</text>
            <text class="asset-value tnum">{{ fmt.money(netWorth) }}</text>
          </view>
          <view class="asset">
            <text class="t-label-sm c-secondary">借记卡与钱包余额</text>
            <text class="asset-value tnum">{{ fmt.money(liquid) }}</text>
          </view>
          <view class="asset">
            <text class="t-label-sm c-secondary">待还信用卡已用额度</text>
            <text class="asset-value tnum c-accent">{{ fmt.money(creditUsed) }}</text>
          </view>
        </view>
      </view>

      <view class="mz-btn mz-btn-primary mz-btn-block" @tap="openCreate">
        <mz-icon name="add_card" :size="18" color="#FFFFFF" />
        <text>添加新资金账户</text>
      </view>

      <view v-if="loading" class="skeleton">
        <view v-for="n in 3" :key="n" class="sk-line"></view>
      </view>

      <view v-else-if="accounts.length" class="list">
        <view v-for="a in accounts" :key="a.id" class="acct">
          <view class="between">
            <view class="row items-center gap-2 acct-head">
              <view class="acct-tile" :style="{ backgroundColor: tint(a.color) }">
                <mz-icon :name="accountIcon(a)" :size="22" :color="a.color || '#14B8A6'" />
              </view>
              <view class="col flex-1 acct-main">
                <view class="row items-center gap-2">
                  <text class="acct-name ellipsis">{{ a.name }}</text>
                  <view v-if="a.isDefault" class="chip chip-brand"><text>默认账户</text></view>
                </view>
                <text class="t-body-sm c-secondary ellipsis">{{ accountMeta(a) }}</text>
              </view>
            </view>
            <view class="col acct-right">
              <text class="acct-amount tnum" :class="{ 'c-accent': a.type === 'credit' }">{{ accountAmount(a) }}</text>
              <text class="t-label-sm c-secondary">{{ a.type === 'credit' ? '已用额度' : '实时余额' }}</text>
            </view>
          </view>

          <view class="acct-acts">
            <view v-if="!a.isDefault" class="mz-btn mz-btn-sm mz-btn-ghost" @tap="setDefault(a)">设为默认</view>
            <view v-else class="t-label-sm c-tertiary">记账默认账户</view>
            <view class="mz-btn mz-btn-sm" @tap="openEdit(a)">
              <mz-icon name="tune" :size="15" color="#0F766E" />
              <text>编辑账户</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="inline-empty"><text>还没有资金账户</text></view>
    </view>

    <!-- ===== 新增 / 编辑抽屉 ===== -->
    <view v-if="editor.open" class="mask" @tap="closeEditor">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <view class="col flex-1">
            <text class="t-h3">{{ editor.item ? '编辑资金账户' : '添加新资金账户' }}</text>
            <text class="t-body-sm c-secondary">账户余额由初始余额与后续流水共同计算。</text>
          </view>
          <view class="icon-btn" @tap="closeEditor">
            <mz-icon name="close" :size="22" color="#64748B" />
          </view>
        </view>

        <scroll-view class="sheet-body" scroll-y>
          <!-- 类型：创建后不可改（改类型会让历史流水的语义错位） -->
          <view class="field">
            <text class="t-label">账户类型</text>
            <picker
              mode="selector"
              :range="typeOptions"
              range-key="label"
              :value="typeIndex"
              :disabled="!!editor.item"
              @change="onTypePick"
            >
              <view class="pick-cell" :class="{ 'pick-off': !!editor.item }">
                <mz-icon :name="typeIcon(editor.type)" :size="20" color="#0F766E" />
                <text class="t-body flex-1">{{ typeLabel(editor.type) }}</text>
                <text v-if="editor.item" class="t-label-sm c-tertiary">不可修改</text>
                <mz-icon v-else name="expand_more" :size="16" color="#64748B" />
              </view>
            </picker>
          </view>

          <view class="field">
            <text class="t-label">账户名称</text>
            <input
              v-model="editor.name"
              class="mz-input"
              type="text"
              :maxlength="50"
              placeholder="例如：招商银行储蓄卡"
              placeholder-class="ph"
            />
          </view>

          <view class="field-row">
            <view class="field flex-1">
              <text class="t-label">初始余额</text>
              <input
                v-model="editor.initialBalance"
                class="mz-input"
                type="digit"
                placeholder="0.00"
                placeholder-class="ph"
              />
            </view>
            <view class="field flex-1">
              <text class="t-label">卡号尾号（可选）</text>
              <input
                v-model="editor.cardTail"
                class="mz-input"
                type="number"
                :maxlength="4"
                placeholder="4 位数字"
                placeholder-class="ph"
              />
            </view>
          </view>

          <view v-if="editor.type === 'credit'" class="field-row">
            <view class="field flex-1">
              <text class="t-label">授信额度</text>
              <input
                v-model="editor.creditLimit"
                class="mz-input"
                type="digit"
                placeholder="必填"
                placeholder-class="ph"
              />
            </view>
            <view class="field flex-1">
              <text class="t-label">当期待还</text>
              <input
                v-model="editor.billDue"
                class="mz-input"
                type="digit"
                placeholder="0.00"
                placeholder-class="ph"
              />
            </view>
          </view>

          <view class="field switch-row">
            <view class="col flex-1">
              <text class="t-label">设为默认记账账户</text>
              <text class="t-label-sm c-secondary">记账面板打开时默认选中该账户</text>
            </view>
            <switch :checked="editor.isDefault" color="#0F766E" @change="onDefaultSwitch" />
          </view>
        </scroll-view>

        <view class="sheet-foot">
          <view
            v-if="editor.item && !editor.item.isDefault"
            class="mz-btn mz-btn-sm mz-btn-ghost danger-text"
            @tap="archive"
          >归档账户</view>
          <view v-else class="spacer"></view>
          <view class="row gap-2">
            <view class="mz-btn mz-btn-ghost" @tap="closeEditor">取消</view>
            <view class="mz-btn mz-btn-primary" :class="{ 'is-busy': editor.busy }" @tap="save">
              {{ editor.item ? '保存账户' : '创建账户' }}
            </view>
          </view>
        </view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 资金账户管理（浏览器版 21-settings-index.html 的 loadAccounts / accountForm，
 * 见 settings-page.js:131-208）。
 *
 * 浏览器版把账户列表画进 #settings-account-list，编辑弹一个模态框。手机屏窄，
 * 所以列表改成竖排卡片、编辑升格为页面内抽屉（与分类管理页同一套 idiom）。
 *
 * 三处照搬的规则，改动会破坏数据一致性：
 *   1. 类型创建后不可修改 —— 后端 account.type 决定 credit 语义，
 *      改类型会让已发生的信用卡流水按储蓄卡口径重算。
 *   2. 归档不是删除 —— DELETE /accounts/:id 只置 is_archived，历史流水保留。
 *      默认账户不允许归档（浏览器版同理：默认账户不显示归档按钮）。
 *   3. 只有 credit 才送 creditLimit / billDue，且 creditLimit 必填；
 *      其他类型送这两列会被 CHECK 约束拦下。
 *
 * 新增时的 icon / color 由类型推导（credit 用紫色 #8B5CF6，其余青色 #14B8A6），
 * 与浏览器版 accountForm 的第 176 行逐字一致 —— 两端的账户颜色因此不会分叉。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { invalidateMeta } from '@/common/store'
import { toast, confirm } from '@/common/ui'

/* 与浏览器版 settings-page.js 的 accountTypes 键值完全相同 */
const ACCOUNT_TYPES = [
  { key: 'cash', label: '现金', icon: 'payments' },
  { key: 'wechat', label: '微信钱包', icon: 'chat' },
  { key: 'alipay', label: '支付宝', icon: 'savings' },
  { key: 'bank', label: '银行卡', icon: 'account_balance' },
  { key: 'credit', label: '信用卡', icon: 'credit_card' },
]

function typeDef(key) {
  return (
    ACCOUNT_TYPES.filter(function (t) {
      return t.key === key
    })[0] || ACCOUNT_TYPES[0]
  )
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      typeOptions: ACCOUNT_TYPES,
      loading: true,
      accounts: [],
      editor: {
        open: false,
        item: null,
        type: 'cash',
        name: '',
        initialBalance: '',
        cardTail: '',
        creditLimit: '',
        billDue: '',
        isDefault: false,
        busy: false,
      },
    }
  },
  computed: {
    netWorth() {
      return this.sum('balance')
    },
    liquid() {
      return this.accounts.reduce(function (s, a) {
        return a.type === 'credit' ? s : s + Number(a.balance || 0)
      }, 0)
    },
    creditUsed() {
      return this.sum('creditUsed')
    },
    typeIndex() {
      return ACCOUNT_TYPES.findIndex(
        function (t) {
          return t.key === this.editor.type
        }.bind(this)
      )
    },
  },
  onLoad() {
    this.load()
  },
  methods: {
    sum(key) {
      return (this.accounts || []).reduce(function (s, x) {
        return s + Number(x[key] || 0)
      }, 0)
    },
    typeLabel(key) {
      return typeDef(key).label
    },
    typeIcon(key) {
      return typeDef(key).icon
    },
    accountIcon(a) {
      return a.icon || typeDef(a.type).icon
    },
    /** 主题色 10% 浅底：#14B8A6 → #14B8A61A */
    tint(color) {
      return (color || '#14B8A6') + '1A'
    },
    accountMeta(a) {
      const tail = a.cardTail ? ' · 尾号 ' + a.cardTail : ''
      const detail =
        a.type === 'credit'
          ? '可用 ' + fmt.money(a.creditAvailable || 0)
          : '初始余额 ' + fmt.money(a.initialBalance || 0)
      return typeDef(a.type).label + tail + ' · ' + detail
    },
    accountAmount(a) {
      return a.type === 'credit' ? fmt.money(a.creditUsed || 0) : fmt.money(a.balance || 0)
    },
    load() {
      const self = this
      return api
        .get('/accounts')
        .then(function (accounts) {
          self.accounts = accounts || []
          self.loading = false
        })
        .catch(function () {
          self.loading = false
        })
    },

    /* ---------- 抽屉 ---------- */
    openCreate() {
      this.editor = {
        open: true,
        item: null,
        type: 'cash',
        name: '',
        initialBalance: '0',
        cardTail: '',
        creditLimit: '',
        billDue: '',
        isDefault: false,
        busy: false,
      }
    },
    openEdit(a) {
      this.editor = {
        open: true,
        item: a,
        type: a.type,
        name: a.name || '',
        initialBalance: a.initialBalance == null ? '0' : String(a.initialBalance),
        cardTail: a.cardTail || '',
        creditLimit: a.creditLimit == null ? '' : String(a.creditLimit),
        billDue: a.billDue == null ? '' : String(a.billDue),
        isDefault: !!a.isDefault,
        busy: false,
      }
    },
    closeEditor() {
      this.editor.open = false
    },
    onTypePick(e) {
      const t = ACCOUNT_TYPES[Number(e.detail.value)]
      if (t) this.editor.type = t.key
    },
    onDefaultSwitch(e) {
      this.editor.isDefault = !!e.detail.value
    },

    save() {
      const self = this
      const e = this.editor
      const name = String(e.name || '').trim()
      if (!name) {
        toast('请输入账户名称', 'error')
        return
      }
      const initial = Number(e.initialBalance || 0)
      if (!isFinite(initial) || initial < 0) {
        toast('初始余额需要是不小于 0 的数字', 'error')
        return
      }
      const tail = String(e.cardTail || '').trim()
      if (tail && !/^[0-9]{4}$/.test(tail)) {
        toast('卡号尾号需要是 4 位数字', 'error')
        return
      }
      if (e.type === 'credit') {
        const limit = Number(e.creditLimit)
        if (!isFinite(limit) || limit <= 0) {
          toast('信用卡必须填写大于 0 的授信额度', 'error')
          return
        }
      }
      if (e.busy) return
      e.busy = true

      const body = {
        name: name,
        initialBalance: initial,
        cardTail: tail || null,
        isDefault: !!e.isDefault,
      }
      if (!e.item) {
        // 只有新建才送这三个：类型不可改，图标与颜色由类型推导
        body.type = e.type
        body.icon = typeDef(e.type).icon
        body.color = e.type === 'credit' ? '#8B5CF6' : '#14B8A6'
      }
      if (e.type === 'credit') {
        body.creditLimit = Number(e.creditLimit)
        body.billDue = String(e.billDue).trim() === '' ? null : Number(e.billDue)
      }

      const req = e.item ? api.patch('/accounts/' + e.item.id, body) : api.post('/accounts', body)
      req
        .then(function () {
          invalidateMeta()
          toast(e.item ? '资金账户已更新' : '资金账户已添加', 'success')
          e.open = false
          return self.load()
        })
        .catch(function () {
          e.busy = false
        })
    },

    setDefault(a) {
      const self = this
      api.put('/accounts/' + a.id + '/default', {}).then(function () {
        invalidateMeta()
        toast('默认账户已更新', 'success')
        self.load()
      })
    },

    archive() {
      const self = this
      const item = this.editor.item
      if (!item) return
      const balanceText = Number(item.balance) ? '，当前余额为 ' + fmt.money(item.balance) : ''
      confirm(
        '归档后该账户不会出现在新记账选择器中，历史流水仍会保留' + balanceText + '。确认归档？',
        { title: '归档账户', confirmText: '确认归档', danger: true }
      ).then(function (ok) {
        if (!ok) return
        api
          .del('/accounts/' + item.id)
          .then(function (result) {
            invalidateMeta()
            toast((result && result.notice) || '资金账户已归档', 'success')
            self.editor.open = false
            self.load()
          })
          .catch(function () {})
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
  padding: 24rpx 24rpx 40rpx;
}

.intro { display: flex; flex-direction: column; gap: 10rpx; padding: 0 4rpx; }
.lead { display: block; line-height: 1.7; margin-top: 8rpx; }

/* 资产汇总 */
.asset-strip { display: flex; flex-direction: column; gap: 18rpx; }
.asset { display: flex; flex-direction: column; gap: 6rpx; }
.asset-value { font-size: 36rpx; font-weight: 800; color: var(--text-primary); }

/* 列表 */
.list { display: flex; flex-direction: column; gap: 16rpx; }
.acct {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.acct-head { min-width: 0; }
.acct-tile {
  width: 84rpx;
  height: 84rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.acct-main { gap: 6rpx; min-width: 0; }
.acct-name { font-size: 29rpx; font-weight: 700; color: var(--text-primary); max-width: 300rpx; }
.acct-right { align-items: flex-end; gap: 6rpx; flex-shrink: 0; }
.acct-amount { font-size: 29rpx; font-weight: 700; color: var(--text-primary); }
.acct-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--border);
}

.chip {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
  color: var(--text-secondary);
}
.chip-brand { background-color: rgb(var(--mz-primary-container)); color: var(--brand-700); }

/* 抽屉 */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background-color: rgba(15, 23, 42, 0.45);
}
.sheet {
  display: flex;
  flex-direction: column;
  height: 90vh;
  border-radius: 28rpx 28rpx 0 0;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.sheet-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16rpx;
  padding: 28rpx 24rpx 20rpx;
  border-bottom: 1rpx solid var(--border);
}
.sheet-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 24rpx 24rpx;
}
.sheet-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--border);
}
.spacer { flex: 1; }
.danger-text { color: var(--danger); }
.icon-btn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.field { display: flex; flex-direction: column; gap: 12rpx; margin-top: 24rpx; }
.field-row { display: flex; flex-direction: row; gap: 16rpx; }
.ph { color: var(--text-tertiary); }

.pick-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  min-height: 96rpx;
  padding: 0 32rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.pick-off { opacity: 0.6; }

.switch-row {
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}

.is-busy { opacity: 0.6; }

.inline-empty {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}

.skeleton { display: flex; flex-direction: column; gap: 16rpx; }
.sk-line {
  height: 200rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
  animation: sk 1.2s ease-in-out infinite;
}
@keyframes sk {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
