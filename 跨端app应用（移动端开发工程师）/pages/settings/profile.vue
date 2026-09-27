<template>
  <mz-page title="个人资料">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">设置 · 个人资料</text>
        <text class="t-h1">编辑个人资料</text>
        <text class="t-body-sm c-secondary lead">选择本地图片即可上传头像，手机号和邮箱需要验证码换绑。</text>
      </view>

      <!-- ===== 头像 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-3">
          <image v-if="preview" class="avatar" :src="preview" mode="aspectFill" />
          <view v-else class="avatar avatar-fallback">
            <mz-icon name="account_circle" :size="46" color="#0F766E" />
          </view>
          <view class="col flex-1 avatar-side">
            <view class="row gap-2">
              <view class="mz-btn mz-btn-sm" @tap="pickAvatar">
                <mz-icon name="upload" :size="16" color="#0F766E" />
                <text>选择头像图片</text>
              </view>
              <view v-if="hasStoredAvatar" class="mz-btn mz-btn-sm mz-btn-ghost" @tap="removeAvatar">恢复默认</view>
            </view>
            <text class="t-label-sm c-secondary hint-line">支持 JPG、PNG、WebP、GIF，最大 5MB</text>
            <text v-if="picked" class="t-label-sm c-primary hint-line">已选择新头像，保存后生效</text>
          </view>
        </view>
      </view>

      <!-- ===== 昵称 ===== -->
      <view class="mz-card">
        <view class="field">
          <view class="between">
            <text class="t-label">昵称</text>
            <text class="t-label-sm c-tertiary">{{ form.displayName.length }} / 50</text>
          </view>
          <input
            v-model="form.displayName"
            class="mz-input"
            type="text"
            :maxlength="50"
            placeholder="请输入昵称"
            placeholder-class="ph"
          />
        </view>

        <view class="acct-box">
          <view class="info-row">
            <text class="t-body-sm c-secondary">登录账号</text>
            <text class="t-body-sm ellipsis">{{ accountLine }}</text>
          </view>
          <view class="info-row">
            <text class="t-body-sm c-secondary">UID</text>
            <text class="t-body-sm tnum">{{ uid }}</text>
          </view>
        </view>

        <view class="mz-btn mz-btn-primary mz-btn-block" :class="{ 'is-busy': busy }" @tap="save">
          <mz-icon name="check" :size="18" color="#FFFFFF" />
          <text>保存资料</text>
        </view>
      </view>

      <view class="hint">
        <mz-icon name="info" :size="15" color="#64748B" />
        <text class="t-label-sm c-secondary lead">
          手机号与邮箱属于账号凭据，换绑需要验证码校验，因此不能在资料页直接修改。
        </text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 个人资料（浏览器版 21-settings-index.html 的 openProfileEditor，见 settings-page.js:30）。
 *
 * 浏览器版用 <input type="file"> + FormData + API.upload 传头像。uni 里对应的
 * 是 uni.chooseImage + uni.uploadFile —— 已在 common/api.js 里补了 api.upload()，
 * 所以「换头像」这个能力是完整保留的，不是降级成提示。
 *
 * 一处刻意的差异：浏览器版会校验 file.type（image/jpeg 等），uni.chooseImage
 * 在 H5 / App / 小程序三端拿不到可靠的 mime（H5 有 type 字段，小程序只有后缀），
 * 所以这里只校验体积，类型交给服务端把关 —— 少一道校验好过按平台写三份不一致的规则。
 *
 * 保存顺序也不能颠倒：先 PUT 昵称，成功后若有新头像再传文件，
 * 与浏览器版一致（昵称失败就不该浪费一次上传）。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { session, invalidateMeta } from '@/common/store'
import { toast } from '@/common/ui'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      form: { displayName: '' },
      stored: {},          // 服务端当前资料
      picked: '',          // 本地选中的临时文件路径（未上传）
      busy: false,
    }
  },
  computed: {
    preview() {
      // 选了新图就先看新的；没选就看服务端已存的
      return this.picked || this.stored.avatarUrl || ''
    },
    hasStoredAvatar() {
      return !!this.stored.avatarUrl
    },
    uid() {
      return this.stored.uid || (session.user && session.user.uid) || '—'
    },
    accountLine() {
      return this.stored.email || this.stored.phone || '未绑定'
    },
  },
  onLoad() {
    this.form.displayName = (session.user && (session.user.displayName || session.user.nickname)) || ''
    this.load()
  },
  methods: {
    load() {
      const self = this
      return api
        .get('/settings/profile')
        .then(function (profile) {
          self.stored = profile || {}
          self.form.displayName = self.stored.displayName || ''
        })
        .catch(function () {})
    },
    pickAvatar() {
      const self = this
      uni.chooseImage({
        count: 1,
        // original 而不是 compressed：浏览器版发的是原始文件，压缩会让
        // 「超过 5MB 就拒绝」这条规则几乎永远不触发，等于悄悄改了行为。
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success(res) {
          const files = res.tempFiles || []
          const size = files.length && files[0].size
          if (size && size > MAX_AVATAR_BYTES) {
            toast('头像图片不能超过 5MB', 'error')
            return
          }
          self.picked = res.tempFilePaths[0]
        },
      })
    },
    removeAvatar() {
      const self = this
      uni.showModal({
        title: '恢复默认头像',
        content: '将删除服务端已保存的头像，恢复为默认图标。',
        confirmColor: '#E11D48',
        success(res) {
          if (!res.confirm) return
          api
            .del('/settings/avatar')
            .then(function (updated) {
              self.stored = updated || {}
              self.picked = ''
              self.syncSession(updated)
              toast('已恢复默认头像', 'success')
            })
            .catch(function () {})
        },
      })
    },
    /** 资料变了要同步到 session 与元数据缓存，否则首页和导航栏还是旧头像 */
    syncSession(updated) {
      const user = updated || session.user
      session.user = user
      api.setSession({ token: api.getToken(), user: user, ledger: session.ledger })
      invalidateMeta()
    },
    save() {
      const self = this
      const displayName = String(this.form.displayName || '').trim()
      if (!displayName) {
        toast('请输入昵称', 'error')
        return
      }
      if (this.busy) return
      this.busy = true

      api
        .put('/settings/profile', { displayName: displayName })
        .then(function (updated) {
          if (!self.picked) return updated
          // 昵称存住了再传头像，顺序与浏览器版一致
          return api.upload('/settings/avatar', self.picked, { name: 'avatar' }).then(function (after) {
            return after || updated
          })
        })
        .then(function (updated) {
          self.stored = updated || {}
          self.form.displayName = self.stored.displayName || displayName
          self.picked = ''
          self.syncSession(updated)
          toast('个人资料已保存', 'success')
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

.avatar {
  width: 132rpx;
  height: 132rpx;
  border-radius: 9999rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container));
}
.avatar-fallback { display: flex; align-items: center; justify-content: center; }
.avatar-side { gap: 0; min-width: 0; }
.hint-line { display: block; margin-top: 12rpx; line-height: 1.5; }

.field { display: flex; flex-direction: column; gap: 12rpx; }
.ph { color: var(--text-tertiary); }

.acct-box {
  margin-top: 24rpx;
  padding: 4rpx 20rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.info-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 0;
}
.info-row + .info-row { border-top: 1rpx solid var(--border); }

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
