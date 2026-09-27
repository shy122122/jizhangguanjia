<template>
  <mz-page title="开始使用">
    <view class="page">
      <!-- ===== 欢迎 ===== -->
      <view class="col gap-2">
        <view class="row items-center gap-2 wrap">
          <text class="t-h1">{{ displayName }}，欢迎使用明账！</text>
          <view class="ready-chip">
            <view class="pulse"></view>
            <text>新账本就绪 · 待开启</text>
          </view>
        </view>
        <text class="t-body-sm c-secondary lead">
          先看见，再管住。完成首笔记账或导入账单，即刻建立个人理性财务全景。
        </text>
      </view>

      <!-- ===== 快捷入口 ===== -->
      <view class="row gap-2">
        <view class="quick" @tap="goImport">
          <view class="quick-tile">
            <mz-icon name="upload_file" :size="20" color="#0891B2" />
          </view>
          <view class="col flex-1">
            <text class="quick-title">微信 / 支付宝导入</text>
            <text class="quick-sub">支持智能对账排重</text>
          </view>
        </view>
        <view class="mz-btn mz-btn-primary quick-btn" @tap="goRecord">
          <mz-icon name="edit_note" :size="20" color="#FFFFFF" />
          <text>快速记账</text>
        </view>
      </view>

      <!-- ===== 今日安全额度（待配置） ===== -->
      <view class="quota">
        <view class="between">
          <view class="row items-center gap-2">
            <mz-icon name="shield_lock" :size="20" color="#FFFFFF" />
            <text class="quota-kicker">今日安全额度 · 动态演算</text>
          </view>
          <view class="quota-chip">
            <view class="quota-dot"></view>
            <text>待配置预算模型</text>
          </view>
        </view>

        <view class="col gap-1 quota-main">
          <text class="quota-title">设置月度预算，<text>洞悉每日可花额度</text></text>
          <text class="quota-desc">把月度总额平摊至每日，花完即止告别盲目支出与月底焦虑。</text>
        </view>

        <view class="col gap-2 quota-foot">
          <view class="row items-center gap-2 wrap">
            <text class="quota-tip">智能推荐模式：</text>
            <text class="mode-chip">结余型 50/30/20</text>
            <text class="mode-chip">精细严管型</text>
          </view>
          <view class="row items-center gap-2">
            <view class="mz-btn go-budget" @tap="goBudget">
              <text>配置本月预算 (30秒)</text>
              <mz-icon name="arrow_forward" :size="18" color="#0F766E" />
            </view>
            <text class="quota-tip">系统可智能预设</text>
          </view>
        </view>
      </view>

      <!-- ===== 四张指标卡 ===== -->
      <view class="grid-2 gap-2">
        <view class="mz-card metric">
          <view class="between">
            <text class="metric-label">今日累计支出</text>
            <view class="metric-tile"><mz-icon name="shopping_bag" :size="18" color="#64748B" /></view>
          </view>
          <text class="metric-value tnum">¥0.00</text>
          <view class="between">
            <text class="metric-hint">尚无入账流水</text>
            <text class="metric-hint">待记账</text>
          </view>
        </view>

        <view class="mz-card metric">
          <view class="between">
            <text class="metric-label">本月实际支出</text>
            <view class="metric-tile"><mz-icon name="trending_down" :size="18" color="#64748B" /></view>
          </view>
          <text class="metric-value tnum">¥0.00</text>
          <view class="between">
            <text class="metric-hint">结余充分 · 待开始统计</text>
            <text class="metric-hint c-primary">状态良好</text>
          </view>
        </view>

        <view class="mz-card metric">
          <view class="between">
            <text class="metric-label">本月到账收入</text>
            <view class="metric-tile"><mz-icon name="payments" :size="18" color="#64748B" /></view>
          </view>
          <text class="metric-value tnum c-secondary">¥0.00</text>
          <view class="between">
            <text class="metric-hint">数据准备中</text>
            <text class="metric-hint">薪资/兼职</text>
          </view>
        </view>

        <view class="mz-card metric">
          <view class="between">
            <text class="metric-label">分类超支风险</text>
            <view class="metric-tile"><mz-icon name="check_circle" :size="18" color="#0F766E" /></view>
          </view>
          <view class="row items-baseline gap-1">
            <text class="metric-value tnum c-primary">0</text>
            <text class="metric-hint">项类目超限</text>
          </view>
          <view class="between">
            <text class="metric-hint c-primary ellipsis">全部分类健康平稳</text>
            <text class="metric-hint c-primary">无风险</text>
          </view>
        </view>
      </view>

      <!-- ===== 最近流水明细 ===== -->
      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <text class="t-h3">最近流水明细</text>
            <text class="mini-chip">冷启动引导</text>
          </view>
        </view>
        <text class="t-body-sm c-secondary lead">支持批量导入与极速记账</text>

        <view class="col gap-3 entries">
          <!-- 强烈推荐：导入 -->
          <view class="entry entry-hi">
            <view class="row items-start gap-3">
              <view class="entry-tile entry-tile-hi">
                <mz-icon name="document_scanner" :size="28" color="#0F766E" />
              </view>
              <view class="col flex-1">
                <view class="row items-center gap-2 wrap">
                  <text class="entry-title">极速导入历史账单</text>
                  <text class="rec-chip">强烈推荐</text>
                </view>
                <text class="t-body-sm c-secondary entry-desc">
                  支持微信、支付宝导出 CSV 或直接复制文本账单。10秒解析生成消费画像，告别冷启动空白图表。
                </text>
                <view class="row gap-3 wrap entry-feats">
                  <view class="row items-center gap-1">
                    <mz-icon name="check_circle" :size="14" color="#0F766E" />
                    <text>智能去重</text>
                  </view>
                  <view class="row items-center gap-1">
                    <mz-icon name="check_circle" :size="14" color="#0F766E" />
                    <text>自动多级分类</text>
                  </view>
                  <view class="row items-center gap-1">
                    <mz-icon name="check_circle" :size="14" color="#0F766E" />
                    <text>文件解析</text>
                  </view>
                </view>
              </view>
            </view>
            <view class="mz-btn mz-btn-primary entry-btn" @tap="goImport">
              <mz-icon name="upload_file" :size="18" color="#FFFFFF" />
              <text>立即导入对账单</text>
            </view>
          </view>

          <!-- 记一笔 -->
          <view class="entry">
            <view class="row items-start gap-3">
              <view class="entry-tile">
                <mz-icon name="edit_square" :size="28" color="#0891B2" />
              </view>
              <view class="col flex-1">
                <view class="row items-center gap-2 wrap">
                  <text class="entry-title">记下第一笔消费</text>
                  <text class="mini-chip">沉浸键盘</text>
                </view>
                <text class="t-body-sm c-secondary entry-desc">
                  体验 3 秒微交互极速入账，感受「今日安全额度」的即时动态演算反馈。
                </text>
              </view>
            </view>
            <view class="mz-btn entry-btn" @tap="goRecord">
              <mz-icon name="add" :size="18" color="#0F766E" />
              <text>记一笔</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 分类预算预设库 ===== -->
      <view class="mz-card">
        <view class="between">
          <view class="col">
            <text class="t-h3">分类预算预设库</text>
            <text class="t-body-sm c-secondary">系统推荐的经典生活开支模型</text>
          </view>
        </view>

        <view class="col gap-2 presets">
          <view v-for="p in PRESETS" :key="p.name" class="preset">
            <view class="between">
              <view class="row items-center gap-2">
                <view class="dot" :style="{ backgroundColor: p.color }"></view>
                <text class="preset-name">{{ p.name }}</text>
                <text class="preset-note">{{ p.note }}</text>
              </view>
              <text class="preset-rec tnum">推荐 {{ fmt.moneyInt(p.amount) }}</text>
            </view>
            <view class="mz-track mz-track-thin">
              <view class="mz-fill" :style="{ width: '0%', backgroundColor: p.color + '66' }"></view>
            </view>
          </view>
        </view>

        <view class="mz-btn apply-btn" @tap="goBudget">
          <mz-icon name="auto_fix_high" :size="18" color="#0F766E" />
          <text>一键应用标准预算模版 (总计 ¥3,000)</text>
        </view>
      </view>

      <!-- ===== 就绪条 ===== -->
      <view class="ready">
        <view class="row items-center gap-2 flex-1">
          <view class="ready-tile">
            <mz-icon name="lock_reset" :size="20" color="#0F766E" />
          </view>
          <view class="col flex-1">
            <text class="ready-title">账本服务已就绪</text>
            <text class="ready-sub">当前为登录态私有账本，所有流水按用户与账本隔离存储</text>
          </view>
        </view>
        <text class="ready-chip-tag">环境就绪</text>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 首次进入冷启动（浏览器版 02-onboarding-coldstart.html）。
 *
 * 浏览器版这一页**没有对应的 JS 文件** —— 它是一张纯静态的「新账本长什么样」
 * 说明页，页内所有按钮都没绑事件。这里保留同样的语义，只把「指向别处」的那几颗
 * 接到真实路由上（导入 / 记一笔 / 配置预算），因为那三件事在 App 里本来就能做。
 *
 * 指标区是**刻意的零值**：它展示的是「空账本」的状态，不是加载中的占位。
 * 真实数据由首页负责，这里不查接口。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import fmt from '@/common/fmt'
