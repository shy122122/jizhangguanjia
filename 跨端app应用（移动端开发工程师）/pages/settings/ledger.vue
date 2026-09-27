<template>
  <mz-page title="账本设置">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">设置 · 账本</text>
        <text class="t-h1">编辑账本</text>
        <text class="t-body-sm c-secondary lead">修改后会同步显示在侧边栏和数据导出中。</text>
      </view>

      <view class="mz-card">
        <view class="field">
          <view class="between">
            <text class="t-label">账本名称</text>
            <text class="t-label-sm c-tertiary">{{ form.name.length }} / 50</text>
          </view>
          <input
            v-model="form.name"
            class="mz-input"
            type="text"
            :maxlength="50"
            placeholder="请输入账本名称"
            placeholder-class="ph"
          />
        </view>

        <view class="mz-btn mz-btn-primary mz-btn-block" :class="{ 'is-busy': busy }" @tap="save">
          <mz-icon name="check" :size="18" color="#FFFFFF" />
          <text>保存名称</text>
        </view>
      </view>

      <view class="mz-card">
        <view class="row items-center gap-2">
          <view class="mini-tile"><mz-icon name="book" :size="20" color="#0F766E" /></view>
          <text class="t-label">账本信息</text>
          <view class="chip chip-brand"><text>私有独享</text></view>
        </view>

        <view class="info-row">
          <text class="t-body-sm c-secondary">账本 ID</text>
          <text class="t-body-sm tnum">#{{ ledgerId }}</text>
        </view>
        <view class="info-row">
          <text class="t-body-sm c-secondary">创建日期</text>
          <text class="t-body-sm tnum">{{ createdAt }}</text>
        </view>
        <view class="info-row">
          <text class="t-body-sm c-secondary">有效流水</text>
          <text class="t-body-sm tnum">{{ txnCount }} 条</text>
        </view>
        <view class="info-row">
          <text class="t-body-sm c-secondary">数据隔离</text>
          <text class="t-body-sm">按 ledger_id 独立存储</text>
        </view>
      </view>

      <view class="hint">
        <mz-icon name="info" :size="15" color="#64748B" />
        <text class="t-label-sm c-secondary lead">
          底层数据模型已按多租户账本预留，未来可扩容为「情侣账本」与「家庭多成员协同账本」。
        </text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 账本设置（浏览器版 21-settings-index.html 的 openLedgerEditor，见 settings-page.js:105）。
 *
 * 浏览器版把「编辑账本名称」做成模态框，输入框里预填 context.ledger.name，
 * 提交 PUT /settings/ledgers/:id 后就地改侧边栏文字。手机上换成独立页：
 * 一个输入框 + 一个信息卡，动作与语义完全一致。
 *
 * 保存成功后要做三件事，缺一件首页就会显示旧名字：
 *   session.ledger.name 更新 → api.setSession 持久化 → invalidateMeta 让缓存失效
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { session, meta, invalidateMeta } from '@/common/store'
import { toast } from '@/common/ui'

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      form: { name: '' },
      busy: false,
      txnCount: 0,
      createdAt: '—',
    }
  },
  computed: {
    ledgerId() {
      return (session.ledger && session.ledger.id) || '—'
    },
  },
  onLoad() {
    this.form.name = (session.ledger && session.ledger.name) || ''
    this.load()
  },
  methods: {
    load() {
      const self = this
      return meta()
        .then(function () {
          // 账本的创建日期只在这里出现，bootstrap 里没有，所以单独取一次
          return Promise.all([
            api.get('/settings/ledgers'),
            api.get('/settings/data', {}, { silent: true }).catch(function () {
              return {}
            }),
          ])
        })
        .then(function (r) {
          const list = r[0] || []
          const id = session.ledger && session.ledger.id
          const cur =
            list.filter(function (x) {
              return x.id === id
            })[0] || list[0]
          self.createdAt = cur && cur.createdAt ? String(cur.createdAt).slice(0, 10) : '—'
          self.txnCount = (r[1] && r[1].txnCount) || 0
          if (cur && cur.name) self.form.name = cur.name
        })
        .catch(function () {})
    },
    save() {
      const self = this
      const name = String(this.form.name || '').trim()
      if (!name) {
        toast('请输入账本名称', 'error')
        return
      }
      if (this.busy) return
      this.busy = true
      api
        .put('/settings/ledgers/' + this.ledgerId, { name: name })
        .then(function (updated) {
          // 侧边栏 / 首页读的是 session，不是这个页面自己的 data
          if (session.ledger) session.ledger.name = (updated && updated.name) || name
          api.setSession({ token: api.getToken(), user: session.user, ledger: session.ledger })
          invalidateMeta()
          toast('账本名称已更新', 'success')
          setTimeout(function () {
            uni.navigateBack()
          }, 400)
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

.field { display: flex; flex-direction: column; gap: 12rpx; }
.ph { color: var(--text-tertiary); }

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

.info-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--border);
}
.info-row:first-of-type { margin-top: 24rpx; }

.hint {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}

.is-busy { opacity: 0.6; }
</style>
