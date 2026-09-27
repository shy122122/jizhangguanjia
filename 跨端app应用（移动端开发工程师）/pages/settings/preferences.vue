<template>
  <mz-page title="通用偏好">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">设置 · 通用偏好</text>
        <text class="t-h1">偏好与预警阈值</text>
        <text class="t-body-sm c-secondary lead">界面语言、本位币、记账反馈与预算预警参数。</text>
      </view>

      <!-- ===== 通用偏好 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-2">
          <view class="mini-tile"><mz-icon name="tune" :size="20" color="#0F766E" /></view>
          <text class="t-label">通用偏好</text>
        </view>

        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="translate" :size="18" color="#0F766E" />
            <view class="col">
              <text class="t-body-sm">系统界面语言</text>
              <text class="t-label-sm c-secondary">{{ langLabel(pref.language) }}</text>
            </view>
          </view>
          <picker mode="selector" :range="LANG_KEYS" :value="langIndex" @change="onLangPick">
            <view class="pick-inline">
              <text class="t-body-sm">{{ pref.language }}</text>
              <mz-icon name="expand_more" :size="16" color="#64748B" />
            </view>
          </picker>
        </view>

        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="currency_yen" :size="18" color="#0F766E" />
            <view class="col">
              <text class="t-body-sm">默认记账本位币</text>
              <text class="t-label-sm c-secondary">{{ currLabel(pref.currency) }}</text>
            </view>
          </view>
          <picker mode="selector" :range="CURR_KEYS" :value="currIndex" @change="onCurrPick">
            <view class="pick-inline">
              <text class="t-body-sm">{{ pref.currency }}</text>
              <mz-icon name="expand_more" :size="16" color="#64748B" />
            </view>
          </picker>
        </view>

        <view class="pref">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="volume_up" :size="18" color="#0E7490" />
            <view class="col">
              <text class="t-body-sm">记账完成触感与音效</text>
              <text class="t-label-sm c-secondary">键盘录入微反馈</text>
            </view>
          </view>
          <switch :checked="pref.soundEnabled" color="#0F766E" @change="onSoundChange" />
        </view>

        <view class="pref pref-off">
          <view class="row items-center gap-2 flex-1">
            <mz-icon name="cloud_sync" :size="18" color="#94A3B8" />
            <view class="col">
              <text class="t-body-sm c-secondary">自动备份</text>
              <text class="t-label-sm c-tertiary">尚未开放</text>
            </view>
          </view>
          <switch :checked="false" disabled />
        </view>
      </view>

      <!-- ===== 预警阈值 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-2">
          <view class="mini-tile"><mz-icon name="warning" :size="20" color="#0F766E" /></view>
          <text class="t-label">预算预警阈值</text>
        </view>
        <text class="t-body-sm c-secondary lead">{{ budgetHint }}</text>

        <view class="thr">
          <view class="between">
            <view class="row items-center gap-2">
              <view class="dot dot-warn"></view>
              <text class="t-label">黄色注意预警阈值</text>
            </view>
            <text class="tnum bold">{{ yellow }}%</text>
          </view>
          <slider
            class="slider"
            :value="yellow"
            :min="50"
            :max="95"
            :disabled="!hasBudget"
            activeColor="#F59E0B"
            block-size="18"
            @change="onYellow"
          />
          <view class="between">
            <text class="t-label-sm c-tertiary">50%</text>
            <text class="t-label-sm c-tertiary">95%</text>
          </view>
          <text class="t-body-sm c-secondary">月度或分类支出进度达到该比例时，渗透条呈现琥珀黄警示。</text>
        </view>

        <view class="thr">
          <view class="between">
            <view class="row items-center gap-2">
              <view class="dot dot-danger"></view>
              <text class="t-label">红色超支临界警戒线</text>
            </view>
            <text class="tnum bold c-danger">{{ red }}%</text>
          </view>
          <slider
            class="slider"
            :value="red"
            :min="90"
            :max="120"
            :disabled="!hasBudget"
            activeColor="#E11D48"
            block-size="18"
            @change="onRed"
          />
          <view class="between">
            <text class="t-label-sm c-tertiary">90%</text>
            <text class="t-label-sm c-tertiary">120%</text>
          </view>
          <text class="t-body-sm c-secondary">达到该阈值触发穿透告警，并在记账时显示预算已击穿警示。</text>
        </view>

        <view v-if="!hasBudget" class="warn-inline">
          <mz-icon name="error_outline" :size="16" color="#B45309" />
          <text class="t-label-sm c-warn">本月尚未设置预算，预警阈值暂不可调。</text>
        </view>
      </view>

      <!-- ===== 底部保存条 ===== -->
      <view class="save-bar">
        <view class="row items-center gap-2 flex-1">
          <mz-icon :name="dirty ? 'edit' : 'check_circle'" :size="18" :color="dirty ? '#B45309' : '#0F766E'" />
          <text class="t-label-sm" :class="dirty ? 'c-warn' : 'c-secondary'">{{ statusText }}</text>
        </view>
        <view class="mz-btn mz-btn-sm mz-btn-ghost" @tap="discard">放弃未保存项</view>
        <view
          class="mz-btn mz-btn-sm mz-btn-primary"
          :class="{ 'mz-btn-disabled': !dirty }"
          @tap="save"
        >保存设置</view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 通用偏好 + 预算预警阈值（浏览器版 21-settings-index.html 的 loadPreferences 区块，
 * 见 settings-page.js:210-295）。
 *
 * 浏览器版把这两块拆在同一页的两张卡里，用一条底部浮条统一保存与放弃。
 * 这里保持「一次保存、可整批放弃」的语义 —— 因为语言/币种属于偏好表，
 * 阈值属于预算表，分两次提交会让用户看到「保存了一半」的中间态。
 *
 * 四条照搬的规则：
 *   1. 阈值控件在「本月无预算」时禁用，值退回默认 80 / 100 —— 没预算就没有可调的基准。
 *   2. 未改动时保存按钮不可点（浏览器版是 disabled 属性）。
 *   3. 红色阈值必须大于黄色，否则前端拦下不发请求（服务端也有 CHECK，但先拦省一次往返）。
 *   4. 保存偏好总是发；保存预算只在 hasBudget 时发 —— 无预算时 PUT /budget 会凭空造一个月度预算。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { invalidateMeta, currentPeriod } from '@/common/store'
