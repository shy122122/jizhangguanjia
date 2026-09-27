<template>
  <mz-page title="数据与隐私">
    <view class="page">
      <!-- ===== 页头 ===== -->
      <view class="intro">
        <view class="row items-center gap-2 crumb">
          <text class="t-label-sm c-secondary">系统设置</text>
          <mz-icon name="chevron_right" :size="14" color="#94A3B8" />
          <text class="t-label-sm c-primary">数据安全与账号存储</text>
        </view>
        <text class="t-h1">个人中心与系统设置</text>
        <text class="t-body-sm c-secondary lead">管理账号数据与永久注销</text>
        <view class="pill">
          <mz-icon name="gavel" :size="15" color="#0F766E" />
          <text class="t-label-sm">账本权限隔离 · 可永久注销</text>
        </view>
      </view>

      <!-- ===== 当前账号数据存储 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-2">
          <view class="mini-tile">
            <mz-icon name="shield_locked" :size="22" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="t-h3">当前账号数据存储</text>
            <text class="t-body-sm c-secondary">MySQL 服务端存储 / 账本级权限隔离</text>
          </view>
        </view>

        <view class="kv-box">
          <view class="kv">
            <text class="c-secondary">登录凭据保护</text>
            <text class="bold">bcrypt cost=10 · JWT 可吊销</text>
          </view>
          <view class="kv">
            <text class="c-secondary">有效流水</text>
            <text class="tnum bold">{{ data.txnCount || 0 }} 条</text>
          </view>
          <view class="kv">
            <text class="c-secondary">导入批次</text>
            <text class="tnum bold">{{ data.importBatchCount || 0 }} 批</text>
          </view>
        </view>
      </view>

      <!-- ===== 主权声明 ===== -->
      <view class="mz-card">
        <text class="t-label">离线数据主权保障声明</text>
        <text class="t-body-sm c-secondary lead">
          明账将账号与账本数据存储在服务端数据库中；受保护接口每次校验登录令牌，业务查询按账本 ID 隔离。导出的 JSON 数据镜像由您自行保管。
        </text>
      </view>

      <!-- ===== 冷备份 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-2">
          <view class="mini-tile">
            <mz-icon name="file_download" :size="22" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="t-h3">全量镜像冷备份</text>
            <text class="t-body-sm c-secondary">
              导出账户、分类、预算、流水、导入记录、个人资料与头像的完整镜像
            </text>
          </view>
        </view>
        <view class="mz-btn mz-btn-ghost mz-btn-block" @tap="exportInert">导出快照</view>
      </view>

      <!-- ===== 危险区 ===== -->
      <view class="mz-card danger-zone">
        <view class="row items-center gap-2">
          <mz-icon name="warning" :size="20" color="#E11D48" />
          <text class="t-label c-danger">高危操作区 · DANGER ZONE</text>
        </view>
        <text class="t-h3">永久删除账号与全部个人账本</text>
        <text class="t-body-sm c-secondary lead">
          从服务端永久删除账号拥有的流水、账户、分类、预算、导入记录与个人资料。操作不可撤销。
        </text>
        <view
          class="mz-btn mz-btn-block"
          :class="isDemoAccount ? 'mz-btn-disabled' : 'mz-btn-danger-solid'"
          @tap="openModal"
        >
          {{ isDemoAccount ? '演示账号不可注销' : '申请彻底抹除' }}
        </view>
      </view>
    </view>

    <!-- ===== 全屏确认浮层 ===== -->
    <view v-if="modal" class="mask">
      <scroll-view class="sheet" scroll-y>
        <view class="alert-bar"></view>

        <view class="sheet-body">
          <view class="col center gap-2 hero">
            <view class="warn-badge">
              <mz-icon name="warning" :size="38" color="#E11D48" filled />
            </view>
            <view class="risk-pill">
              <view class="dot dot-danger dot-pulse"></view>
              <text class="t-label-sm c-danger bold">不可逆极危操作 · 立即生效</text>
            </view>
            <text class="t-h3 center-text">您正在申请永久删除账号与全部账本数据</text>
            <text class="t-body-sm c-secondary center-text">
              提交后，服务端会在一个数据库事务中删除个人账本及账号；一旦完成，历史记录无法恢复。
            </text>
          </view>

          <!-- 影响清单 -->
          <view class="impact">
            <view class="between">
              <view class="row items-center gap-2">
                <mz-icon name="inventory_2" :size="16" color="#E11D48" />
                <text class="t-label c-danger">受影响且不可逆的账号数据清单</text>
              </view>
              <view class="chip chip-danger"><text>4 项关键资源</text></view>
            </view>
            <view class="impact-list">
              <view v-for="it in IMPACTS" :key="it.title" class="impact-item">
                <view class="impact-dot">
                  <mz-icon :name="it.icon" :size="14" color="#E11D48" />
                </view>
                <view class="col flex-1">
                  <text class="t-body-sm bold">{{ it.title }}</text>
                  <text class="t-label-sm c-secondary">{{ it.note }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 备份建议 -->
          <view class="backup-tip">
            <view class="row items-center gap-2 flex-1">
              <mz-icon name="verified" :size="20" color="#0F766E" />
              <view class="col flex-1">
                <text class="t-label">强烈建议在抹除前执行冷备份</text>
                <text class="t-label-sm c-primary">先导出完整数据镜像，并确认文件已妥善保存</text>
              </view>
            </view>
            <view class="mz-btn mz-btn-sm mz-btn-ghost" @tap="exportInert">去备份</view>
          </view>

          <!-- 安全短语 -->
          <view class="field">
            <view class="between">
              <text class="t-label">
                为确保为本人知情操作，请准确输入
                <text class="phrase">DELETE</text>
              </text>
              <text class="t-label-sm" :class="counterTone">{{ counterText }}</text>
            </view>
            <view class="input-box">
              <mz-icon name="lock" :size="20" color="#94A3B8" />
              <input
                v-model="phrase"
                class="phrase-input"
                type="text"
                :maxlength="6"
                placeholder="在此输入 DELETE"
                placeholder-class="ph"
                @input="onPhrase"
              />
              <view class="verify-pill" :class="{ 'verify-ok': matched }">
                <mz-icon :name="matched ? 'check_circle' : 'progress_activity'" :size="13" :color="matched ? '#0F766E' : '#94A3B8'" />
                <text>{{ matched ? '6 / 6 OK' : phrase.length + ' / 6' }}</text>
              </view>
            </view>
            <view class="row items-center gap-2">
              <mz-icon name="info" :size="14" color="#94A3B8" />
              <text class="t-label-sm c-secondary">大小写敏感，输入完全一致后方可解锁删除按钮</text>
            </view>
          </view>

          <!-- 密码 -->
          <view class="field">
            <text class="t-label">再次输入当前密码</text>
            <view class="input-box">
              <mz-icon name="password" :size="20" color="#94A3B8" />
              <input
                v-model="password"
                class="phrase-input"
                type="password"
                placeholder="当前登录密码"
                placeholder-class="ph"
                @input="onPassword"
              />
            </view>
          </view>

          <view class="sheet-acts">
            <view class="mz-btn mz-btn-ghost flex-1" @tap="closeModal">
              <mz-icon name="close" :size="16" color="#0F766E" />
              <text>我再想想 / 取消</text>
            </view>
            <view
              class="mz-btn flex-1"
              :class="canDestroy ? 'mz-btn-danger-solid' : 'mz-btn-disabled'"
              @tap="destroy"
            >
              <mz-icon :name="canDestroy ? 'delete_forever' : 'lock'" :size="16" :color="canDestroy ? '#FFFFFF' : '#94A3B8'" />
              <text>{{ busy ? '正在永久删除…' : '确认永久粉碎清空' }}</text>
            </view>
          </view>
        </view>

        <view class="stamp">
          <view class="row items-center gap-2">
            <view class="dot dot-danger"></view>
            <text class="t-label-sm">SESSION-ID: {{ sessionId }}</text>
          </view>
          <text class="t-label-sm">账号数据永久删除确认 · 操作不可逆</text>
        </view>
      </scroll-view>
    </view>
  </mz-page>
</template>

<script>
/* 数据与隐私 · 永久注销（浏览器版 23-settings-privacy.html）。
 *
 * 浏览器版把底下的设置页做成模糊背景，顶层压一个全屏确认模态框。
 * 手机上不必假装「背后还有一页」，所以拆开：正文是真实的数据/隐私说明卡，
 * 「申请彻底抹除」再拉起确认浮层 —— 校验规则、影响清单、按钮解锁时机都照原样。
 *
 * 一处刻意的偏差：浏览器版给短语输入框加了 text-transform:uppercase，于是
 * 用户敲小写 "delete" 时**看到**的是 DELETE、校验却判不匹配，很容易误以为是坏了。
 * 小程序的原生输入框对 text-transform 支持也不稳，这里干脆不加，
 * 只保留「必须精确输入全大写 DELETE」这条真实规则。
 *
 * 导出快照按交付要求（不要导出功能）改成说明性提示。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { session, meta } from '@/common/store'
import { toast } from '@/common/ui'

const TARGET = 'DELETE'

const IMPACTS = [
  {
    icon: 'delete_forever',
    title: '服务端存储的全部收支流水将被永久删除',
    note: '包含时间戳、定位标签、票据附件及交易商户名称',
  },
  {
    icon: 'link_off',
    title: '微信、支付宝及银行卡账户资产结余将被解绑重置',
    note: '删除个人账本下的全部资金账户、分类及初始余额配置',
  },
  {
    icon: 'analytics',
    title: '自定义分类、月度预算配置及「今日可花」演算历史全部清除',
    note: '所有的财务健康评级曲线与趋势穿透报告将归零销毁',
  },
  {
    icon: 'key_off',
    title: '登录凭据、个人资料与服务端会话版本一并删除',
    note: '删除完成后，系统不提供恢复入口',
  },
]

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      IMPACTS,
      data: {},
      modal: false,
      phrase: '',
      password: '',
      busy: false,
    }
  },
  computed: {
    isDemoAccount() {
      const email = session.user && session.user.email
      return String(email || '').trim().toLowerCase() === 'demo@mingzhang.app'
    },
    matched() {
      return this.phrase.trim() === TARGET
    },
    canDestroy() {
      return !this.isDemoAccount && this.matched && this.password.length > 0 && !this.busy
    },
    counterText() {
      if (this.matched) {
        return this.password.length ? '验证已通过，安全锁定已解除' : '确认短语正确，请输入当前密码'
      }
      const val = this.phrase.trim()
      const remain = TARGET.length - val.length
      if (remain > 0 && TARGET.indexOf(val) === 0) return '尚需匹配 ' + remain + ' 个字符'
      return '字符不匹配，请确认为全大写 DELETE'
    },
    counterTone() {
      if (this.matched) return this.password.length ? 'c-primary bold' : 'c-secondary'
      return 'c-danger'
    },
    sessionId() {
      const id = (session.ledger && session.ledger.id) || 0
      return '#CLARITY-DTR-' + String(id).padStart(4, '0') + '-HK'
    },
  },
  onLoad() {
    this.load()
  },
  methods: {
    load() {
      const self = this
      return meta()
        .then(function () {
          return api.get('/settings/data')
        })
        .then(function (data) {
          self.data = data || {}
        })
        .catch(function () {})
    },
    onPhrase() {
      // uni 的 maxlength 在部分端不裁，这里自己兜住 6 位
      const v = String(this.phrase || '').slice(0, 6)
      if (v !== this.phrase) this.phrase = v
    },
    onPassword() {
      /* input 事件触发重新计算按钮态，v-model 已处理值的更新 */
    },
    openModal() {
      if (this.isDemoAccount) {
        toast('公共演示账号不可永久注销', 'info')
        return
      }
      this.phrase = ''
      this.password = ''
      this.busy = false
      this.modal = true
    },
    closeModal() {
      this.modal = false
    },
    exportInert() {
      toast('本 App 不提供导出功能', 'info')
    },
    destroy() {
      const self = this
      if (!this.canDestroy) return
      this.busy = true
      api
        .del(
          '/auth/account',
          { confirmText: this.phrase.trim(), password: this.password },
          { silent: true, redirectOn401: false }
        )
        .then(function () {
          api.clearSession()
          session.user = null
          session.ledger = null
          toast('账号与全部账本数据已永久删除', 'success')
          setTimeout(function () {
            uni.reLaunch({ url: '/pages/onboarding/landing?deleted=1' })
          }, 600)
        })
        .catch(function (err) {
          self.busy = false
          toast((err && err.message) || '账号删除失败', 'error')
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
.crumb { gap: 4rpx; }
.lead { display: block; line-height: 1.7; margin-top: 8rpx; }
.pill {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  align-self: flex-start;
  margin-top: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: 14rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.mini-tile {
  width: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-primary-container));
}
.kv-box {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.kv {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  font-size: 25rpx;
}
.chip {
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
  color: var(--text-secondary);
}
.chip-danger { background-color: var(--danger-bg); color: var(--danger); }

.dot { width: 14rpx; height: 14rpx; border-radius: 9999rpx; flex-shrink: 0; }
.dot-danger { background-color: var(--danger); }
.dot-pulse { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  background-color: var(--danger-bg);
}

/* ===== 确认浮层 ===== */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 130;
  background-color: rgba(11, 19, 41, 0.7);
}
.sheet {
  height: 100%;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.alert-bar {
  height: 8rpx;
  background: linear-gradient(90deg, var(--danger), #FB7185, var(--danger));
}
.sheet-body { padding: 32rpx 28rpx; }

.hero { gap: 16rpx; padding-top: 8rpx; }
.warn-badge {
  width: 128rpx;
  height: 128rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--danger-bg);
}
.risk-pill {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 20rpx;
  border-radius: 9999rpx;
  background-color: var(--danger-bg);
}
.center-text { text-align: center; }
.bold { font-weight: 700; }

.impact {
  margin-top: 32rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background-color: var(--danger-bg);
}
.impact-list { display: flex; flex-direction: column; gap: 14rpx; margin-top: 20rpx; }
.impact-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 14rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.impact-dot {
  width: 36rpx;
  height: 36rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--danger-bg);
}

.backup-tip {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-primary-container));
}
.field { display: flex; flex-direction: column; gap: 12rpx; margin-top: 28rpx; }
.phrase {
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  font-weight: 700;
  color: var(--danger);
  background-color: var(--danger-bg);
}
.input-box {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.phrase-input {
  flex: 1;
  min-width: 0;
  height: 56rpx;
  font-size: 30rpx;
  letter-spacing: 4rpx;
  color: var(--danger);
  background-color: transparent;
}
.ph { font-size: 26rpx; letter-spacing: 0; color: var(--text-tertiary); }
.verify-pill {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
  color: var(--text-tertiary);
}
.verify-ok { background-color: rgb(var(--mz-primary-container)); color: var(--brand-700); font-weight: 700; }

.sheet-acts {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  margin-top: 36rpx;
}

.stamp {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 28rpx;
  background-color: rgb(var(--mz-surface-container-low));
  color: var(--text-tertiary);
}
</style>
