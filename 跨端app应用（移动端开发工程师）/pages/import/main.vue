<template>
  <mz-page title="账单导入">
    <template #nav-right>
      <view class="nav-btn" @tap="goHistory">
        <mz-icon name="history" :size="20" />
        <text class="nav-btn-text">导入历史</text>
      </view>
    </template>

    <view class="page">
      <!-- ===== 页头 ===== -->
      <view class="intro">
        <view class="row items-center gap-2">
          <view class="badge">
            <mz-icon name="security" :size="14" color="#0F766E" />
            <text>本地解析</text>
          </view>
          <text class="t-label-sm c-secondary">原始文件不上传服务器</text>
        </view>
        <text class="t-h1">账单极速导入</text>
        <text class="t-body-sm c-secondary lead">
          支持微信与支付宝账单文本解析、账本查重与自动分类；原始文件只在当前设备读取。
        </text>
      </view>

      <!-- ===== 方式一：文本粘贴 ===== -->
      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <view class="tile">
              <mz-icon name="format_image_left" :size="22" color="#0F766E" />
            </view>
            <view class="col">
              <text class="t-h3">方式一：文本智能识别导入</text>
              <text class="t-body-sm c-secondary">复制微信「账单明细」或支付宝「账单列表」文本粘贴即可</text>
            </view>
          </view>
          <text class="chip">秒级提取</text>
        </view>

        <textarea
          v-model="rawText"
          class="ta"
          :maxlength="-1"
          :placeholder="PLACEHOLDER"
          placeholder-class="ta-ph"
          :auto-height="false"
        />

        <view class="between">
          <text class="link" @tap="clearAll">清空输入</text>
          <view class="mz-btn mz-btn-primary" @tap="doParse('import_text', null)">
            <mz-icon name="auto_fix_high" :size="18" color="#FFFFFF" />
            <text class="btn-text">立即智能解析</text>
          </view>
        </view>
      </view>

      <!-- ===== 方式二：文件上传 ===== -->
      <view class="mz-card">
        <view class="between">
          <view class="row items-center gap-2">
            <view class="tile tile-alt">
              <mz-icon name="upload_file" :size="22" color="#0E7490" />
            </view>
            <view class="col">
              <text class="t-h3">方式二：账单导出文件上传</text>
              <text class="t-body-sm c-secondary">微信支付解压 CSV / 支付宝账单 CSV</text>
            </view>
          </view>
          <text class="chip chip-alt">无外发</text>
        </view>

        <view class="drop" @tap="pickFile">
          <view class="drop-icon">
            <mz-icon name="download" :size="30" color="#0F766E" />
          </view>
          <text class="t-body bold">点击选择账单文件</text>
          <text class="drop-hint">{{ pickHint }}</text>
          <text v-if="fileName" class="drop-file ellipsis">已选择：{{ fileName }}</text>
        </view>

        <view class="note">
          <mz-icon name="bolt" :size="20" color="#0F766E" />
          <text class="note-text">原始文件仅由当前设备读取，服务器只接收你确认后的结构化流水。</text>
        </view>
      </view>

      <!-- 有行没解析出来时，把用户引到异常诊断页，而不是只弹一句 toast -->
      <view v-if="parseErrors.length" class="warn">
        <mz-icon name="error_outline" :size="22" color="#B45309" />
        <view class="col warn-body">
          <text class="warn-title">有 {{ parseErrors.length }} 行没能识别</text>
          <text class="warn-text ellipsis">{{ parseErrors[0] }}</text>
        </view>
        <view class="mz-btn warn-btn" @tap="goDiagnose">查看诊断</view>
      </view>

      <!-- ===== 解析结果汇总 ===== -->
      <view class="mz-card">
        <view class="grid-3">
          <view class="stat">
            <text class="stat-label">解析结果</text>
            <text class="stat-value tnum">{{ rows.length }} 笔</text>
          </view>
          <view class="stat">
            <text class="stat-label">疑似重复已排除</text>
            <text class="stat-value tnum c-secondary">{{ dupCount }} 笔</text>
          </view>
          <view class="stat">
            <text class="stat-label">待导入有效流水</text>
            <text class="stat-value tnum c-primary">{{ chosen.length }} 笔</text>
          </view>
        </view>

        <view class="sums">
          <view class="col flex-1">
            <text class="stat-label">预估合计支出</text>
            <text class="sum-value tnum">{{ fmt.money(expenseTotal) }}</text>
          </view>
          <view class="divider-v"></view>
          <view class="col flex-1">
            <text class="stat-label">预估入账收入</text>
            <text class="sum-value tnum c-primary">+{{ fmt.money(incomeTotal) }}</text>
          </view>
        </view>
      </view>

      <!-- ===== 明细核对 ===== -->
      <view class="mz-card">
        <view class="between">
          <text class="t-h3">核对明细</text>
          <view class="row items-center gap-2" @tap="hideDuplicates = !hideDuplicates">
            <view class="box" :class="{ on: hideDuplicates }">
              <mz-icon v-if="hideDuplicates" name="check_circle" :size="16" color="#FFFFFF" />
            </view>
            <text class="t-body-sm">隐藏已去重流水</text>
          </view>
        </view>

        <view v-if="visibleRows.length" class="rows">
          <view v-for="r in visibleRows" :key="r.index" class="row-item" :class="{ dup: r.duplicate }">
            <view class="box box-tap" :class="{ on: r.selected }" @tap="toggleRow(r)">
              <mz-icon v-if="r.selected" name="check_circle" :size="16" color="#FFFFFF" />
            </view>

            <view class="col flex-1 row-main">
              <view class="between">
                <text class="row-name ellipsis" :class="{ strike: r.duplicate }">{{ r.merchant }}</text>
                <text class="row-amount tnum" :class="{ 'c-primary': r.type === 'income' }">
                  {{ (r.type === 'income' ? '+' : '') + fmt.money(r.amount) }}
                </text>
              </view>
              <text class="row-sub ellipsis">{{ fmt.date(r.happenedAt).slice(5) }} {{ fmt.time(r.happenedAt) }} · {{ r.note || '无备注' }}</text>
              <view class="row-tags">
                <text class="tag ellipsis">{{ r.categoryName }}</text>
                <text class="tag ellipsis">{{ r.accountName }}</text>
                <text class="tag" :class="r.duplicate ? 'tag-dup' : 'tag-ok'">
                  {{ r.duplicate ? '疑似重复' : '待导入' }}
                </text>
              </view>
            </view>
          </view>
        </view>

        <view v-else class="inline-empty">
          <text>{{ rows.length ? '已隐藏全部疑似重复流水' : '粘贴账单文本或选择文件后，点击「立即智能解析」' }}</text>
        </view>
      </view>
    </view>

    <!-- ===== 底部核对条 ===== -->
    <template #overlay>
      <view class="bar">
        <view class="bar-info">
          <text class="bar-label">已选择 <text class="tnum">{{ chosen.length }}</text> 笔流水</text>
          <text class="bar-detail">{{ selectedDetail }}</text>
          <text class="bar-amount">合计支出：<text class="tnum bold">{{ fmt.money(expenseTotal) }}</text></text>
          <view class="row items-center gap-1">
            <mz-icon name="history" :size="16" color="#0E7490" />
            <text class="bar-undo">导入后 10 分钟内可一键撤销</text>
          </view>
        </view>

        <view class="bar-actions">
          <view class="mz-btn mz-btn-ghost" @tap="clearAll">清空重传</view>
          <view class="mz-btn mz-btn-primary" @tap="confirmImport">
            <mz-icon name="check_circle" :size="18" color="#FFFFFF" />
            <text class="btn-text">确认导入 ({{ chosen.length }}笔)</text>
          </view>
        </view>
      </view>
    </template>
  </mz-page>
