<template>
  <mz-page title="预算管控" :back="false" tabbar>
    <view class="page">
      <!-- ===== 头部 ===== -->
      <view class="col gap-1">
        <view class="row items-center gap-2">
          <text class="t-h1">预算管控</text>
          <view class="wizard-badge">
            <view class="pulse"></view>
            <text>冷启动向导</text>
          </view>
        </view>
        <text class="t-body-sm c-secondary">基于历史账单与消费行为模型，为本月构建自适应穿透基准</text>
      </view>

      <!-- 月份切换 -->
      <view class="switcher">
        <view class="sw-btn" @tap="shiftPeriod(-1)">
          <mz-icon name="chevron_left" :size="20" />
        </view>
        <view class="row items-center gap-1">
          <mz-icon name="calendar_today" :size="18" color="#0F766E" />
          <text class="sw-label">{{ fmt.period(period) }}</text>
        </view>
        <view class="sw-btn" @tap="shiftPeriod(1)">
          <mz-icon name="chevron_right" :size="20" />
        </view>
      </view>

      <!-- ===== 状态通告 ===== -->
      <view class="notice">
        <view class="notice-tile">
          <mz-icon name="eco" :size="26" color="#0F766E" />
        </view>
        <view class="col flex-1">
          <text class="notice-title">尚未配置 {{ fmt.period(period) }} 的预算计划</text>
          <text class="notice-desc">
            配置预算基准后，系统将自动激活每日「今日可花」动态模型并实时穿透每笔记账，杜绝超支盲区。
          </text>
        </view>
      </view>

      <!-- ===== 月度总预算待设定 ===== -->
      <view class="mz-card hero">
        <view class="between">
          <view class="row items-center gap-1">
            <mz-icon name="account_balance" :size="22" color="#0F766E" />
            <text class="t-label">月度总预算 · 待设定</text>
          </view>
          <text class="state-chip">状态：待注入基准</text>
        </view>

        <view class="col gap-1">
          <text class="t-body-sm c-secondary">系统基于过往支出偏好测算推荐</text>
          <view class="row items-baseline gap-1">
            <text class="rec-value tnum">¥3,000.00</text>
            <text class="t-body-sm c-secondary">/ 月度目标</text>
          </view>
        </view>

        <view class="col gap-1">
          <view class="preview-track">
            <view class="preview-fill" :style="{ width: previewPct + '%' }"></view>
          </view>
          <view class="between">
            <text class="t-body-sm c-secondary">待注入预算基准线，生效后将锁定警戒阈值</text>
            <text class="t-body-sm c-secondary">若采用推荐额，已消耗 {{ fmt.percent(previewPct) }}</text>
          </view>
        </view>

        <view class="col gap-2">
          <text class="t-label-sm c-secondary">推荐策略</text>
          <view class="wrap">
            <view class="strategy on">
              <mz-icon name="check_circle" :size="16" color="#0F766E" />
              <text>50/30/20 平衡法则 (推荐)</text>
            </view>
            <view class="strategy">极简存钱型 (¥2,400)</view>
            <view class="strategy">自由精细型</view>
          </view>
        </view>

        <view class="hero-actions">
          <view class="mz-btn mz-btn-primary flex-1" @tap="useRecommend">
            <mz-icon name="verified" :size="20" />
            <text>一键启用推荐 ¥3,000</text>
          </view>
          <view class="mz-btn" @tap="useCustom">自定义额度</view>
        </view>
      </view>

      <!-- ===== 穿透算法预演（深色卡） ===== -->
      <view class="preview">
        <view class="between">
          <view class="row items-center gap-2">
            <mz-icon name="insights" :size="22" color="#5EEAD4" />
            <text class="preview-title">算法穿透 · 动态平稳模型</text>
          </view>
          <text class="preview-tag">预演推演中</text>
        </view>

        <text class="preview-sub">今日建议可花额度</text>
        <text class="preview-wait">等待预算输入</text>
        <text class="preview-desc">
          设定后，系统将自动根据剩余 {{ previewDays }} 天动态推导每日安全可花
          <text class="preview-hl">{{ dailyHint }} / 天</text>，彻底告别盲目消费与月底焦虑。
        </text>

        <view class="formula">
          <text class="formula-kicker">演算核心逻辑</text>
          <text class="formula-body">今日可花 = (月度总预算 − 已支出) ÷ 剩余天数</text>
        </view>

        <view class="preview-foot">
          <view class="row items-center gap-1">
            <mz-icon name="bolt" :size="18" color="#5EEAD4" />
            <text>穿透引擎即时触发响应</text>
          </view>
          <text class="dim">精准至每分钱</text>
        </view>
      </view>

      <!-- ===== 分类预算推荐模型 ===== -->
      <view class="section-head">
        <view class="row items-center gap-2">
          <view class="bar"></view>
          <text class="t-h3">分类预算配置 · 推荐模型</text>
          <text class="count-chip">{{ presetCount }} 项可套用</text>
        </view>
        <text class="t-body-sm c-secondary">
          下面是「一键应用」会写入的额度，也是本方案的默认建议值。
        </text>
      </view>

      <view class="preset-grid">
        <view v-for="p in presets" :key="p.name" class="mz-card preset">
          <view class="between">
            <view class="row items-center gap-2">
              <view class="preset-tile">
                <mz-icon :name="p.icon" :size="24" color="#0F766E" />
              </view>
              <view class="col">
                <text class="preset-name">{{ p.name }}</text>
                <text class="preset-desc">{{ p.desc }}</text>
              </view>
            </view>
          </view>
          <view class="between preset-amount-row">
            <text class="t-body-sm c-secondary">推荐限额</text>
            <text class="t-num-data tnum">{{ fmt.money(p.amount) }}</text>
          </view>
        </view>
      </view>

      <!-- ===== 底部保障 + 主行动 ===== -->
      <view class="mz-card foot">
        <view class="row items-center gap-3">
          <view class="foot-tile">
            <mz-icon name="security" :size="28" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="t-h3">智能平衡保障机制</text>
            <text class="t-body-sm c-secondary">
              分类推荐额度总计 {{ fmt.money(presetTotal) }}，建议与月度总预算保持一致或预留 10% 应急缓冲。
            </text>
          </view>
        </view>
        <view class="mz-btn mz-btn-primary mz-btn-block" @tap="applyAll">
          <mz-icon name="done_all" :size="20" />
          <text>一键应用并激活全套预算</text>
        </view>
      </view>
    </view>

    <mz-amount-dialog
      :visible="amountDlg.visible"
      :title="amountDlg.title"
      :initial="amountDlg.initial"
      @confirm="onAmountConfirm"
      @cancel="amountDlg.visible = false"
    />
  </mz-page>
