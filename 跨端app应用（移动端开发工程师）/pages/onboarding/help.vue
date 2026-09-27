<template>
  <mz-page title="找回密码与帮助">
    <view class="page">
      <!-- ===== 顶部状态 ===== -->
      <view class="between">
        <view class="row items-center gap-1" @tap="backToLogin">
          <mz-icon name="arrow_back" :size="18" color="#0F766E" />
          <text class="back-text">返回账号登录</text>
        </view>
        <view class="row items-center gap-1">
          <mz-icon name="verified_user" :size="16" color="#0F766E" />
          <text class="t-label-sm c-secondary">身份与凭据保护体系</text>
        </view>
      </view>

      <!-- ===== 重置密码 ===== -->
      <view class="mz-card reset">
        <!-- 流程头 -->
        <view class="flow-head">
          <view class="between">
            <view class="row items-center gap-3">
              <view class="flow-tile"><mz-icon name="lock_reset" :size="20" color="#0F766E" /></view>
              <view class="col">
                <text class="t-h3">安全重置密码</text>
                <text class="t-body-sm c-secondary">请验证您绑定的安全凭据以确认为本人操作</text>
              </view>
            </view>
          </view>
          <text class="flow-chip">安全核验中</text>
        </view>

        <!-- 步骤条 -->
        <view class="steps">
          <view class="steps-track"></view>
          <view class="steps-track-on"></view>
          <view v-for="(s, i) in STEPS" :key="s.no" class="step">
            <view class="step-no" :class="{ on: i === 0 }">{{ s.no }}</view>
            <text class="step-label" :class="{ on: i === 0 }">{{ s.label }}</text>
          </view>
        </view>

        <!-- 渠道选择 -->
        <view class="methods">
          <view class="method" :class="{ on: method === 'phone' }" @tap="switchMethod('phone')">
            <mz-icon name="smartphone" :size="18" :color="method === 'phone' ? '#0F766E' : '#64748B'" />
            <text>手机短信验证码</text>
          </view>
          <view class="method" :class="{ on: method === 'email' }" @tap="switchMethod('email')">
            <mz-icon name="mail" :size="18" :color="method === 'email' ? '#0F766E' : '#64748B'" />
            <text>绑定邮箱安全链接</text>
          </view>
        </view>

        <!-- 手机表单 -->
        <view v-if="method === 'phone'" class="col gap-3">
          <view class="col gap-1">
            <view class="between">
              <text class="field-label">注册手机号</text>
              <text class="t-label-sm c-secondary">支持大陆与特区手机号</text>
            </view>
            <view class="mz-field">
              <view class="prefix">
                <text>+86</text>
                <mz-icon name="arrow_drop_down" :size="16" color="#94A3B8" />
              </view>
              <input
                v-model="phone"
                class="mz-input tnum"
                type="number"
                :maxlength="11"
                placeholder="请输入绑定的 11 位手机号码"
                placeholder-class="ph"
              />
            </view>
          </view>

          <view class="col gap-1">
            <text class="field-label">图形验证码</text>
            <view class="row gap-2">
              <view class="mz-field flex-1">
                <input
                  v-model="captchaInput"
                  class="mz-input"
                  type="text"
                  :maxlength="4"
                  placeholder="请输入右侧计算结果"
                  placeholder-class="ph"
                />
              </view>
              <view class="captcha" @tap="refreshCaptcha">
                <text class="captcha-text">{{ captchaText }}</text>
                <mz-icon name="cached" :size="16" color="#94A3B8" />
              </view>
            </view>
          </view>

          <view class="col gap-1">
            <view class="between">
              <text class="field-label">短信验证码</text>
              <text class="link-sm" @tap="switchMethod('email')">无法接收短信？使用安全邮箱</text>
            </view>
            <view class="row gap-2">
              <view class="mz-field flex-1">
                <input
                  v-model="sms"
                  class="mz-input tnum"
                  type="number"
                  :maxlength="6"
                  placeholder="请输入 6 位短信数字"
                  placeholder-class="ph"
                />
              </view>
              <view class="mz-btn sms-btn" :class="{ off: smsLeft > 0 }" @tap="startTimer">
                <text>{{ smsBtnText }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 邮箱表单 -->
        <view v-else class="col gap-3">
          <view class="col gap-1">
            <view class="between">
              <text class="field-label">已认证的安全邮箱</text>
              <text class="link-sm" @tap="switchMethod('phone')">改用手机号重置</text>
            </view>
            <view class="mz-field">
              <input
                v-model="email"
                class="mz-input"
                type="text"
                placeholder="例如: name@domain.com"
                placeholder-class="ph"
              />
              <mz-icon name="mark_email_read" :size="20" color="#94A3B8" />
            </view>
          </view>

          <view class="tip-box">
            <mz-icon name="info" :size="18" color="#0F766E" />
            <text class="t-body-sm c-secondary tip-text">
              提交后，系统将向该邮箱投递一条包含一次性安全校验令牌的重置邮件，链接在 15 分钟内有效。
            </text>
          </view>
        </view>

        <!-- 下一步 -->
        <view class="mz-btn mz-btn-primary next" @tap="verifyNext">
          <text>下一步：验证并设置新密码</text>
          <mz-icon name="arrow_forward" :size="20" color="#FFFFFF" />
        </view>

        <!-- 安全须知 -->
        <view class="notice">
          <mz-icon name="shield" :size="18" color="#0F766E" />
          <view class="col flex-1">
            <text class="notice-title">安全防范须知</text>
            <text class="t-body-sm c-secondary notice-text">
              系统将在核验您的身份后引导设置新密码。密码重置成功后，除当前终端外，所有已登录的移动端、网页版及 API 授权会话将被强制下线。
            </text>
          </view>
        </view>
      </view>

      <!-- ===== 常见问题 ===== -->
      <view class="mz-card">
        <view class="row items-center gap-2">
          <mz-icon name="contact_support" :size="22" color="#0891B2" />
          <text class="t-h3">常见问题排查</text>
        </view>

        <view class="faqs">
          <view v-for="f in FAQS" :key="f.q" class="faq">
            <view class="faq-head" @tap="toggleFaq(f)">
              <view class="row items-center gap-2 flex-1">
                <view class="faq-dot" :class="{ hi: f.hi }"></view>
                <text class="faq-q ellipsis">{{ f.q }}</text>
              </view>
              <view class="faq-chev" :class="{ open: f.open }">
                <mz-icon name="expand_more" :size="18" color="#94A3B8" />
              </view>
            </view>
            <text v-if="f.open" class="faq-a">{{ f.a }}</text>
          </view>
        </view>
      </view>

      <!-- ===== 人工支持 ===== -->
      <view class="mz-card support">
        <view class="row items-center gap-3">
          <view class="support-tile">
            <mz-icon name="support_agent" :size="20" color="#0891B2" />
          </view>
          <view class="col flex-1">
            <text class="support-title">仍未解决问题？</text>
            <text class="t-label-sm c-secondary">明账安全工程师为您一对一核实</text>
          </view>
        </view>

        <view class="col gap-2 support-rows">
          <view class="between support-row">
            <text class="t-body-sm c-secondary">人工服务时间</text>
            <text class="t-body-sm c-ink">工作日 09:00 - 18:00</text>
          </view>
          <view class="between support-row">
            <text class="t-body-sm c-secondary">安全应急邮箱</text>
            <text class="t-body-sm c-primary">security@clarity.cc</text>
          </view>
          <view class="between support-row">
            <text class="t-body-sm c-secondary">响应承诺时效</text>
            <text class="resp-chip">15分钟内受理</text>
          </view>
        </view>

        <view class="mz-btn appeal-btn" @tap="appeal">
          <mz-icon name="assignment_turned_in" :size="16" color="#0891B2" />
          <text>发起在线人工身份申诉</text>
        </view>
      </view>

      <!-- ===== 页脚 ===== -->
      <view class="col gap-1 footer">
        <view class="row gap-3 center">
          <text class="foot-link" @tap="backToLogin">服务协议</text>
          <text class="foot-link" @tap="goPrivacy">隐私权政策</text>
        </view>
        <text class="t-label-sm c-tertiary center-text">© 2024 明账金融科技. 保留所有权利.</text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 找回密码与帮助（浏览器版 03-onboarding-help.html）。
 *
 * 浏览器版这一页只有内联脚本：渠道切换（手机/邮箱）、图形验证码刷新、
 * 60 秒发送倒计时、下一步的前端校验。没有接口调用 —— 后端也**没有**
 * 找回密码接口（PRD 里这一页是流程示意）。所以这里保持同样的边界：
 * 校验通过后用一句 alert 说明「将进入设置新密码」，不假装发出去了请求。
 *
 * 「下一步」的校验也照抄浏览器版的口径（手机号 11 位、短信至少 4 位、邮箱含 @），
 * 虽然比登录页宽松，但这是这一页原本的行为，不改。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import { toast, alert } from '@/common/ui'

const STEPS = [
  { no: '1', label: '验证账号身份' },
  { no: '2', label: '设置新安全密码' },
  { no: '3', label: '完成并重新登录' },
]

const FAQS = [
  {
    q: '收不到短信或邮件验证码？',
    a: '1. 请核对手机号是否正确无误；\n2. 检查手机短信垃圾拦截箱或屏蔽关键词；\n3. 若频繁尝试，运营商可能触发流控频控，请静候 60 秒后重试。',
    open: false,
    hi: false,
  },
  {
    q: '手机号停用或无法使用？',
    a: '可通过备用绑定的实名邮箱完成验证。若双重认证均失效，请使用下方「人工申诉通道」，提交最近 3 笔穿透记账记录摘要以核实账本资产归属。',
    open: false,
    hi: false,
  },
  {
    q: '免登录试用的本地数据会丢失吗？',
    a: '当前版本需要登录后使用，账单按用户和账本隔离存入自建数据库。找回账户后登录，即可继续访问原账本数据。',
    open: true,
    hi: true,
  },
  {
    q: '账号疑似被盗或异常消费？',
    a: '若发现账本数据出现未知记账波动，可使用紧急冻结通道限制任何修改操作，并立即阻断同步与第三方授权。',
    open: false,
    hi: false,
  },
]

function randCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1
  const b = Math.floor(Math.random() * 9) + 1
  return a + ' + ' + b + ' = ?'
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      STEPS,
      FAQS,
      method: 'phone',
      phone: '',
      captchaInput: '',
      captchaText: randCaptcha(),
      sms: '',
      email: '',
      smsLeft: 0,
      timer: null,
    }
  },
  computed: {
    smsBtnText() {
      return this.smsLeft > 0 ? this.smsLeft + 's 后重新获取' : '获取验证码'
    },
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
    switchMethod(m) {
      this.method = m
    },
    refreshCaptcha() {
      this.captchaText = randCaptcha()
      this.captchaInput = ''
    },
    toggleFaq(f) {
      f.open = !f.open
    },
    startTimer() {
      const self = this
      if (this.smsLeft > 0) return
      if (String(this.phone || '').trim().length < 11) {
        toast('请先输入正确的11位手机号码', 'error')
        return
      }
      this.smsLeft = 60
      this.clearTimer()
      this.timer = setInterval(function () {
        self.smsLeft -= 1
        if (self.smsLeft <= 0) self.clearTimer()
      }, 1000)
    },
    verifyNext() {
      if (this.method === 'phone') {
        const phone = String(this.phone || '').trim()
        const sms = String(this.sms || '').trim()
        if (!phone || phone.length < 11) {
          toast('请输入完整的11位手机号码', 'error')
          return
        }
        if (!sms || sms.length < 4) {
          toast('请输入收到的短信验证码', 'error')
          return
        }
      } else {
        const email = String(this.email || '').trim()
        if (!email || email.indexOf('@') === -1) {
          toast('请输入有效的安全邮箱地址', 'error')
          return
        }
      }
      alert('身份验证凭据提交成功，正在进入【设置新安全密码】页面...', { title: '验证通过' })
    },
    appeal() {
      toast('人工申诉通道在原型的这一步尚未接入', 'none')
    },
    backToLogin() {
      uni.navigateBack()
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
  gap: 24rpx;
  padding: 24rpx 24rpx 0;
}
.back-text { font-size: 26rpx; font-weight: 600; color: var(--brand-700); }

/* 重置卡片 */
.reset { display: flex; flex-direction: column; gap: 28rpx; padding: 32rpx; }
.flow-head {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.flow-tile {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-primary-fixed));
}
.flow-chip {
  align-self: flex-start;
  padding: 6rpx 20rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgba(15, 118, 110, 0.12);
}