</template>

<script>
/* 账单导入·主页面（浏览器版 18-import-main.html + assets/js/import-pages.js）。
 *
 * 结构上和浏览器版一一对应：文本通道 / 文件通道 / 解析汇总 / 明细核对 / 底部核对条。
 * 三处刻意的差异，都在下面注明：
 *
 *   1. 表格 → 卡片行。浏览器版是一张 7 列的宽表；手机上没法横向塞下，
 *      改成一行一笔的卡片，「勾选 / 时间 / 商户+备注 / 金额 / 分类 / 账户 / 状态」原样保留。
 *   2. 浏览器版工具栏上那几颗「全部流水 (47)」「待核验 (35)」「未分类 (3)」「高级去重规则」
 *      带有硬编码的假数字、且 import-pages.js 里**从来没有绑定过事件** —— 是纯装饰。
 *      照搬到手机上会变成一片点了没反应的按钮，所以只保留真正有逻辑的「隐藏已去重流水」。
 *   3. 「支持格式帮助」在浏览器版里也是空按钮（无事件）。20-import-diagnose 在原型里
 *      只能从导航台进入，手机上没有导航台，所以把它接到这一颗按钮上，否则异常诊断页就没有入口。
 *      另外解析出现失败行时也会在页内给一条通往诊断页的提示。
 *
 * 解析逻辑（正则、分类匹配、去重口径）逐行照抄，不做「优化」——
 * 这个正则就是产品对「日期 时间 商户 金额 渠道」格式的定义。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import fmt from '@/common/fmt'
import { toast } from '@/common/ui'
import { meta } from '@/common/store'

const PLACEHOLDER =
  '示例格式：\n' +
  '2024-09-15 12:30:14 麦当劳汉堡王快餐店 -28.00 微信支付\n' +
  '2024-09-15 18:22:01 杭州地铁单程票扫码乘车 -4.00 支付宝余额\n' +
  '2024-09-16 09:00:00 薪资代发转入公司企业账户 +8,000.00 建设银行储蓄卡'

const LINE_RE =
  /(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})(?:\s+|T)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s+([+-]?[¥￥]?\s*[\d,]+(?:\.\d{1,2})?)(?:\s+(.+))?$/

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      fmt,
      PLACEHOLDER,
      ctx: null,
      rawText: '',
      rows: [],
      duplicates: {},
      parseErrors: [],
      source: 'import_text',
      fileName: null,
      hideDuplicates: false,
    }
  },
  computed: {
    chosen() {
      return this.rows.filter(function (x) {
        return x.selected
      })
    },
    dupCount() {
      return Object.keys(this.duplicates).length
    },
    expenseTotal() {
      return this.chosen.reduce(function (n, x) {
        return x.type === 'expense' ? n + x.amount : n
      }, 0)
    },
    incomeTotal() {
      return this.chosen.reduce(function (n, x) {
        return x.type === 'income' ? n + x.amount : n
      }, 0)
    },
    selectedDetail() {
      return this.dupCount ? '已自动取消 ' + this.dupCount + ' 笔疑似重复' : '未发现疑似重复'
    },
    visibleRows() {
      const self = this
      return this.rows
        .map(function (r, i) {
          return Object.assign({ index: i, duplicate: !!self.duplicates[i] }, r)
        })
        .filter(function (r) {
          return self.hideDuplicates ? !r.duplicate : true
        })
    },
    pickHint() {
      // #ifdef H5
      return '支持 UTF-8 编码的 .csv、.txt 文件'
      // #endif
      // #ifdef MP-WEIXIN
      return '从聊天记录里选择 .csv、.txt 文件'
      // #endif
      // #ifdef APP-PLUS
      return 'App 端请改用上方文本粘贴方式'
      // #endif
      return '支持 UTF-8 编码的 .csv、.txt 文件'
    },
  },
  onLoad() {
    const self = this
    meta()
      .then(function (ctx) {
        self.ctx = ctx
      })
      .catch(function () {
        /* 提示已在 api 层弹过；解析时会给出「请先创建账户与分类」的兜底文案 */
      })
  },
  methods: {
    defaultAccount() {
      const list = (this.ctx && this.ctx.accounts) || []
      return (
        list.filter(function (x) {
          return x.isDefault && !x.isArchived
        })[0] ||
        list.filter(function (x) {
          return !x.isArchived
        })[0]
      )
    },
    categoryFor(type, merchant) {
      const ctx = this.ctx || {}
      const rules = (ctx.categoryRules || []).slice().sort(function (a, b) {
        return b.priority - a.priority
      })
      const hit = rules.filter(function (r) {
        if (r.categoryType !== type) return false
        const hay = String(merchant || '').toLowerCase()
        const key = String(r.keyword || '').toLowerCase()
        if (!key) return false
        return r.matchType === 'equals' ? hay === key : hay.indexOf(key) !== -1
      })[0]
      if (hit) {
        return (ctx.categories || []).filter(function (c) {
          return c.id === hit.categoryId
        })[0]
      }
      return (ctx.categories || []).filter(function (c) {
        return c.type === type && !c.isArchived
      })[0]
    },
    parseLine(line, index) {
      const clean = String(line == null ? '' : line).trim()
      if (!clean) return null
      const m = clean.match(LINE_RE)
      if (!m) {
        return { error: '第 ' + (index + 1) + ' 行无法识别：请使用「日期 时间 商户 金额 渠道」格式' }
      }
      const signed = Number(m[4].replace(/[¥￥,\s]/g, ''))
      if (!isFinite(signed) || signed === 0) return { error: '第 ' + (index + 1) + ' 行金额无效' }
      const type = signed > 0 ? 'income' : 'expense'
      const merchant = m[3].trim()
      const category = this.categoryFor(type, merchant)
      const account = this.defaultAccount()
      if (!category || !account) return { error: '请先在设置中创建可用的账户与分类' }
      return {
        type,
        amount: Math.abs(signed),
        happenedAt: m[1].replace(/\//g, '-') + ' ' + (m[2].length === 5 ? m[2] + ':00' : m[2]),
        merchant,
        note: String(m[5] || '').trim().slice(0, 100),
        accountId: account.id,
        accountName: account.name,
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        selected: true,
      }
    },
    doParse(source, fileName) {
      const self = this
      const rows = []
      const errors = []
      String(this.rawText || '')
        .replace(/^﻿/, '')
        .split(/\r?\n/)
        .forEach(function (line, i) {
          const parsed = self.parseLine(line, i)
          if (!parsed) return
          if (parsed.error) errors.push(parsed.error)
          else rows.push(parsed)
        })

      this.source = source
      this.fileName = fileName || null
      this.parseErrors = errors

      if (!rows.length) {
        toast(errors[0] || '没有识别到可导入流水', 'error')
        this.rows = []
        this.duplicates = {}
        return
      }
      if (errors.length) toast('已跳过 ' + errors.length + ' 行无法识别的内容', 'info')

      this.rows = rows
      this.duplicates = {}

      api
        .post('/import/dedup-check', {
          items: rows.map(function (x) {
            return { amount: x.amount, happenedAt: x.happenedAt, merchant: x.merchant }
          }),
        })
        .then(function (result) {
          ;(result.items || []).forEach(function (x) {
            if (!x.duplicate) return
            self.duplicates[x.index] = x
            if (self.rows[x.index]) self.rows[x.index].selected = false
          })
          toast('已解析 ' + rows.length + ' 笔，并完成重复检测', 'success')
        })
    },
    toggleRow(r) {
      this.rows[r.index].selected = !this.rows[r.index].selected
    },
    clearAll() {
      this.rawText = ''
      this.rows = []
      this.duplicates = {}
      this.parseErrors = []
      this.fileName = null
    },
    confirmImport() {
      const self = this
      const chosen = this.chosen
      if (!chosen.length) {
        toast('请至少选择一笔流水', 'error')
        return
      }
      const batchNo = 'WEB-' + Date.now().toString(36).toUpperCase()
      api
        .post('/import/batches', {
          batchNo,
          source: this.source,
          channel: 'other',
          fileName: this.source === 'import_csv' ? this.fileName : undefined,
          totalCount: this.rows.length,
          duplicateCount: this.dupCount,
          items: chosen.map(function (x) {
            return {
              type: x.type,
              amount: x.amount,
              happenedAt: x.happenedAt,
              merchant: x.merchant,
              note: x.note,
              accountId: x.accountId,
              categoryId: x.categoryId,
            }
          }),
        })
        .then(function (result) {
          toast('已导入 ' + chosen.length + ' 笔流水', 'success')
          uni.redirectTo({
            url: '/pages/import/success?batch=' + result.batch.id,
          })
        })
    },
    /**
     * 取文件的具体做法按平台分叉 —— 这是本项目里唯一没法「一套代码」的地方：
     *   H5      uni.chooseFile 拿到 File，直接 FileReader 读文本
     *   小程序   只能从聊天记录里选文件（wx.chooseMessageFile），再走文件系统读
     *   App     没有系统级文件选择器，明确引导用粘贴通道，而不是给一个点不动的按钮
     */
    pickFile() {
      const self = this
      // #ifdef H5
      uni.chooseFile({
        count: 1,
        extension: ['.csv', '.txt'],
        success(res) {
          const file = res.tempFiles && res.tempFiles[0]
          if (!file) return
          if (!/\.(csv|txt)$/i.test(file.name || '')) {
            toast('当前仅支持 CSV 或 TXT 文本文件', 'error')
            return
          }
          const reader = new FileReader()
          reader.onload = function () {
            self.rawText = String(reader.result || '')
            self.doParse('import_csv', file.name)
          }
          reader.onerror = function () {
            toast('文件读取失败', 'error')
          }
          reader.readAsText(file, 'UTF-8')
        },
      })
      return
      // #endif

      // #ifdef MP-WEIXIN
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['csv', 'txt'],
        success(res) {
          const file = res.tempFiles && res.tempFiles[0]
          if (!file) return
          if (!/\.(csv|txt)$/i.test(file.name || '')) {
            toast('当前仅支持 CSV 或 TXT 文本文件', 'error')
            return
          }
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: 'utf-8',
            success(r) {
              self.rawText = String(r.data || '')
              self.doParse('import_csv', file.name)
            },
            fail() {
              toast('文件读取失败', 'error')
            },
          })
        },
      })
      return
      // #endif

      // #ifdef APP-PLUS
      toast('App 端请使用上方文本粘贴导入', 'none')
      // #endif
    },
    goHistory() {
      uni.navigateTo({ url: '/pages/import/success' })
    },
    goDiagnose() {
      uni.navigateTo({ url: '/pages/import/diagnose' })
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
  /* 底部核对条是悬浮的，正文最后一段要留出它的高度 */
  padding-bottom: 380rpx;
}