</template>

<script>
/* 预算冷启动向导（浏览器版 09-budget-setup.html + budget-pages.js 的 bindSetup）。
 *
 * 【哪些是真功能、哪些是布景】浏览器版这一页 90% 是静态装饰 —— 6 张预设卡片上的
 * 「点击采用」没有任何事件处理器，推荐策略标签、进度条、右下角的「从上月账单数据推导」
 * 也都没有绑定。真正会改数据的只有三个入口：
 *   setup-recommend-btn  存 3000 → 去看板
 *   setup-custom-btn     弹出金额框 → 存 → 刷新
 *   setup-apply-btn      存 3000 + 写入 plan 里的 5 个分类额度 → 去看板
 * 这里保持完全一致：预设卡片只展示 PLAN 里的额度（数值与真正写入的相同，
 * 所以「看到的就是会生效的」），不做成假按钮。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import mzAmountDialog from '@/components/mz-amount-dialog/mz-amount-dialog.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { toast } from '@/common/ui'
import { meta, currentPeriod, rememberPeriod } from '@/common/store'

/* 「一键应用」写入的固定方案。键是分类名 —— 与浏览器版逐字相同，
 * 所以两个端写进库里的分类必须是同名的（种子数据保证）。 */
const PLAN = {
  餐饮美食: 1200,
  交通出行: 400,
  休闲娱乐: 300,
  居家生活: 600,
  服饰购物: 300,
}
const PRESET_META = {
  餐饮美食: { icon: 'restaurant', desc: '三餐、咖啡及外卖茶饮' },
  交通出行: { icon: 'directions_subway', desc: '通勤地铁、打车与加油' },
  休闲娱乐: { icon: 'sports_esports', desc: '观影、聚会、会员订阅' },
  居家生活: { icon: 'home', desc: '水电煤气、日用消耗品' },
  服饰购物: { icon: 'shopping_bag', desc: '穿搭配件、换季置物' },
}
const RECOMMEND_TOTAL = 3000

