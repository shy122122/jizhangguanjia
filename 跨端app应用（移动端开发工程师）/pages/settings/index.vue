<template>
  <mz-page title="个人与设置" :back="false" :tabbar="true">
    <view class="page">
      <!-- ===== 页头 ===== -->
      <view class="intro">
        <view class="row items-center gap-2">
          <mz-icon name="tune" :size="16" color="#0F766E" />
          <text class="t-label-sm c-primary">系统核心控制台 · PRD 4.7 / 6.4</text>
        </view>
        <text class="t-h1">个人与设置</text>
        <text class="t-body-sm c-secondary lead">管理账户体系、分类规则、预算参数与账号数据安全。</text>
        <view class="pill-row">
          <view class="pill">
            <view class="dot dot-brand dot-pulse"></view>
            <text class="t-label-sm">服务端账本已连接</text>
          </view>
          <view class="pill">
            <mz-icon name="lock" :size="14" color="#0F766E" />
            <text class="t-label-sm c-secondary">密码哈希 · 会话可吊销</text>
          </view>
        </view>
      </view>

      <!-- ===== 01 账号与账本架构 ===== -->
      <view class="mz-card">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 01</text>
              <text class="t-label-sm c-secondary">PRD 6.4 数据模型架构</text>
            </view>
            <text class="t-h3">账号与账本架构</text>
          </view>
          <view class="chip">
            <mz-icon name="shield" :size="13" color="#0F766E" />
            <text>账本级隔离</text>
          </view>
        </view>

        <view class="user-banner">
          <image v-if="avatar" class="user-avatar" :src="avatar" mode="aspectFill" />
          <view v-else class="user-avatar user-avatar-fallback">
            <mz-icon name="person" :size="30" color="#0F766E" />
          </view>
          <view class="col flex-1 user-info">
            <view class="row items-center gap-2">
              <text class="user-name ellipsis">{{ userName }}</text>
              <view class="chip chip-brand"><text>主管理员</text></view>
            </view>
            <text class="t-body-sm c-secondary ellipsis">{{ userAccount }}</text>
            <text class="t-label-sm c-tertiary">UID: {{ userId }}</text>
          </view>
        </view>

        <view class="mz-btn mz-btn-block" @tap="toProfile">编辑个人资料</view>

        <view class="sub-card">
          <view class="row items-center gap-2">
            <view class="mini-tile">
              <mz-icon name="book" :size="20" color="#0F766E" />
            </view>
            <text class="t-label">当前激活账本</text>
            <view class="chip chip-brand"><text>私有独享</text></view>
          </view>
          <view class="row items-center gap-2 mt-2">
            <text class="ledger-name ellipsis">{{ ledgerName }}</text>
            <view class="icon-btn" @tap="toLedger">
              <mz-icon name="edit" :size="18" color="#64748B" />
            </view>
          </view>
          <text class="t-body-sm c-secondary ledger-sum">{{ ledgerSummary }}</text>
          <view class="between row-soft">
            <view class="row items-center gap-2">
              <mz-icon name="database" :size="15" color="#64748B" />
              <text class="t-body-sm c-secondary">服务端数据库存储</text>
            </view>
            <view class="mz-btn mz-btn-sm mz-btn-ghost" @tap="inert">切换账本</view>
          </view>
        </view>

        <view class="sub-card sub-card-dashed">
          <view class="row items-center gap-2">
            <mz-icon name="group_add" :size="20" color="#0E7490" />
            <text class="t-label">共享账本架构演进支持</text>
          </view>
          <text class="t-body-sm c-secondary lead">
            底层数据库模型基于多租户账本（ledger_id）预留字段设计，未来可无缝扩容为「情侣账本」与「家庭多成员协同账本」。
          </text>
          <view class="between row-soft">
            <text class="t-label-sm c-secondary">协议预留 v2.1 Sync Engine</text>
            <view class="mz-btn mz-btn-sm mz-btn-ghost" @tap="inert">申请参与内测</view>
          </view>
        </view>
      </view>

      <!-- ===== 02 分类管理 ===== -->
      <view class="mz-card">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 02</text>
              <text class="t-label-sm c-secondary">PRD 4.7 核心消费属性</text>
            </view>
            <text class="t-h3">分类管理与自定义</text>
          </view>
        </view>
        <text class="t-body-sm c-secondary lead">
          预设支出核心类目，支持图标、主题色与预算的修改；归档不会删除历史流水。
        </text>

        <view class="tabs">
          <view
            class="tab"
            :class="{ 'tab-on': catTab === 'expense' }"
            @tap="catTab = 'expense'"
          >支出分类 ({{ expenseCats.length }})</view>
          <view
            class="tab"
            :class="{ 'tab-on': catTab === 'income' }"
            @tap="catTab = 'income'"
          >收入分类 ({{ incomeCats.length }})</view>
        </view>

        <view v-if="shownCats.length" class="cat-grid">
          <view v-for="c in shownCats" :key="c.id" class="cat" @tap="toCategories">
            <view class="cat-icon" :style="{ backgroundColor: tint(c.color), color: c.color || '#14B8A6' }">
              <mz-icon :name="iconOf(c.icon)" :size="20" :color="c.color || '#14B8A6'" />
            </view>
            <text class="cat-name ellipsis">{{ c.name }}</text>
          </view>
        </view>
        <view v-else class="inline-empty"><text>暂无分类</text></view>

        <view class="row gap-2 mt-2">
          <view class="mz-btn mz-btn-ghost flex-1" @tap="inert">恢复默认分类</view>
          <view class="mz-btn mz-btn-primary flex-1" @tap="toCategories">
            <mz-icon name="add_circle" :size="16" color="#FFFFFF" />
            <text>管理分类</text>
          </view>
        </view>
      </view>

      <!-- ===== 03 资金账户管理 ===== -->
      <view class="mz-card">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 03</text>
              <text class="t-label-sm c-secondary">资金资产与账单扣减</text>
            </view>
            <text class="t-h3">资金账户管理</text>
          </view>
        </view>

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

        <view v-if="accounts.length" class="acct-list">
          <view v-for="a in accounts" :key="a.id" class="acct">
            <view class="acct-icon" :style="{ backgroundColor: tint(a.color) }">
              <mz-icon :name="accountIcon(a)" :size="20" :color="a.color || '#14B8A6'" />
            </view>
            <view class="col flex-1 acct-main">
              <view class="row items-center gap-2">
                <text class="acct-name ellipsis">{{ a.name }}</text>
                <text v-if="a.isDefault" class="chip chip-brand">默认</text>
              </view>
              <text class="t-body-sm c-secondary ellipsis">{{ accountMeta(a) }}</text>
            </view>
            <view class="col acct-right">
              <text class="acct-amount tnum" :class="{ 'c-accent': a.type === 'credit' }">{{ accountAmount(a) }}</text>
              <text class="t-label-sm c-secondary">{{ accountNote(a) }}</text>
            </view>
          </view>
        </view>
        <view v-else class="inline-empty"><text>还没有资金账户</text></view>

        <view class="mz-btn mz-btn-primary mz-btn-block" @tap="toAccounts">
          <mz-icon name="add_card" :size="16" color="#FFFFFF" />
          <text>添加 / 管理资金账户</text>
        </view>
      </view>

      <!-- ===== 04 预算偏好与预警阈值 ===== -->
      <view class="mz-card">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 04</text>
              <text class="t-label-sm c-secondary">PRD 4.4.4 风险控制引擎</text>
            </view>
            <text class="t-h3">预算偏好与预警阈值</text>
          </view>
        </view>

        <view class="thr">
          <view class="between">
            <view class="row items-center gap-2">
              <view class="dot dot-warn"></view>
              <text class="t-label">黄色注意预警阈值</text>
            </view>
            <text class="tnum bold">{{ alertYellow }}%</text>
          </view>
          <text class="t-body-sm c-secondary">月度或分类支出进度达到该比例时，渗透条呈现琥珀黄警示。</text>
        </view>
        <view class="thr">
          <view class="between">
            <view class="row items-center gap-2">
              <view class="dot dot-danger"></view>
              <text class="t-label">红色超支临界警戒线</text>
            </view>
            <text class="tnum bold c-danger">{{ alertRed }}%</text>
          </view>
          <text class="t-body-sm c-secondary">达到该阈值触发穿透告警，并在记账时显示预算已击穿警示。</text>
        </view>

        <view class="sub-card">
          <view class="between">
            <text class="t-label">「今日安全可花」算法</text>
            <view class="chip chip-brand"><text>标准</text></view>
          </view>
          <text class="t-body-sm c-secondary lead">
            自然日平摊模型：每日安全额度 =（当月总预算 − 已支出）÷ 当月剩余天数。
          </text>
        </view>

        <view class="mz-btn mz-btn-block" @tap="toPreferences">前往调整预警与偏好</view>
      </view>

      <!-- ===== 05 数据管理与合规隐私 ===== -->
      <view class="mz-card">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 05</text>
              <text class="t-label-sm c-secondary">PRD 8 数据自主与安全合规</text>
            </view>
            <text class="t-h3">数据管理与合规隐私</text>
          </view>
        </view>

        <view class="sub-card sec-banner">
          <view class="row items-center gap-2">
            <view class="mini-tile mini-tile-brand">
              <mz-icon name="security_update_good" :size="20" color="#0F766E" />
            </view>
            <text class="t-label">服务端访问控制与会话吊销已启用</text>
            <view class="chip chip-brand"><text>已接入</text></view>
          </view>
          <text class="t-body-sm c-secondary lead">
            财务数据存储在服务端数据库；受保护接口每次校验登录令牌，并按账本 ID 限定数据范围。退出登录或修改密码后，旧令牌立即失效。
          </text>
        </view>

        <text class="t-label">流水数据导出</text>
        <view class="export-grid">
          <view class="export disabled">
            <mz-icon name="table_view" :size="22" color="#64748B" />
            <text class="t-label">Microsoft Excel</text>
            <text class="t-body-sm c-secondary">尚未开放</text>
          </view>
          <view class="export" @tap="exportInert">
            <mz-icon name="csv" :size="22" color="#0E7490" />
            <text class="t-label">通用 CSV 明细</text>
            <text class="t-body-sm c-secondary">点击了解</text>
          </view>
          <view class="export" @tap="exportInert">
            <mz-icon name="code" :size="22" color="#64748B" />
            <text class="t-label">完整 JSON 镜像</text>
            <text class="t-body-sm c-secondary">点击了解</text>
          </view>
        </view>

        <view class="danger-zone">
          <view class="row items-center gap-2">
            <mz-icon name="warning" :size="18" color="#E11D48" />
            <text class="t-label c-danger">不可逆危险操作区</text>
          </view>
          <view class="danger-row">
            <view class="col flex-1">
              <text class="t-body-sm bold">清除当前浏览器登录缓存</text>
              <text class="t-label-sm c-secondary">仅清除本机登录令牌与界面缓存，不删除服务端账本数据。</text>
            </view>
            <view class="mz-btn mz-btn-sm mz-btn-ghost" @tap="clearAndLogout">清除并退出</view>
          </view>
          <view class="danger-row">
            <view class="col flex-1">
              <text class="t-body-sm bold c-danger">永久注销账号并删除全部个人账本</text>
              <text class="t-label-sm c-secondary">删除流水、账户、分类、预算、导入记录与个人资料，需输入密码与「DELETE」。</text>
            </view>
            <view class="mz-btn mz-btn-sm mz-btn-danger-solid" @tap="toPrivacy">注销并销毁</view>
          </view>
        </view>
      </view>

      <!-- ===== 06 通用偏好 ===== -->
      <view class="mz-card last">
        <view class="sec-head">
          <view class="col flex-1">
            <view class="row items-center gap-2">
              <text class="sec-tag">Section 06</text>
              <text class="t-label-sm c-secondary">界面交互与通用偏好</text>
            </view>
            <text class="t-h3">通用偏好设置</text>
          </view>
        </view>

        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="translate" :size="18" color="#0F766E" />
            <text class="t-body-sm">系统界面语言</text>
          </view>
          <text class="t-body-sm c-secondary">{{ languageLabel }}</text>
        </view>
        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="currency_yen" :size="18" color="#0F766E" />
            <text class="t-body-sm">默认记账本位币</text>
          </view>
          <text class="t-body-sm c-secondary">{{ currencyLabel }}</text>
        </view>
        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="volume_up" :size="18" color="#0E7490" />
            <text class="t-body-sm">记账完成触感与音效</text>
          </view>
          <text class="t-body-sm c-secondary">{{ preferences.soundEnabled ? '已开启' : '已关闭' }}</text>
        </view>
        <view class="pref pref-off">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="cloud_sync" :size="18" color="#94A3B8" />
            <text class="t-body-sm c-secondary">自动备份</text>
          </view>
          <text class="t-body-sm c-tertiary">尚未开放</text>
        </view>

        <view class="mz-btn mz-btn-block" @tap="toPreferences">管理通用偏好</view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 个人与设置首页（浏览器版 21-settings-index.html + settings-page.js）。
 *
 * 浏览器版是一个 12 栏桌面仪表盘，六个 Section 全部内联展开，编辑动作弹模态框。
 * 手机屏放不下两栏，所以这里改成「单列仪表盘 + 每个 Section 一个入口」：
 *   资料 / 账本 / 账户 / 偏好 的编辑表单各自升格为独立页面（pages.json 已注册），
 *   首页只保留概览与跳转。数据一个不少，动作一个不少 —— 只是把模态框换成页面。
 *
 * 保留在首页里的真实交互：
 *   · 清除并退出 → POST /auth/logout（无状态，失败也照常清本地）
 *   · 删除账号   → 跳到 23 号隐私页（那里才有确认输入）
 * 导出 CSV / JSON 按交付要求（不要导出功能）改成说明性提示，不再发起下载。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { session, meta, currentPeriod } from '@/common/store'