import { session } from '@/common/store'

const PRESETS = [
  { name: '餐饮日常', note: '三餐、咖啡茶饮', amount: 1500, color: '#F59E0B' },
  { name: '市内交通', note: '通勤、打车、养车', amount: 600, color: '#0D9488' },
  { name: '居家生活', note: '日用百货、水电网络', amount: 500, color: '#6366F1' },
  { name: '休闲与个人成长', note: '书籍、娱乐活动', amount: 400, color: '#A855F7' },
]

export default {
  components: { mzIcon, mzPage },
  data() {
    return { fmt, PRESETS }
  },
  computed: {
    displayName() {
      return (session.user && (session.user.displayName || session.user.nickname)) || '朋友'
    },
  },
  methods: {
    goImport() {
      uni.navigateTo({ url: '/pages/import/main' })
    },
    goRecord() {
      uni.switchTab({ url: '/pages/record/sheet' })
    },
    goBudget() {
      uni.navigateTo({ url: '/pages/budget/setup' })
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
.wrap { flex-wrap: wrap; }
.lead { display: block; line-height: 1.7; }

.ready-chip {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 20rpx;
  border-radius: 9999rpx;
  font-size: 22rpx;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-high));
}
.pulse { width: 12rpx; height: 12rpx; border-radius: 9999rpx; background-color: var(--brand-600); }

/* 快捷入口 */
.quick {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.quick-tile {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
}
.quick-title { font-size: 26rpx; font-weight: 600; color: var(--text-primary); }
.quick-sub { font-size: 20rpx; color: var(--text-secondary); }
.quick-btn { flex-shrink: 0; padding: 0 28rpx; font-size: 26rpx; }

/* 今日安全额度 */
.quota {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 32rpx;
  border-radius: 32rpx;
  background-image: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
  box-shadow: var(--shadow-tier2);
}
.quota-kicker { font-size: 22rpx; font-weight: 600; letter-spacing: 2rpx; color: rgba(255, 255, 255, 0.9); }
.quota-chip {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 18rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  color: #FFFFFF;
  background-color: rgba(255, 255, 255, 0.2);
}
.quota-dot { width: 10rpx; height: 10rpx; border-radius: 9999rpx; background-color: rgba(255, 255, 255, 0.8); }
.quota-main { margin-top: 8rpx; }
.quota-title { font-size: 40rpx; font-weight: 700; line-height: 1.4; color: #FFFFFF; display: block; }
.quota-desc { font-size: 22rpx; line-height: 1.7; color: rgba(255, 255, 255, 0.9); }
.quota-foot { padding-top: 24rpx; border-top: 1rpx solid rgba(255, 255, 255, 0.15); }
.quota-tip { font-size: 22rpx; color: rgba(255, 255, 255, 0.8); }
.mode-chip {
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  color: #FFFFFF;
  background-color: rgba(255, 255, 255, 0.15);
}
.go-budget {
  height: 80rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--brand-700);
  background-color: #FFFFFF;
}

/* 指标卡 */
.metric { display: flex; flex-direction: column; gap: 12rpx; padding: 26rpx; }
.metric-label { font-size: 22rpx; color: var(--text-secondary); }
.metric-tile {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(var(--mz-surface-container-low));
}
.metric-value { font-size: 40rpx; font-weight: 700; color: var(--text-primary); }
.metric-hint { font-size: 20rpx; color: var(--text-secondary); }

/* 入口卡 */
.mini-chip {
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-high));
}
.entries { margin-top: 24rpx; }
.entry {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  border: 1rpx solid var(--border);
  background-color: rgb(var(--mz-surface-container-low));
}
.entry-hi {
  border: 2rpx dashed rgba(15, 118, 110, 0.4);
  background-color: rgba(240, 253, 250, 0.6);
}
.entry-tile {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
}
.entry-tile-hi { background-color: rgba(15, 118, 110, 0.12); }
.entry-title { font-size: 30rpx; font-weight: 700; color: var(--text-primary); }
.entry-desc { display: block; margin-top: 8rpx; line-height: 1.7; }
.entry-feats { margin-top: 12rpx; font-size: 22rpx; color: var(--text-secondary); }
.rec-chip {
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  font-weight: 600;
  color: rgb(var(--mz-on-primary));
  background-color: rgb(var(--mz-primary));
}
.entry-btn { width: 100%; font-size: 26rpx; }

/* 预设库 */
.presets { margin-top: 24rpx; }
.preset {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.preset-name { font-size: 26rpx; font-weight: 600; color: var(--text-primary); }
.preset-note { font-size: 20rpx; color: var(--text-secondary); }
.preset-rec { font-size: 22rpx; color: var(--text-secondary); flex-shrink: 0; }
.dot { width: 16rpx; height: 16rpx; border-radius: 9999rpx; flex-shrink: 0; }
.apply-btn {
  margin-top: 24rpx;
  width: 100%;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--brand-700);
  background-color: rgb(var(--mz-surface-container-high));
}

/* 就绪条 */
.ready {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.ready-tile {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.ready-title { font-size: 26rpx; font-weight: 600; color: var(--text-primary); }
.ready-sub { font-size: 20rpx; line-height: 1.6; color: var(--text-secondary); }
.ready-chip-tag {
  padding: 6rpx 18rpx;
  border-radius: 14rpx;
  font-size: 20rpx;
  flex-shrink: 0;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-lowest));
}
</style>