.nav-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding: 0 16rpx;
  height: 64rpx;
  border-radius: 9999rpx;
  background-color: rgb(var(--mz-surface-container-low));
  color: var(--text-primary);
}
.nav-btn-text { font-size: 24rpx; }

.intro { display: flex; flex-direction: column; gap: 10rpx; padding: 0 4rpx; }
.lead { line-height: 1.6; }
.badge {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
  background-color: rgb(var(--mz-surface-container-high));
  color: var(--brand-700);
  font-size: 22rpx;
}

.tile {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-low));
}
.tile-alt { background-color: rgb(var(--mz-secondary-container)); }

.chip {
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 22rpx;
  flex-shrink: 0;
  background-color: rgb(var(--mz-surface-container-high));
  color: var(--text-secondary);
}
.chip-alt { color: var(--accent-700); }

/* 文本域 */
.ta {
  width: 100%;
  height: 320rpx;
  margin: 24rpx 0;
  padding: 24rpx;
  box-sizing: border-box;
  border-radius: 20rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: var(--text-primary);
  background-color: rgb(var(--mz-surface-container-low));
}
.ta-ph { color: var(--text-tertiary); font-size: 22rpx; }

.link { font-size: 24rpx; color: var(--text-tertiary); }
.btn-text { margin-left: 8rpx; }