import { toast, confirm } from '@/common/ui'

const ACCOUNT_ICON = {
  cash: 'payments',
  wechat: 'chat',
  alipay: 'savings',
  bank: 'account_balance',
  credit: 'credit_card',
}

/* 字体子集里没有的图标名 → 用语义最接近的替代，避免渲染成空白方块。
 * 种子数据里收入分类用了 card_giftcard / work，两个都不在子集中。 */
const ICON_ALIAS = {
  school: 'history_edu',
  card_giftcard: 'redeem',
  work: 'account_balance',
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      loading: true,
      catTab: 'expense',
      accounts: [],
      categories: [],
      preferences: {},
      budget: {},
      data: {},
      ledgers: [],
    }
  },
  computed: {
    userName() {
      const u = session.user || {}
      return u.displayName || u.nickname || '用户'
    },
    userAccount() {
      const u = session.user || {}
      return u.email || u.phone || '未绑定联系方式'
    },
    userId() {
      const u = session.user || {}
      return u.uid || '—'
    },
    avatar() {
      const u = session.user || {}
      return u.avatarUrl || ''
    },
    ledgerName() {
      return (session.ledger && session.ledger.name) || '我的账本'
    },
    ledgerSummary() {
      const list = this.ledgers || []
      const id = session.ledger && session.ledger.id
      const cur =
        list.filter(function (x) {
          return x.id === id
        })[0] || list[0]
      const created = cur && cur.createdAt ? String(cur.createdAt).slice(0, 10) : '—'
      return '创建于 ' + created + ' · 拥有 ' + (this.data.txnCount || 0) + ' 条有效流水'
    },
    expenseCats() {
      return this.categories.filter(function (c) {
        return c.type === 'expense'
      })
    },
    incomeCats() {
      return this.categories.filter(function (c) {
        return c.type === 'income'
      })
    },
    shownCats() {
      const list = this.catTab === 'expense' ? this.expenseCats : this.incomeCats
      return list.slice(0, 10)
    },
    netWorth() {
      return this.sum(this.accounts, 'balance')
    },
    liquid() {
      return this.accounts.reduce(function (s, a) {
        return a.type === 'credit' ? s : s + Number(a.balance || 0)
      }, 0)
    },
    creditUsed() {
      return this.sum(this.accounts, 'creditUsed')
    },
    alertYellow() {
      return this.budget.hasBudget ? Number(this.budget.alertYellowPct) : 80
    },
    alertRed() {
      return this.budget.hasBudget ? Number(this.budget.alertRedPct) : 100
    },
    languageLabel() {
      const map = { 'zh-CN': '简体中文', 'en-US': 'English (US)', 'zh-TW': '繁體中文' }
      return map[this.preferences.language] || '简体中文'
    },
    currencyLabel() {
      const map = { CNY: 'CNY (¥)', USD: 'USD ($)', EUR: 'EUR (€)', HKD: 'HKD (HK$)' }
      return map[this.preferences.currency] || 'CNY (¥)'
    },
  },
  onShow() {
    this.load()
  },
  methods: {
    sum(list, key) {
      return (list || []).reduce(function (s, x) {
        return s + Number(x[key] || 0)
      }, 0)
    },
    iconOf(name) {
      return ICON_ALIAS[name] || name || 'category'
    },
    accountIcon(a) {
      return this.iconOf(a.icon || (ACCOUNT_ICON[a.type] || 'payments'))
    },
    /** 把主题色兑成浅底（#14B8A6 → #14B8A618 的那种 10% 底） */
    tint(color) {
      return (color || '#14B8A6') + '1A'
    },
    accountMeta(a) {
      const label = (ACCOUNT_ICON[a.type] && { cash: '现金', wechat: '微信钱包', alipay: '支付宝', bank: '银行卡', credit: '信用卡' }[a.type]) || '账户'
      const tail = a.cardTail ? ' · 尾号 ' + a.cardTail : ''
      const detail =
        a.type === 'credit'
          ? '可用 ' + fmt.money(a.creditAvailable || 0)
          : '初始余额 ' + fmt.money(a.initialBalance || 0)
      return label + tail + ' · ' + detail
    },
    accountAmount(a) {
      return a.type === 'credit' ? fmt.money(a.creditUsed || 0) : fmt.money(a.balance || 0)
    },
    accountNote(a) {
      return a.type === 'credit' ? '已用额度' : '实时动态余额'
    },
    load() {
      const self = this
      const period = currentPeriod()
      return meta()
        .then(function () {
          return Promise.all([
            api.get('/accounts'),
            api.get('/categories', { includeArchived: 0 }),
            api.get('/settings/preferences'),
            api.get('/budget', { period: period }),
            api.get('/settings/data'),
            api.get('/settings/ledgers'),
          ])
        })
        .then(function (r) {
          self.accounts = r[0] || []
          self.categories = r[1] || []
          self.preferences = r[2] || {}
          self.budget = r[3] || {}
          self.data = r[4] || {}
          self.ledgers = r[5] || []
          self.loading = false
        })
        .catch(function () {
          self.loading = false
        })
    },
    inert() {
      toast('该操作在原型的这一步尚未可用', 'info')
    },
    exportInert() {
      toast('本 App 不提供导出功能', 'info')
    },
    toProfile() {
      uni.navigateTo({ url: '/pages/settings/profile' })
    },
    toLedger() {
      uni.navigateTo({ url: '/pages/settings/ledger' })
    },
    toCategories() {
      uni.navigateTo({ url: '/pages/settings/categories' })
    },
    toAccounts() {
      uni.navigateTo({ url: '/pages/settings/accounts' })
    },
    toPreferences() {
      uni.navigateTo({ url: '/pages/settings/preferences' })
    },
    toPrivacy() {
      uni.navigateTo({ url: '/pages/settings/privacy' })
    },
    clearAndLogout() {
      const self = this
      confirm('将清除本机的登录令牌与界面缓存并退出登录，服务端账本数据不受影响。', {
        title: '清除并退出',
        confirmText: '清除并退出',
        danger: true,
      }).then(function (ok) {
        if (!ok) return
        return api
          .post('/auth/logout', {}, { silent: true, redirectOn401: false })
          .catch(function () {})
          .then(function () {
            api.clearSession()
            session.user = null
            session.ledger = null
            uni.reLaunch({ url: '/pages/onboarding/landing' })
          })
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

.intro { display: flex; flex-direction: column; gap: 10rpx; padding: 0 4rpx; }
.lead { display: block; line-height: 1.7; margin-top: 12rpx; }

.pill-row { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12rpx; margin-top: 8rpx; }
.pill {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: 14rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.dot { width: 14rpx; height: 14rpx; border-radius: 9999rpx; flex-shrink: 0; }
.dot-brand { background-color: var(--brand-600); }
.dot-warn { background-color: var(--warning); }
.dot-danger { background-color: var(--danger); }
.dot-pulse { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* 通用小件 */
.sec-head { display: flex; flex-direction: row; align-items: flex-start; gap: 16rpx; }
.sec-tag {
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: var(--brand-600);
  background-color: rgb(var(--mz-surface-container));
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

.sub-card {
  display: flex;
  flex-direction: column;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.sub-card-dashed { background-color: rgb(var(--mz-surface-container-lowest)); border: 1rpx dashed var(--border); }
.mini-tile {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(var(--mz-primary-container));
}
.mini-tile-brand { background-color: rgb(var(--mz-primary-container)); }
.row-soft {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--border);
}
.icon-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 01 用户横幅 */
.user-banner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.user-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 9999rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container));
}
.user-avatar-fallback { display: flex; align-items: center; justify-content: center; }
.user-info { gap: 6rpx; min-width: 0; }
.user-name { font-size: 32rpx; font-weight: 700; color: var(--text-primary); max-width: 320rpx; }
.ledger-name { font-size: 30rpx; font-weight: 700; color: var(--text-primary); max-width: 440rpx; }
.ledger-sum { display: block; margin-top: 8rpx; }

/* 02 分类 */
.tabs {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  margin-top: 24rpx;
  padding: 6rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.tab {
  flex: 1;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  font-size: 26rpx;
  color: var(--text-secondary);
}
.tab-on { background-color: rgb(var(--mz-surface-container-lowest)); color: var(--brand-600); font-weight: 700; }
.cat-grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16rpx; margin-top: 24rpx; }
.cat {
  width: calc((100% - 64rpx) / 5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.cat-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cat-name { font-size: 22rpx; color: var(--text-secondary); max-width: 100%; }

/* 03 账户 */
.asset-strip {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.asset { display: flex; flex-direction: column; gap: 6rpx; }
.asset-value { font-size: 36rpx; font-weight: 800; color: var(--text-primary); }
.acct-list { display: flex; flex-direction: column; margin-top: 20rpx; }
.acct {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.acct:last-child { border-bottom: none; }
.acct-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.acct-main { gap: 6rpx; min-width: 0; }
.acct-name { font-size: 28rpx; font-weight: 700; color: var(--text-primary); max-width: 300rpx; }
.acct-right { align-items: flex-end; gap: 6rpx; flex-shrink: 0; }
.acct-amount { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }

/* 04 阈值 */
.thr {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}

/* 05 隐私 */
.sec-banner { margin-top: 24rpx; }
.export-grid { display: flex; flex-direction: row; gap: 16rpx; margin-top: 16rpx; }
.export {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.export.disabled { opacity: 0.5; }
.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: var(--danger-bg);
}
.danger-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
}

/* 06 偏好 */
.pref {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  margin-top: 16rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.pref-off { opacity: 0.7; }

.inline-empty {
  padding: 60rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}
.last { margin-bottom: 24rpx; }
</style>