/* 步骤条 */
.steps {
  position: relative;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding-top: 16rpx;
}
.steps-track {
  position: absolute;
  left: 60rpx;
  right: 60rpx;
  top: 44rpx;
  height: 3rpx;
  background-color: rgb(var(--mz-surface-container-highest));
}
.steps-track-on {
  position: absolute;
  left: 60rpx;
  width: 25%;
  top: 44rpx;
  height: 3rpx;
  background-color: rgb(var(--mz-primary));
}
.step { display: flex; flex-direction: column; align-items: center; gap: 10rpx; z-index: 1; }
.step-no {
  width: 56rpx;
  height: 56rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-highest));
}
.step-no.on {
  font-weight: 700;
  color: rgb(var(--mz-on-primary));
  background-color: rgb(var(--mz-primary));
}
.step-label { font-size: 20rpx; color: var(--text-secondary); }
.step-label.on { font-weight: 700; color: var(--brand-700); }

/* 渠道 */
.methods {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  padding: 8rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.method {
  flex: 1;
  height: 76rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: 16rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: var(--text-secondary);
}
.method.on {
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}

/* 表单 */
.field-label { font-size: 22rpx; font-weight: 600; color: var(--text-primary); }
.prefix {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding-right: 16rpx;
  margin-right: 4rpx;
  border-right: 1rpx solid var(--border);
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.ph { font-size: 26rpx; color: var(--text-tertiary); }
.link-sm { font-size: 20rpx; color: var(--brand-700); }
.captcha {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  height: 96rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
}
.captcha-text {
  font-size: 26rpx;
  font-weight: 700;
  font-style: italic;
  letter-spacing: 2rpx;
  color: var(--brand-700);
}
.sms-btn { height: 96rpx; padding: 0 26rpx; font-size: 24rpx; flex-shrink: 0; color: var(--brand-700); }
.sms-btn.off { opacity: 0.5; }
.tip-box {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.tip-text { flex: 1; line-height: 1.7; }
.next { width: 100%; margin-top: 8rpx; }
.notice {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.notice-title { font-size: 24rpx; font-weight: 600; color: var(--text-primary); }
.notice-text { line-height: 1.7; margin-top: 4rpx; }

/* FAQ */
.faqs { margin-top: 20rpx; display: flex; flex-direction: column; }
.faq { padding: 20rpx 0; border-bottom: 1rpx solid var(--border); }
.faq:last-child { border-bottom: none; }
.faq-head { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 16rpx; }
.faq-dot { width: 14rpx; height: 14rpx; border-radius: 9999rpx; background-color: var(--accent-600); flex-shrink: 0; }
.faq-dot.hi { background-color: var(--brand-600); }
.faq-chev { display: flex; align-items: center; justify-content: center; transition: transform 200ms ease; }
.faq-chev.open { transform: rotate(180deg); }
.faq-q { font-size: 26rpx; font-weight: 600; color: var(--text-primary); }
.faq-a {
  display: block;
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  font-size: 24rpx;
  line-height: 1.8;
  white-space: pre-line;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-low));
}

/* 人工支持 */
.support { gap: 24rpx; }
.support-tile {
  width: 64rpx;
  height: 64rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgba(8, 145, 178, 0.12);
}
.support-title { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.support-rows { padding-top: 8rpx; }
.support-row { padding: 10rpx 0; }
.resp-chip {
  padding: 4rpx 16rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgba(15, 118, 110, 0.12);
}
.appeal-btn {
  width: 100%;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--accent-600);
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}

/* 页脚 */
.footer { padding-top: 16rpx; }
.center { justify-content: center; }
.center-text { text-align: center; display: block; }
.foot-link { font-size: 24rpx; color: var(--text-secondary); }
</style>