/* 文件通道 */
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  margin-top: 24rpx;
  padding: 48rpx 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.drop-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.drop-hint { font-size: 22rpx; color: var(--text-secondary); text-align: center; }
.drop-file { font-size: 22rpx; color: var(--accent-700); max-width: 100%; }

.note {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.note-text { flex: 1; font-size: 22rpx; color: var(--text-secondary); line-height: 1.5; }

.warn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background-color: var(--warning-bg);
}
.warn-body { flex: 1; min-width: 0; gap: 4rpx; }
.warn-title { font-size: 26rpx; font-weight: 700; color: var(--warning-ink); }
.warn-text { font-size: 22rpx; color: var(--warning-ink); max-width: 100%; }
.warn-btn {
  flex-shrink: 0;
  padding: 0 24rpx;
  height: 64rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  color: var(--warning-ink);
  font-size: 24rpx;
}

/* 汇总 */
.stat { display: flex; flex-direction: column; gap: 8rpx; }
.stat-label { font-size: 22rpx; color: var(--text-secondary); }
.stat-value { font-size: 32rpx; font-weight: 700; color: var(--text-primary); }
.sums {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24rpx;
  margin-top: 28rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.sum-value { font-size: 30rpx; font-weight: 700; color: var(--text-primary); }
.divider-v { width: 1rpx; height: 48rpx; background-color: var(--border); }

/* 明细 */
.rows { margin-top: 20rpx; display: flex; flex-direction: column; }
.row-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 18rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.row-item:last-child { border-bottom: none; }
.row-item.dup { opacity: 0.6; }
.row-main { gap: 8rpx; }
.row-name { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.strike { text-decoration: line-through; color: var(--text-secondary); }
.row-amount { font-size: 28rpx; font-weight: 700; color: var(--text-primary); flex-shrink: 0; }
.row-sub { font-size: 22rpx; color: var(--text-secondary); max-width: 100%; }
.row-tags { display: flex; flex-direction: row; flex-wrap: wrap; gap: 10rpx; margin-top: 4rpx; }
.tag {
  max-width: 260rpx;
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
  color: var(--text-secondary);
}
.tag-ok { background-color: rgb(var(--mz-primary-container)); color: var(--brand-700); }
.tag-dup { background-color: rgb(var(--mz-surface-container-high)); }

/* 勾选框：uni 的 checkbox 各端外观差异大，这里自绘一个保证三端一致 */
.box {
  width: 36rpx;
  height: 36rpx;
  border-radius: 10rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid var(--border-strong);
  background-color: transparent;
}
.box.on { border-color: transparent; background-color: var(--brand-600); }
.box-tap { margin-top: 4rpx; }

.inline-empty {
  padding: 64rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 底部核对条 */
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx 24rpx calc(32rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
  background-color: var(--surface);
  border-top: 1rpx solid var(--border);
}
.bar-info { display: flex; flex-direction: column; gap: 6rpx; }
.bar-label { font-size: 28rpx; font-weight: 700; color: var(--text-primary); }
.bar-detail { font-size: 22rpx; color: var(--text-secondary); }
.bar-amount { font-size: 24rpx; color: var(--text-secondary); }
.bar-undo { font-size: 22rpx; color: var(--accent-700); }
.bar-actions { display: flex; flex-direction: row; gap: 16rpx; }
.bar-actions .mz-btn { flex: 1; }
</style>
