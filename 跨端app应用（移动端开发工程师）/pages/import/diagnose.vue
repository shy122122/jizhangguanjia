<template>
  <mz-page title="异常诊断">
    <view class="page">
      <!-- ===== 页头 ===== -->
      <view class="intro">
        <view class="row items-center gap-2 crumb">
          <text class="t-label-sm c-secondary">账单导入工作台</text>
          <mz-icon name="chevron_right" :size="14" color="#94A3B8" />
          <text class="t-label-sm c-secondary">预解析阶段</text>
        </view>
        <view class="row items-center gap-2">
          <text class="t-h2">流水导入诊断与排查</text>
        </view>
        <view class="row items-center gap-2">
          <view class="dot dot-danger"></view>
          <text class="t-label-sm c-secondary">PRD 7.1 容错拦截机制</text>
        </view>
        <text class="t-body-sm c-secondary meta tnum">解析耗时 142ms · wechat_pay_statement_202609.csv.zip</text>
      </view>

      <!-- ===== 1. 顶部异常警示 ===== -->
      <view class="mz-card alert">
        <view class="alert-strip"></view>
        <view class="alert-body">
          <view class="row items-center gap-2">
            <text class="t-h3">账单解析未完全成功</text>
            <text class="chip">已隔离异常行</text>
          </view>
          <text class="t-body-sm lead">
            系统已成功提取并结构化 <text class="c-primary bold">18 笔有效流水</text>，检测到
            <text class="c-danger bold">14 笔格式损坏、字段不全或语法异常行</text>。
          </text>
        </view>
        <view class="alert-acts">
          <view class="mz-btn mz-btn-ghost" @tap="goTable">一键定位异常行</view>
          <view class="mz-btn mz-btn-primary" @tap="importGood">直接导入 18 笔正常流水</view>
        </view>
      </view>

      <!-- ===== 2. 排查与解决指引 ===== -->
      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <mz-icon name="shield_lock" :size="22" color="#0F766E" />
            <text class="t-label">安全凭证校验</text>
          </view>
          <text class="chip">仅本地解压</text>
        </view>
        <text class="t-h3 card-title">微信加密账单需要独立解压密码</text>
        <text class="t-body-sm lead">
          依据微信支付安全策略，导出的月度明细压缩包已设置专属加密。请打开微信 App 进入「微信支付」服务号，
          查看账单推送凭证底部的 <text class="bold c-ink">6 位数字解压码</text>。
        </text>

        <view class="hint-box">
          <mz-icon name="chat" :size="22" color="#0F766E" />
          <view class="col">
            <text class="bold">微信支付凭证消息</text>
            <text class="t-body-sm c-secondary">路径：微信 &gt; 微信支付通知 &gt; 账单导出详情</text>
          </view>
        </view>

        <view class="pwd-row">
          <input
            v-model="pwd"
            class="pwd tnum"
            type="number"
            :maxlength="6"
            placeholder="输入 6 位解压码"
            placeholder-class="pwd-ph"
            @input="onPwdInput"
          />
          <view class="mz-btn mz-btn-primary pwd-btn" @tap="reextract">{{ pwdBtnText }}</view>
        </view>
      </view>

      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <mz-icon name="auto_fix_high" :size="22" color="#0E7490" />
            <text class="t-label">启发式推断</text>
          </view>
          <text class="chip">检测到 6 处</text>
        </view>
        <text class="t-h3 card-title">年份与商户字段缺失补全</text>
        <text class="t-body-sm lead">
          部分快捷导出记录仅有月日（例如「09-15」）。系统已根据账单文件时间戳，建议统一补齐当前自然年。
        </text>
        <view class="kv-box">
          <view class="kv">
            <text class="c-secondary">系统默认补今年份</text>
            <text class="tnum">2026 年</text>
          </view>
          <view class="kv">
            <text class="c-secondary">商户缺失匹配率</text>
            <text class="tnum c-primary">83.4% 命中历史库</text>
          </view>
        </view>
        <view class="mz-btn mz-btn-block" @tap="inert">一键应用当前推荐规则</view>
      </view>

      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <mz-icon name="search" :size="22" color="#0F766E" />
            <text class="t-label">编码嗅探</text>
          </view>
          <text class="chip">已自动修复</text>
        </view>
        <text class="t-h3 card-title">文件编码自动转译</text>
        <text class="t-body-sm lead">
          检测到源文件包含 Windows 历史遗留编码。引擎已自动由 <text class="bold c-ink">GBK</text> 转换为
          <text class="bold c-ink">UTF-8</text>，消除乱码。
        </text>
        <view class="encode">
          <text class="tnum c-tertiary enc-old">GBK/GB2312</text>
          <mz-icon name="arrow_forward" :size="16" color="#0F766E" />
          <text class="tnum c-primary bold">UTF-8 (无BOM)</text>
        </view>
      </view>

      <!-- ===== 3. 异常行对照表 ===== -->
      <view class="mz-card">
        <view class="between">
          <text class="t-h3">异常行定位与即时修正</text>
          <text class="chip chip-danger">待处理 4 行</text>
        </view>

        <view class="rows">
          <view v-for="r in ROWS" :key="r.no" class="row-card">
            <view class="between">
              <text class="tnum c-secondary">{{ r.no }}</text>
              <text class="chip" :class="r.tone">{{ r.kind }}</text>
            </view>
            <text class="snippet">{{ r.raw }}</text>
            <text class="t-body-sm c-secondary lead">{{ r.advice }}</text>
            <view class="row-acts">
              <view
                v-for="a in r.actions"
                :key="a"
                class="mz-btn row-btn"
                :class="a === r.primary ? 'mz-btn-primary' : 'mz-btn-ghost'"
                @tap="inert"
              >{{ a }}</view>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 4. 底部行动面板 ===== -->
      <view class="mz-card foot">
        <view class="foot-scores">
          <view class="row items-center gap-2">
            <view class="dot dot-brand"></view>
            <text class="t-body-sm">已修复 <text class="tnum c-primary bold">1</text> 笔</text>
          </view>
          <view class="row items-center gap-2">
            <view class="dot dot-warn"></view>
            <text class="t-body-sm">待处理 <text class="tnum bold">3</text> 笔</text>
          </view>
          <view class="row items-center gap-2">
            <view class="dot dot-muted"></view>
            <text class="t-body-sm c-secondary">已忽略 <text class="tnum">2</text> 笔</text>
          </view>
        </view>

        <view class="foot-acts">
          <view class="mz-btn mz-btn-ghost" @tap="inert">重新上传账单文件</view>
          <view class="mz-btn mz-btn-primary" @tap="importGood">仅导入已确认无误的 19 笔流水</view>
        </view>

        <text class="foot-note">
          当前排查策略已开启「预算穿透预估」，所有被修复条目将自动按商户特征映射至当月对应额度。
        </text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 异常诊断（浏览器版 20-import-diagnose.html）。
 *
 * 这一页在浏览器版里**没有对应的 JS 文件** —— 它是纯静态的容错机制说明页，
 * 只有一处内联脚本：验证 6 位解压码后把按钮文案变成「解密成功」。
 * 所以这里也照原样办：内容全部静态，只有解压码那一处有交互。
 *
 * 页内那几颗「一键应用当前推荐规则」「补填金额」「跳过此行」按钮在浏览器版里
 * 也没有绑定任何事件（点下去没反应），这里保持同样的语义 —— 它们是给设计稿
 * 表意的占位动作，不是真功能。tap 时给一句说明，避免用户以为是 App 卡住了。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import fmt from '@/common/fmt'
