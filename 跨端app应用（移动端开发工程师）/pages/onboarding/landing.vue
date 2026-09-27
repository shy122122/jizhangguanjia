<template>
  <mz-page :navbar="false" :back="false">
    <view class="page">
      <!-- ===== 品牌头 ===== -->
      <view class="brand">
        <view class="logo">
          <mz-icon name="account_balance_wallet" :size="34" color="#0F766E" />
        </view>
        <view class="col flex-1">
          <view class="row items-center gap-2">
            <text class="brand-name">明账</text>
            <text class="ver-chip">v1.0</text>
          </view>
          <text class="t-body-sm c-secondary">全链路智能穿透记账与理性财务系统</text>
        </view>
      </view>

      <!-- ===== 主叙事 ===== -->
      <view class="col gap-1">
        <text class="hero-title">把预算穿透到<text class="hero-accent">每一笔记录里</text></text>
        <text class="t-body-sm c-secondary hero-lead">
          记账的瞬间就知道本月还剩多少。告别盲目消费与月底超支焦虑，重获对个人现金流的理性掌控。
        </text>
      </view>

      <!-- ===== 今日实时动态额度预览 ===== -->
      <view class="quota">
        <view class="row items-center gap-2">
          <mz-icon name="query_stats" :size="18" color="#CCFBF1" />
          <text class="quota-kicker">今日实时动态额度</text>
        </view>

        <view class="row items-baseline gap-2">
          <text class="quota-value tnum">¥86.00</text>
          <text class="quota-unit">/ 今日安全可支配</text>
        </view>

        <view class="health">
          <view class="health-dot"></view>
          <text>预算健康度：优秀</text>
        </view>

        <view class="col gap-2 gauge">
          <view class="between">
            <text class="gauge-note">本月餐饮剩余: ¥1,420 / 3,000</text>
            <text class="gauge-pct">穿透度 52.6%</text>
          </view>
          <view class="gauge-track">
            <view class="gauge-fill"></view>
            <view class="gauge-pulse"></view>
          </view>
          <view class="between">
            <text class="gauge-foot">预演支出: 晚餐 -¥48.00</text>
            <text class="gauge-foot">记录后结余: ¥1,372.00</text>
          </view>
        </view>
      </view>

      <!-- ===== 三大支柱 ===== -->
      <view class="col gap-2">
        <view class="pillar">
          <view class="pillar-tile">
            <mz-icon name="auto_graph" :size="22" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="pillar-title">动态平稳推导</text>
            <text class="t-body-sm c-secondary">根据结余天数自动平摊「今日可花」，彻底告别月底节衣缩食。</text>
          </view>
        </view>
        <view class="pillar">
          <view class="pillar-tile">
            <mz-icon name="speed" :size="22" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="pillar-title">极速预算穿透</text>
            <text class="t-body-sm c-secondary">敲下金额的同时，即时映射分类剩余容量，下意识克制冲动。</text>
          </view>
        </view>
        <view class="pillar">
          <view class="pillar-tile">
            <mz-icon name="security" :size="22" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="pillar-title">数据归你自己</text>
            <text class="t-body-sm c-secondary">账本存在自建数据库里，不进任何第三方模型。</text>
          </view>
        </view>
      </view>

      <!-- ===== 认证卡片 ===== -->
      <view class="mz-card auth">
        <!-- 演示账号 -->
        <view class="demo">
          <view class="row items-center gap-2">
            <mz-icon name="bolt" :size="18" color="#0F766E" />
            <text class="demo-title">一键进入演示账号 (零门槛)</text>
          </view>
          <text class="t-body-sm c-secondary demo-desc">
            用内置演示账号登录，直接查看一本已有示例数据的只读账本；共享演示数据不可修改。
          </text>
          <view class="mz-btn demo-btn" @tap="guestEntry">
            <text>用演示账号进入</text>
            <mz-icon name="arrow_forward" :size="16" />
          </view>
        </view>

        <!-- 分隔 -->
        <view class="divider">
          <view class="divider-line"></view>
          <text class="divider-text">或登录账号开启多端实时云同步</text>
          <view class="divider-line"></view>
        </view>

        <!-- 登录 / 注册 Tab -->
        <view class="tabs">
          <view class="tab" :class="{ on: currentTab === 'login' }" @tap="switchAuthTab('login')">
            <text>账号登录</text>
          </view>
          <view class="tab" :class="{ on: currentTab === 'register' }" @tap="switchAuthTab('register')">
            <text>注册新账号</text>
          </view>
        </view>

        <!-- 验证码 / 密码 二选一 -->
        <view class="sub">
          <view v-if="showPills" class="pills">
            <view class="pill" :class="{ on: subMode === 'sms' }" @tap="switchSubMode('sms')">
              <text>手机验证码登录</text>
            </view>
            <view class="pill" :class="{ on: subMode === 'pwd' }" @tap="switchSubMode('pwd')">
              <text>密码登录</text>
            </view>
          </view>
          <text class="sub-hint">{{ subHint }}</text>
        </view>

        <!-- 表单 -->
        <view class="col gap-3">
          <!-- 手机号 / 账号 -->
          <view class="col gap-1">
            <text class="field-label">{{ phoneLabel }}</text>
            <view class="mz-field">
              <view class="prefix">
                <text>+86</text>
                <mz-icon name="expand_more" :size="16" color="#94A3B8" />
              </view>
              <input
                v-model="phone"
                class="mz-input tnum"
                :type="phoneType"
                :maxlength="phoneMaxlength"
                :placeholder="phonePlaceholder"
                placeholder-class="ph"
              />
              <view v-if="phone" class="icon-btn" @tap="clearPhone">
                <mz-icon name="cancel" :size="18" color="#94A3B8" />
              </view>
            </view>
          </view>

          <!-- 短信验证码 -->
          <view v-if="showSms" class="col gap-1">
            <text class="field-label">短信验证码</text>
            <view class="row gap-2">
              <view class="mz-field flex-1">
                <input
                  v-model="code"
                  class="mz-input tnum"
                  type="number"
                  :maxlength="6"
                  placeholder="请输入 6 位短信验证码"
                  placeholder-class="ph"
                />
              </view>
              <view class="mz-btn code-btn" :class="{ off: smsLeft > 0 }" @tap="sendVerifyCode">
                <text>{{ smsBtnText }}</text>
              </view>
            </view>
          </view>

          <!-- 密码 -->
          <view v-if="showPwd" class="col gap-1">
            <text class="field-label">{{ pwdLabel }}</text>
            <view class="mz-field">
              <input
                v-model="password"
                class="mz-input"
                type="text"
                :password="!pwdVisible"
                :placeholder="pwdPlaceholder"
                placeholder-class="ph"
              />
              <view class="icon-btn" @tap="pwdVisible = !pwdVisible">
                <mz-icon
                  :name="pwdVisible ? 'visibility' : 'visibility_off'"
                  :size="20"
                  color="#94A3B8"
                />
              </view>
            </view>
          </view>

          <!-- 记住登录 / 找回密码 -->
          <view class="between remember">
            <view class="row items-center gap-2" @tap="remember = !remember">
              <view class="box" :class="{ on: remember }">
                <mz-icon v-if="remember" name="check" :size="14" color="#FFFFFF" />
              </view>
              <text class="t-label-sm c-secondary">记住登录状态 (30天免密)</text>
            </view>
            <text class="reset-link" @tap="toggleReset">{{ resetLinkText }}</text>
          </view>

          <!-- 提交 -->
          <view class="mz-btn mz-btn-primary submit" :class="{ busy }" @tap="submit">
            <mz-icon v-if="busy" name="cached" :size="18" color="#FFFFFF" />
            <text>{{ busy ? busyText : submitLabel }}</text>
            <mz-icon v-if="!busy" name="arrow_forward" :size="18" color="#FFFFFF" />
          </view>
        </view>

        <!-- 第三方登录 -->
        <view class="oauth">
          <view class="divider">
            <view class="divider-line"></view>
            <text class="divider-text">社交账号极速接入</text>
            <view class="divider-line"></view>
          </view>
          <view class="row gap-2">
            <view class="mz-btn oauth-btn off" @tap="oauthUnavailable('微信')">
              <mz-icon name="qr_code_scanner" :size="20" color="#0F766E" />
              <text>微信登录（未开放）</text>
            </view>
            <view class="mz-btn oauth-btn off" @tap="oauthUnavailable('Apple ID')">
              <mz-icon name="account_circle" :size="20" color="#334155" />
              <text>Apple ID（未开放）</text>
            </view>
          </view>
        </view>

        <!-- 页脚说明 -->
        <view class="col gap-2 foot-note">
          <view class="row items-center gap-2">
            <mz-icon name="verified_user" :size="15" color="#0F766E" />
            <text class="t-label-sm c-secondary">登录鉴权与账本隔离 · 账单数据不用于云端大模型训练</text>
          </view>
          <text class="t-body-sm c-tertiary agree">
            登录即代表您已阅读并同意
            <text class="agree-link" @tap="goHelp">《用户服务协议》</text>
            与
            <text class="agree-link" @tap="goPrivacy">《隐私安全保障条款》</text>
          </text>
        </view>
      </view>

      <!-- ===== 页脚 ===== -->
      <view class="col gap-1 footer">
        <view class="row gap-3 center">
          <text class="foot-link" @tap="goHelp">服务协议</text>
          <text class="foot-link" @tap="goPrivacy">隐私权政策</text>
          <text class="foot-link" @tap="goPrivacy">安全与合规保障</text>
        </view>
        <text class="t-label-sm c-tertiary center-text">© 2026 明账金融科技. 保留所有权利.</text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 落地页 + 登录 / 注册 / 找回密码（浏览器版 01-onboarding-landing.html）。
 *
 * 这是全站唯一**不需要登录就能进**的页面，所以它不做任何登录守卫，
 * 反过来还要在 onLoad 里主动把已登录的人送进主应用。
 *
 * 浏览器版有 login / register / reset 三个 Tab 和 sms / pwd 两个子模式，
 * 组合出的表单形态这里逐条对齐（注册与找回都要求「验证码 + 密码」同时出现，
 * 所以那两个 Tab 下收起二选一胶囊）。
 *
 * 微信 / Apple 登录：后端明确回 501（user 表没有 openid 列，加列属于 schema 变更，
 * 而数据库脚本是已验证资产）。所以如实提示「尚未开放」，不演一段假的授权动画。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { toast } from '@/common/ui'