import { toast } from '@/common/ui'

const LANG_KEYS = ['zh-CN', 'en-US', 'zh-TW']
const LANG_LABELS = {
  'zh-CN': '简体中文 (zh-CN)',
  'en-US': 'English (US)',
  'zh-TW': '繁體中文 (zh-TW)',
}
const CURR_KEYS = ['CNY', 'USD', 'EUR', 'HKD']
const CURR_LABELS = {
  CNY: '人民币 (CNY ¥)',
  USD: '美元 (USD $)',
  EUR: '欧元 (EUR €)',
  HKD: '港币 (HKD HK$)',
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      LANG_KEYS,
      CURR_KEYS,
      pref: { language: 'zh-CN', currency: 'CNY', soundEnabled: false },
      budget: { hasBudget: false, period: currentPeriod() },
      yellow: 80,
      red: 100,
      dirty: false,
      busy: false,
    }
  },
  computed: {
    hasBudget() {
      return !!this.budget.hasBudget
    },
    langIndex() {
      const i = LANG_KEYS.indexOf(this.pref.language)
      return i < 0 ? 0 : i
    },
    currIndex() {
      const i = CURR_KEYS.indexOf(this.pref.currency)
      return i < 0 ? 0 : i
    },
    budgetHint() {
      return this.hasBudget
        ? '本月预算已设置，阈值改动将与预算参数一起写入服务端。'
        : '本月尚未设置预算，预警阈值请先到预算页配置。'
    },
    statusText() {
      if (this.busy) return '正在保存…'
      return this.dirty ? '有尚未保存的设置' : this.hasBudget
        ? '偏好与本月预算预警参数已同步到服务端'
        : '通用偏好可保存；本月尚未设置预算，预警阈值请先到预算页配置'
    },
  },
  onLoad() {
    this.load()
  },
  methods: {
    langLabel(k) {
      return LANG_LABELS[k] || LANG_LABELS['zh-CN']
    },
    currLabel(k) {
      return CURR_LABELS[k] || CURR_LABELS.CNY
    },
    load() {
      const self = this
      const period = currentPeriod()
      return Promise.all([
        api.get('/settings/preferences'),
        api.get('/budget', { period: period }, { silent: true }).catch(function () {
          return { hasBudget: false, period: period }
        }),
      ])
        .then(function (r) {
          self.applyState(r[0] || {}, r[1] || {})
        })
        .catch(function () {})
    },
    /** 把服务端状态铺到控件上。放弃未保存项时也走这里 —— 一份状态两个用途。 */
    applyState(preferences, budget) {
      this.pref = {
        language: preferences.language || 'zh-CN',
        currency: preferences.currency || 'CNY',
        soundEnabled: !!preferences.soundEnabled,
      }
      this.budget = budget || {}
      this.yellow = budget && budget.hasBudget ? Number(budget.alertYellowPct) : 80
      this.red = budget && budget.hasBudget ? Number(budget.alertRedPct) : 100
      this.dirty = false
      this.busy = false
    },
    markDirty() {
      this.dirty = true
    },
    onLangPick(e) {
      const k = LANG_KEYS[Number(e.detail.value)]
      if (k) {
        this.pref.language = k
        this.markDirty()
      }
    },
    onCurrPick(e) {
      const k = CURR_KEYS[Number(e.detail.value)]
      if (k) {
        this.pref.currency = k
        this.markDirty()
      }
    },
    onSoundChange(e) {
      this.pref.soundEnabled = !!e.detail.value
      this.markDirty()
    },
    onYellow(e) {
      this.yellow = Number(e.detail.value)
      this.markDirty()
    },
    onRed(e) {
      this.red = Number(e.detail.value)
      this.markDirty()
    },
    discard() {
      if (!this.dirty) return
      // 重新拉一次而不是回滚本地快照：别的设备改过的值也能一并同步回来
      this.load().then(function () {
        toast('未保存的设置已放弃', 'info')
      })
    },
    save() {
      const self = this
      if (!this.dirty || this.busy) return
      if (this.hasBudget && this.red <= this.yellow) {
        toast('红色阈值必须大于黄色阈值', 'error')
        return
      }
      this.busy = true

      const requests = [
        api.put('/settings/preferences', {
          language: this.pref.language,
          currency: this.pref.currency,
          soundEnabled: this.pref.soundEnabled,
        }),
      ]
      if (this.hasBudget) {
        requests.push(
          api.put('/budget', {
            period: this.budget.period || currentPeriod(),
            totalAmount: this.budget.totalAmount,
            alertYellowPct: this.yellow,
            alertRedPct: this.red,
            safeSpendMode: 'daily_flat',
          })
        )
      }

      Promise.all(requests)
        .then(function (saved) {
          // PUT /budget 的响应体是否带 hasBudget / period / totalAmount 没有契约保证，
          // 缺字段时按旧值补上 —— 否则阈值控件会因为 hasBudget 变 false 而禁用回默认值。
          const nextBudget = Object.assign({}, self.budget, saved[1] || {})
          self.applyState(saved[0] || self.pref, nextBudget)
          invalidateMeta()
          toast('设置已保存', 'success')
        })
        .catch(function () {
          self.busy = false
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

.mini-tile {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-primary-container));
}

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
.pick-inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 16rpx;
  border-radius: 14rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}

/* 阈值 */
.thr {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.slider { margin: 8rpx 0; }
.dot { width: 14rpx; height: 14rpx; border-radius: 9999rpx; flex-shrink: 0; }
.dot-warn { background-color: var(--warning); }
.dot-danger { background-color: var(--danger); }

.warn-inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
  margin-top: 20rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  background-color: var(--warning-bg);
}

/* 底部保存条 */
.save-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier2);
  margin-bottom: 24rpx;
}
</style>