export default {
  components: { mzIcon, mzPage, mzAmountDialog },
  data() {
    return {
      fmt,
      period: currentPeriod(),
      ctx: null,
      spentSoFar: 0,
      amountDlg: { visible: false, title: '', initial: '' },
    }
  },
  computed: {
    previewPct() {
      return RECOMMEND_TOTAL ? Math.round(this.spentSoFar / RECOMMEND_TOTAL * 1000) / 10 : 0
    },
    previewDays() { return 20 },
    dailyHint() {
      const left = Math.max(0, RECOMMEND_TOTAL - this.spentSoFar)
      return fmt.money(Math.round(left / this.previewDays * 100) / 100)
    },
    presets() {
      const self = this
      return Object.keys(PLAN).map(function (name) {
        const meta = PRESET_META[name] || {}
        return {
          name: name,
          amount: PLAN[name],
          icon: meta.icon || 'label',
          desc: meta.desc || '',
          exists: (self.ctx ? self.ctx.categories : []).some(function (c) { return c.name === name }),
        }
      })
    },
    presetCount() {
      return this.presets.filter(function (p) { return p.exists }).length
    },
    presetTotal() {
      return this.presets.reduce(function (n, p) { return n + p.amount }, 0)
    },
  },
  onShow() {
    const self = this
    meta().then(function (ctx) {
      self.ctx = ctx
      // 「已发生实际支出」用本月总支出，与浏览器版那种写死的演示数字不同 ——
      // 写死的话换成别的月份就成了假数据。
      return api.get('/transactions/summary', { period: self.period }, { silent: true })
        .then(function (s) { self.spentSoFar = (s && Number(s.expenseTotal)) || 0 })
        .catch(function () {})
    }).catch(function () {})
  },
  methods: {
    shiftPeriod(direction) {
      this.period = direction < 0 ? fmt.prevPeriod(this.period) : fmt.nextPeriod(this.period)
      rememberPeriod(this.period)
      // 周期变了，「已发生支出」也得跟着换
      this.onShow()
    },

    saveTotal(amount) {
      const self = this
      return api.put('/budget', {
        period: this.period,
        totalAmount: amount,
        alertYellowPct: 80,
        alertRedPct: 100,
        safeSpendMode: 'daily_flat',
      }).then(function () {
        toast('月度总预算已保存', 'success')
        return self.period
      })
    },

    goOverview() {
      // 看板是独立页面，用 redirectTo 替换掉向导，返回时不会又落回向导
      uni.redirectTo({ url: '/pages/budget/overview?period=' + this.period })
    },

    /** 一键启用推荐总预算 */
    useRecommend() {
      const self = this
      this.saveTotal(RECOMMEND_TOTAL).then(function () { self.goOverview() })
    },

    /** 自定义额度 */
    useCustom() {
      this.amountDlg.title = '设置 ' + fmt.period(this.period) + '总预算'
      this.amountDlg.initial = ''
      this.amountDlg.visible = true
    },
    onAmountConfirm(value) {
      const self = this
      this.amountDlg.visible = false
      this.saveTotal(value).then(function () { self.goOverview() })
    },

    /** 一键应用：先落总预算，再把 PLAN 里能对上的分类逐个写入 */
    applyAll() {
      const self = this
      const cats = (this.ctx ? this.ctx.categories : []).filter(function (x) {
        return PLAN[x.name] != null
      })
      if (!cats.length) {
        toast('当前账本里没有与推荐方案同名的收支分类', 'error')
        return
      }
      this.saveTotal(RECOMMEND_TOTAL).then(function () {
        return Promise.all(cats.map(function (x) {
          return api.put('/budget/categories/' + x.id, { period: self.period, amount: PLAN[x.name] })
        }))
      }).then(function () {
        toast('预算方案已启用', 'success')
        self.goOverview()
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
  padding: 0 24rpx 40rpx;
}

.wizard-badge {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-high));
}
.pulse {
  width: 12rpx;
  height: 12rpx;
  border-radius: 9999rpx;
  background-color: var(--brand-500);
}

.switcher {
  align-self: flex-start;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.sw-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: 14rpx;
  &:active { background-color: rgb(var(--mz-surface-container)); }
}
.sw-label { padding: 0 12rpx; font-size: 28rpx; font-weight: 600; color: var(--text-primary); }

/* ===== 通告 ===== */
.notice {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.notice-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;
  flex-shrink: 0;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.notice-title { font-size: 26rpx; font-weight: 700; color: var(--brand-700); }
.notice-desc { margin-top: 4rpx; font-size: 22rpx; color: var(--text-secondary); }

/* ===== 主卡 ===== */
.hero {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx;
}
.state-chip {
  padding: 6rpx 16rpx;
  border-radius: 12rpx;
  font-size: 20rpx;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-high));
}
.rec-value { font-size: 56rpx; font-weight: 700; color: var(--brand-700); letter-spacing: -0.02em; }
.preview-track {
  height: 22rpx;
  border-radius: 9999rpx;
  overflow: hidden;
  background-color: rgb(var(--mz-surface-container-high));
}
.preview-fill {
  height: 100%;
  border-radius: 9999rpx;
  background-color: rgba(20, 184, 166, 0.28);
}
.strategy {
  padding: 12rpx 20rpx;
  margin: 0 12rpx 12rpx 0;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-low));
  &.on {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 6rpx;
    color: var(--brand-700);
    background-color: rgb(var(--mz-surface-container));
  }
}
.hero-actions { display: flex; flex-direction: row; gap: 20rpx; }