/** 演示账号，与后端种子数据一致 */
const DEMO = { account: 'demo@mingzhang.app', password: 'Demo123456' }

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      currentTab: 'login', // 'login' | 'register' | 'reset'
      subMode: 'sms', // 'sms' | 'pwd'
      phone: '',
      code: '',
      password: '',
      pwdVisible: false,
      remember: true,
      busy: false,
      busyText: '',
      smsLeft: 0,
      smsTimer: null,
    }
  },
  computed: {
    showPills() {
      return this.currentTab === 'login'
    },
    /** 密码登录时这个框收的可能是邮箱，所以要去掉「11 位手机号」的约束 */
    byAccount() {
      return this.currentTab === 'login' && this.subMode === 'pwd'
    },
    phoneLabel() {
      if (this.currentTab === 'reset') return '绑定手机号码'
      return this.byAccount ? '手机号或邮箱' : '手机号码'
    },
    phonePlaceholder() {
      if (this.currentTab === 'reset') return '请输入11位绑定手机号码'
      return this.byAccount ? '请输入手机号或邮箱账号' : '请输入11位大陆手机号码'
    },
    phoneType() {
      return this.byAccount ? 'text' : 'number'
    },
    phoneMaxlength() {
      return this.byAccount ? -1 : 11
    },
    showSms() {
      return this.currentTab !== 'login' || this.subMode === 'sms'
    },
    showPwd() {
      return this.currentTab !== 'login' || this.subMode === 'pwd'
    },
    pwdLabel() {
      if (this.currentTab === 'register') return '设置登录密码'
      if (this.currentTab === 'reset') return '设置新密码'
      return '账号密码'
    },
    pwdPlaceholder() {
      return this.currentTab === 'login' ? '8-32位，需包含字母和数字' : '8-32位，需包含字母和数字'
    },
    subHint() {
      if (this.currentTab === 'register') return '注册后可用验证码或密码登录'
      if (this.currentTab === 'reset') return '验证绑定手机后设置新密码'
      // 后端不做「验证码登录自动注册」，这里不能写成「无需事先注册」——
      // 那会让人白输一遍验证码。
      return this.subMode === 'sms' ? '验证码登录需已注册' : '支持手机号或邮箱'
    },
    resetLinkText() {
      return this.currentTab === 'reset' ? '返回密码登录' : '找回密码'
    },
    submitLabel() {
      if (this.currentTab === 'register') return '立即注册明账账号'
      if (this.currentTab === 'reset') return '验证手机并重置密码'
      return this.subMode === 'pwd' ? '立即登录并同步数据' : '登录并同步数据'
    },
    smsBtnText() {
      return this.smsLeft > 0 ? this.smsLeft + 's 后重新获取' : '获取验证码'
    },
  },
  onLoad(query) {
    if (query && query.deleted === '1') toast('账号与账本数据已永久删除', 'success')
    // 已经登录过就直接进主应用，别让人再输一遍。
    // 若 token 其实已过期，首页的 401 会清掉本地会话再把用户送回来，
    // 那时 isLoggedIn() 已是 false，不会来回弹。
    if (api.isLoggedIn()) this.goApp()
  },
  onUnload() {
    this.clearSmsTimer()
  },
  methods: {
    clearSmsTimer() {
      if (this.smsTimer) {
        clearInterval(this.smsTimer)
        this.smsTimer = null
      }
    },
    switchAuthTab(tab) {
      this.currentTab = tab
      if (tab === 'login') this.subMode = this.subMode || 'sms'
      this.busy = false
    },
    switchSubMode(mode) {
      this.subMode = mode
      this.busy = false
    },
    toggleReset() {
      if (this.currentTab === 'reset') {
        this.switchAuthTab('login')
        this.subMode = 'pwd'
        return
      }
      this.currentTab = 'reset'
      this.busy = false
    },
    clearPhone() {
      this.phone = ''
    },
    startCountdown(seconds) {
      const self = this
      this.smsLeft = seconds
      this.clearSmsTimer()
      this.smsTimer = setInterval(function () {
        self.smsLeft -= 1
        if (self.smsLeft <= 0) self.clearSmsTimer()
      }, 1000)
    },
    sendVerifyCode() {
      const self = this
      if (this.smsLeft > 0) return
      if (!/^1[3-9]\d{9}$/.test(this.phone)) {
        toast('请输入正确的 11 位手机号码', 'error')
        return
      }
      api
        .post('/auth/sms-code', { phone: this.phone }, { silent: true })
        .then(function (data) {
          if (data && data.devCode) {
            // 开发模式后端把验证码直接回显在响应里，顺手填进输入框，
            // 省得每测一次都要去翻一次网络面板。
            self.code = data.devCode
            toast('开发模式：验证码 ' + data.devCode + ' 已自动填入', 'info')
          } else {
            toast('验证码已发送，' + Math.round((data.expiresInSeconds || 300) / 60) + ' 分钟内有效', 'success')
          }
          self.startCountdown(60)
        })
        .catch(function (err) {
          // 429（60 秒内重复发）的剩余秒数服务端已经算好，直接照它倒计时，
          // 免得用户点一次就重置一次本地的 60 秒。
          if (err && err.status === 429) self.startCountdown(60)
          else toast((err && err.message) || '验证码发送失败', 'error')
        })
    },
    submit() {
      const self = this
      if (this.busy) return

      const account = String(this.phone || '').trim()
      const code = String(this.code || '').trim()
      const pwd = String(this.password || '')

      if (!account) {
        toast('请填写' + (this.currentTab === 'reset' ? '绑定手机号码' : '手机号码'), 'error')
        return
      }

      const registering = this.currentTab === 'register'
      const resetting = this.currentTab === 'reset'
      if ((registering || resetting) && !code) {
        toast('请填写短信验证码', 'error')
        return
      }
      if ((registering || resetting) && !pwd) {
        toast(resetting ? '请设置新密码' : '请设置登录密码', 'error')
        return
      }
      if ((registering || resetting) && (pwd.length < 8 || pwd.length > 32 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd))) {
        toast('密码需为 8-32 位，并同时包含字母和数字', 'error')
        return
      }

      const usePassword = registering || resetting || this.subMode === 'pwd'
      if (usePassword && !pwd) {
        toast('请输入密码', 'error')
        return
      }
      if (!usePassword && !code) {
        toast('请填写短信验证码', 'error')
        return
      }

      this.busy = true
      this.busyText = registering ? '注册中...' : resetting ? '重置中...' : '登录中...'

      let task
      if (registering) {
        task = api.post('/auth/register', { phone: account, code: code, password: pwd }, { silent: true })
      } else if (resetting) {
        task = api
          .post('/auth/reset-password', { phone: account, code: code, newPassword: pwd }, { silent: true })
          .then(function () {
            self.busy = false
            self.code = ''
            self.password = ''
            self.switchAuthTab('login')
            self.subMode = 'pwd'
            toast('密码已重置，请使用新密码登录', 'success')
          })
      } else if (usePassword) {
        task = api.post('/auth/login', { account: account, password: pwd }, { silent: true })
      } else {
        task = api.post('/auth/login', { phone: account, code: code }, { silent: true })
      }

      task
        .then(function (res) {
          if (resetting) return
          api.setSession(res, { remember: self.remember })
          toast('欢迎回来，' + ((res && res.user && res.user.displayName) || '用户'), 'success')
          // 登录 → 回已有数据的主应用
          // 注册 → 新账本是空的，走冷启动引导（PRD 2.3：用导入账单替代空白图表）
          if (registering) uni.reLaunch({ url: '/pages/onboarding/coldstart' })
          else self.goApp()
        })
        .catch(function (err) {
          self.busy = false
          toast((err && err.message) || '操作失败', 'error')
          // 验证码用过即焚：错了或过期了都得重新获取，清空避免用户反复撞同一个错。
          if (err && (err.code === 'SMS_CODE_INVALID' || err.code === 'SMS_CODE_EXPIRED')) self.code = ''
        })
    },
    guestEntry() {
      const self = this
      api
        .post('/auth/login', DEMO, { silent: true })
        .then(function (res) {
          // 公共演示账号只保留本次会话，避免共用设备下次打开时直接进入演示数据。
          api.setSession(res, { remember: false })
          self.goApp()
        })
        .catch(function (err) {
          toast('演示账号登录失败：' + ((err && err.message) || '请先确认后端已启动'), 'error')
        })
    },
    oauthUnavailable(name) {
      toast(name + ' 登录尚未开放，请使用手机号或邮箱登录', 'info')
    },
    goApp() {
      // 首页是底部 Tab 之一，只能走 switchTab
      uni.switchTab({ url: '/pages/home/index' })
    },
    goHelp() {
      uni.navigateTo({ url: '/pages/onboarding/help' })
    },
    goPrivacy() {
      uni.navigateTo({ url: '/pages/settings/privacy' })
    },
  },
}
</script>

