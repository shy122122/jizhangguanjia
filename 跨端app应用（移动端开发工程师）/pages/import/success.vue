<template>
  <mz-page title="导入历史">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">数据管理</text>
        <text class="t-h1">导入历史</text>
        <text class="t-body-sm c-secondary lead">
          导入后 10 分钟内可撤销；撤销只移除本批次流水，不影响其他账目。
        </text>
      </view>

      <view v-if="loading" class="skeleton">
        <view v-for="n in 3" :key="n" class="sk-line"></view>
      </view>

      <template v-else>
        <!-- ===== 最近批次 ===== -->
        <view v-if="batch" class="mz-card">
          <view class="row items-center gap-2">
            <mz-icon
              :name="batch.status === 'reverted' ? 'published_with_changes' : 'check_circle'"
              :size="24"
              :color="batch.status === 'reverted' ? '#64748B' : '#0F766E'"
            />
            <text class="t-h3">{{ batch.status === 'reverted' ? '最近批次已撤销' : '最近批次已完成' }}</text>
          </view>

          <text class="t-body-md batch-line">
            <text class="bold">{{ batch.batchNo }}</text>
            <text> · 入账 {{ batch.importedCount }} 笔 · 跳过 {{ batch.skippedCount }} 笔</text>
          </text>
          <text class="t-body-sm c-secondary batch-sub">
            创建于 {{ batch.createdAt }}<text v-if="batch.canUndo"> · 撤销剩余 <text class="tnum bold">{{ countdown }}</text></text>
          </text>

          <view class="acts">
            <view
              v-if="batch.canUndo"
              class="mz-btn"
              :class="canUndoNow ? 'mz-btn-danger' : 'mz-btn-ghost'"
              @tap="undoBatch"
            >撤销本批次</view>
            <view class="mz-btn mz-btn-ghost" @tap="goContinue">继续导入</view>
            <view class="mz-btn mz-btn-primary" @tap="goLedger">查看流水</view>
          </view>
        </view>

        <view v-else class="mz-card blank">
          <mz-icon name="inventory_2" :size="40" color="#64748B" />
          <text class="blank-text">还没有导入记录</text>
          <view class="mz-btn mz-btn-primary" @tap="goContinue">去导入</view>
        </view>

        <!-- ===== 全部批次 ===== -->
        <view class="mz-card">
          <text class="t-h3">全部批次</text>
          <view v-if="list.length" class="batches">
            <view v-for="b in list" :key="b.id" class="batch">
              <view class="col flex-1 batch-main">
                <text class="batch-no ellipsis">{{ b.batchNo }}</text>
                <text class="batch-meta ellipsis">
                  {{ b.createdAt }} · {{ b.source === 'import_csv' ? '文件导入' : '文本导入' }}
                </text>
              </view>
              <view class="col batch-right">
                <text class="batch-count">入账 {{ b.importedCount }} 笔</text>
                <text class="status" :class="b.status === 'reverted' ? 'status-off' : 'status-on'">
                  {{ b.status === 'reverted' ? '已撤销' : '已完成' }}
                </text>
              </view>
            </view>
          </view>
          <view v-else class="inline-empty">
            <text>暂无批次</text>
          </view>
        </view>
      </template>
    </view>
  </mz-page>
</template>