/* ===== 深色预演卡 ===== */
.preview {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 32rpx;
  border-radius: 32rpx;
  color: rgb(var(--mz-inverse-on-surface));
  background-color: rgb(var(--mz-inverse-surface));
  box-shadow: var(--shadow-tier3);
}
.preview-title { font-size: 26rpx; font-weight: 600; color: #5EEAD4; letter-spacing: 0.02em; }
.preview-tag {
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: #A5F3FC;
  background-color: rgba(255, 255, 255, 0.1);
}
.preview-sub { margin-top: 8rpx; font-size: 22rpx; color: var(--text-tertiary); }
.preview-wait { font-size: 48rpx; font-weight: 700; color: #FFFFFF; }
.preview-desc { font-size: 22rpx; line-height: 1.6; color: var(--text-secondary); }
.preview-hl { font-weight: 700; color: #5EEAD4; }
.formula {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 20rpx;
  border-radius: 22rpx;
  background-color: rgba(255, 255, 255, 0.06);
}
.formula-kicker { font-size: 20rpx; color: #A5F3FC; }
.formula-body {
  padding: 12rpx 16rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
  text-align: center;
  color: #FFFFFF;
  background-color: rgba(255, 255, 255, 0.08);
}
.preview-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  font-size: 22rpx;
  color: var(--text-secondary);
}
.preview-foot .dim { color: var(--text-tertiary); }

/* ===== 预设 ===== */
.section-head { display: flex; flex-direction: column; gap: 10rpx; margin-top: 8rpx; }
.bar {
  width: 8rpx;
  height: 40rpx;
  border-radius: 9999rpx;
  background-color: var(--brand-500);
}
.count-chip {
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container));
}
.preset-grid { display: flex; flex-direction: column; gap: 20rpx; }
.preset {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 24rpx;
  opacity: 1;
}
.preset-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  flex-shrink: 0;
  border-radius: 22rpx;
  background-color: rgb(var(--mz-surface-container));
}
.preset-name { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.preset-desc { font-size: 22rpx; color: var(--text-secondary); }
.preset-amount-row { padding-top: 12rpx; border-top: 2rpx solid var(--border); }

/* ===== 底部 ===== */
.foot {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.foot-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  border-radius: 26rpx;
  background-color: rgb(var(--mz-surface-container));
}
</style>