<style lang="scss" scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  padding: 24rpx 32rpx 64rpx;
}

/* 品牌头 */
.brand { display: flex; flex-direction: row; align-items: center; gap: 24rpx; }
.logo {
  width: 112rpx;
  height: 112rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.brand-name { font-size: 44rpx; font-weight: 800; color: var(--text-primary); letter-spacing: -1rpx; }
.ver-chip {
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-primary-fixed));
}

/* 主标题 */
.hero-title { font-size: 48rpx; font-weight: 800; line-height: 1.3; color: var(--text-primary); display: block; }
.hero-accent {
  color: var(--brand-600);
  background-image: linear-gradient(90deg, #14B8A6, #06B6D4);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-lead { display: block; line-height: 1.7; margin-top: 8rpx; }

/* 今日额度预览 */
.quota {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 32rpx;
  border-radius: 32rpx;
  background-image: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
  box-shadow: 0 24rpx 48rpx -12rpx rgba(20, 184, 166, 0.35);
}
.quota-kicker { font-size: 22rpx; font-weight: 600; letter-spacing: 2rpx; color: rgba(255, 255, 255, 0.9); }
.quota-value { font-size: 60rpx; font-weight: 800; color: #FFFFFF; letter-spacing: -1rpx; }
.quota-unit { font-size: 22rpx; color: rgba(255, 255, 255, 0.8); }
.health {
  align-self: flex-start;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 20rpx;
  border-radius: 9999rpx;
  font-size: 22rpx;
  color: #FFFFFF;
  background-color: rgba(255, 255, 255, 0.2);
}
.health-dot { width: 12rpx; height: 12rpx; border-radius: 9999rpx; background-color: #CCFBF1; }
.gauge { margin-top: 12rpx; }
.gauge-note { font-size: 22rpx; color: rgba(255, 255, 255, 0.9); }
.gauge-pct { font-size: 22rpx; font-weight: 700; color: #CCFBF1; }
.gauge-track {
  display: flex;
  flex-direction: row;
  height: 14rpx;
  border-radius: 9999rpx;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.2);
}
.gauge-fill { height: 100%; width: 52.6%; background-color: #CCFBF1; }
.gauge-pulse { height: 100%; width: 8%; background-color: rgba(204, 251, 241, 0.4); }
.gauge-foot { font-size: 22rpx; color: rgba(255, 255, 255, 0.78); }

/* 三大支柱 */
.pillar {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.pillar-tile {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-low));
}
.pillar-title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }

/* 认证卡片 */
.auth { display: flex; flex-direction: column; gap: 32rpx; padding: 32rpx; }

.demo {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.demo-title { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.demo-desc { display: block; line-height: 1.6; }
.demo-btn {
  height: 80rpx;
  font-size: 26rpx;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}

/* 分隔线 */
.divider { display: flex; flex-direction: row; align-items: center; gap: 16rpx; }
.divider-line { flex: 1; height: 1rpx; background-color: rgb(var(--mz-surface-container-high)); }
.divider-text { font-size: 22rpx; color: var(--text-secondary); flex-shrink: 0; }

/* Tab */
.tabs {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  padding: 8rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.tab {
  flex: 1;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  font-size: 26rpx;
  font-weight: 500;
  color: var(--text-secondary);
}
.tab.on {
  font-weight: 700;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}

/* 子模式胶囊 */
.sub { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 16rpx; }
.pills { display: flex; flex-direction: row; gap: 12rpx; }
.pill {
  padding: 8rpx 22rpx;
  border-radius: 9999rpx;
  font-size: 22rpx;
  font-weight: 500;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-low));
}
.pill.on {
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-primary-fixed));
}
.sub-hint { font-size: 20rpx; color: var(--text-tertiary); flex-shrink: 0; }

/* 表单 */
.field-label { font-size: 22rpx; font-weight: 500; color: var(--text-secondary); }
.prefix {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding-right: 16rpx;
  margin-right: 4rpx;
  border-right: 1rpx solid var(--border);
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-primary);
}
.ph { font-size: 26rpx; color: var(--text-tertiary); }
.icon-btn { display: flex; align-items: center; justify-content: center; padding: 8rpx; flex-shrink: 0; }
.code-btn { height: 96rpx; padding: 0 26rpx; font-size: 24rpx; flex-shrink: 0; color: var(--brand-700); }
.code-btn.off { opacity: 0.5; }
.remember { margin-top: 4rpx; }
.box {
  width: 36rpx;
  height: 36rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2rpx solid var(--border-strong);
  background-color: transparent;
}
.box.on { border-color: transparent; background-color: var(--brand-600); }
.reset-link { font-size: 22rpx; color: var(--brand-700); }
.submit { margin-top: 8rpx; }
.submit.busy { opacity: 0.75; }

/* 第三方 */
.oauth { display: flex; flex-direction: column; gap: 20rpx; }
.oauth-btn {
  flex: 1;
  height: 80rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
}
.oauth-btn.off { opacity: 0.58; }

/* 页脚说明 */
.foot-note { padding-top: 8rpx; }
.agree { display: block; line-height: 1.6; text-align: center; }
.agree-link { color: var(--text-primary); font-weight: 500; }
.footer { padding-top: 16rpx; }
.center { justify-content: center; }
.center-text { text-align: center; display: block; }
.foot-link { font-size: 24rpx; color: var(--text-secondary); }
</style>