<script>
/* 导入成功与撤销（浏览器版 19-import-success.html）。
 *
 * 浏览器版这个 HTML 里有一整张写死样本数据的批次表，但 import-pages.js 的
 * bindSuccess() 会把 main.innerHTML 整体换掉（撤销后再调一次自己重画）——
 * 所以真正跑起来的是 bindSuccess 那版，这里照它实现。
 *
 * 一个和浏览器版不同的地方：倒计时的到期时刻解析。浏览器用
 * `new Date('2026-09-26 10:00:00' + '+08:00')`，这个字符串在部分 iOS 内核上
 * 会解析成 Invalid Date（倒计时直接变 NaN）。这里改成手工拆字段用 Date.UTC 算，
 * 三端结果一致。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { toast, confirm } from '@/common/ui'

const SOURCE_TEXT = { import_csv: '文件导入', import_text: '文本导入' }

/** 'YYYY-MM-DD HH:MM:SS' 按 UTC+8 墙上时间转成时间戳 */
function parseUtc8(s) {
  const m = String(s == null ? '' : s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 8, Number(m[5]), Number(m[6] || 0))
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      SOURCE_TEXT,
      loading: true,
      batch: null,
      list: [],
      wanted: null,
      seconds: 0,
      timer: null,
    }
  },
  computed: {
    countdown() {
      const s = Math.max(0, this.seconds)
      const mm = String(Math.floor(s / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      return mm + ':' + ss
    },
    canUndoNow() {
      const b = this.batch
      return !!(b && b.canUndo && b.status === 'completed' && this.seconds > 0)
    },
  },
  onLoad(query) {
    const n = Number(query && query.batch)
    this.wanted = isFinite(n) && n > 0 ? n : null
    this.load()
  },
  onUnload() {
    this.clearTimer()
  },
  methods: {
    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },
    tick() {
      const b = this.batch
      if (!b) return
      const at = parseUtc8(b.undoExpiresAt)
      if (!isFinite(at)) {
        this.seconds = 0
        return
      }
      this.seconds = Math.max(0, Math.floor((at - Date.now()) / 1000))
      if (!this.seconds) this.clearTimer()
    },
    load() {
      const self = this
      return api
        .get('/import/batches', { page: 1, pageSize: 50 }, { raw: true })
        .then(function (result) {
          const list = result.data || []
          self.list = list
          self.batch =
            list.filter(function (x) {
              return x.id === self.wanted
            })[0] || list[0] || null
          self.loading = false

          self.clearTimer()
          if (self.batch) {
            self.tick()
            self.timer = setInterval(self.tick, 1000)
          }
        })
        .catch(function (err) {
          self.loading = false
          if (err && err.message) toast(err.message, 'error')
        })
    },
    undoBatch() {
      const self = this
      const b = this.batch
      if (!b || !this.canUndoNow) return
      confirm('确认撤销本次导入？本批次流水将从账本中移除。', {
        title: '撤销导入',
        confirmText: '确认撤销',
        danger: true,
      }).then(function (ok) {
        if (!ok) return
        api.post('/import/batches/' + b.id + '/undo', {}).then(function (data) {
          toast('已撤销 ' + data.revertedCount + ' 笔导入流水', 'success')
          self.load()
        })
      })
    },
    goContinue() {
      uni.redirectTo({ url: '/pages/import/main' })
    },
    goLedger() {
      // 流水是底部 Tab 之一，只能走 switchTab
      uni.switchTab({ url: '/pages/ledger/list' })
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
.lead { line-height: 1.6; }

.batch-line { display: block; margin-top: 20rpx; color: var(--text-primary); }
.batch-sub { display: block; margin-top: 8rpx; }

.acts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 28rpx;
}
.acts .mz-btn { flex: 1; min-width: 200rpx; }

.blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 100rpx 40rpx;
}
.blank-text { font-size: 28rpx; color: var(--text-secondary); }

.batches { margin-top: 20rpx; display: flex; flex-direction: column; }
.batch {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.batch:last-child { border-bottom: none; }
.batch-main { flex: 1; min-width: 0; gap: 8rpx; }
.batch-no { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.batch-meta { font-size: 22rpx; color: var(--text-secondary); }
.batch-right { align-items: flex-end; gap: 8rpx; flex-shrink: 0; }
.batch-count { font-size: 24rpx; color: var(--text-primary); }
.status {
  padding: 4rpx 16rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
}
.status-on { background-color: rgb(var(--mz-primary-container)); color: var(--brand-700); }
.status-off { background-color: rgb(var(--mz-surface-container)); color: var(--text-secondary); }

.inline-empty {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}

.skeleton { display: flex; flex-direction: column; gap: 20rpx; }
.sk-line {
  height: 200rpx;
  border-radius: 28rpx;
  background-color: rgb(var(--mz-surface-container-low));
  animation: sk 1.2s ease-in-out infinite;
}
@keyframes sk {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