import { toast } from '@/common/ui'

const ROWS = [
  {
    no: '#04',
    kind: '数据不完整',
    tone: '',
    raw: '09-15 麦当劳',
    advice: '缺失关键金额，商户已确认为「餐饮美食/麦当劳」',
    actions: ['补填金额', '跳过此行'],
    primary: '补填金额',
  },
  {
    no: '#11',
    kind: '方向歧义',
    tone: '',
    raw: '微信转账-转给朋友张三 200.00',
    advice: '未标注正负符号，推断为支出 ¥200.00（或人情往来借出）',
    actions: ['标记为支出', '跳过'],
    primary: '标记为支出',
  },
  {
    no: '#19',
    kind: '格式多余后缀',
    tone: '',
    raw: '支付宝服务费 0.10元',
    advice: '正则智能提取纯净数值：¥0.10',
    actions: ['确认采纳修正'],
    primary: '确认采纳修正',
  },
  {
    no: '#27',
    kind: '语法错误',
    tone: 'chip-danger',
    raw: '%%--2026-INVALID--&&',
    advice: '无法识别的控制符号行，疑为文件尾部脏数据',
    actions: ['直接剔除此行'],
    primary: '直接剔除此行',
  },
]

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      ROWS,
      pwd: '',
      pwdBtnText: '重新本地解压',
      working: false,
    }
  },
  methods: {
    onPwdInput() {
      // uni 的 input 事件在部分端不裁长度，这里自己兜住 6 位上限
      const v = String(this.pwd || '').replace(/\D/g, '').slice(0, 6)
      if (v !== this.pwd) this.pwd = v
    },
    reextract() {
      const self = this
      if (this.working) return
      if (!this.pwd || this.pwd.length < 6) {
        toast('请输入 6 位解压码', 'error')
        return
      }
      this.working = true
      this.pwdBtnText = '解压解析中…'
      setTimeout(function () {
        self.working = false
        self.pwdBtnText = '解密成功'
        toast('解密成功', 'success')
      }, 800)
    },
    inert() {
      toast('该操作在原型的这一步尚未可用', 'none')
    },
    goTable() {
      uni.pageScrollTo({ selector: '.rows', duration: 300 })
    },
    importGood() {
      uni.redirectTo({ url: '/pages/import/main' })
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
.crumb { gap: 4rpx; }
.meta { margin-top: 4rpx; }
.lead { display: block; line-height: 1.7; margin-top: 12rpx; }
.card-title { display: block; margin-top: 20rpx; }

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
.dot-brand { background-color: var(--brand-600); }
.dot-warn { background-color: var(--warning); }
.dot-muted { background-color: var(--text-tertiary); }
.dot-danger { background-color: var(--danger); }

/* 异常警示条 */
.alert { position: relative; padding-left: 44rpx; }
.alert-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 12rpx;
  border-radius: 28rpx 0 0 28rpx;
  background-color: var(--danger);
}
.alert-body { display: flex; flex-direction: column; }
.alert-acts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 28rpx;
}
.alert-acts .mz-btn { flex: 1; min-width: 240rpx; }

/* 解压码 */
.hint-box {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.pwd-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  margin-top: 24rpx;
}
.pwd {
  flex: 1;
  min-width: 0;
  height: 88rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  font-size: 30rpx;
  letter-spacing: 8rpx;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
}
.pwd-ph { font-size: 24rpx; letter-spacing: 0; color: var(--text-tertiary); }
.pwd-btn { flex-shrink: 0; }

/* 键值框 */
.kv-box {
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.kv {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  font-size: 24rpx;
}

/* 编码 */
.encode {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.enc-old { text-decoration: line-through; opacity: 0.7; }

/* 异常行 */
.rows { margin-top: 24rpx; display: flex; flex-direction: column; gap: 24rpx; }
.row-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.snippet {
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  font-size: 24rpx;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container));
  word-break: break-all;
}
.row-acts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 8rpx;
}
.row-btn {
  padding: 0 24rpx;
  height: 64rpx;
  font-size: 24rpx;
}

/* 底部面板 */
.foot { gap: 24rpx; }
.foot-scores {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 24rpx;
}
.foot-acts {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.foot-note {
  font-size: 22rpx;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
