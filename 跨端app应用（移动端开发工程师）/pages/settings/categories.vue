<template>
  <mz-page title="分类管理">
    <view class="page">
      <view class="intro">
        <text class="t-label-sm c-primary">设置 · 分类管理</text>
        <text class="t-h1">收支分类</text>
        <text class="t-body-sm c-secondary lead">
          分类变更会同步到记账、预算和统计页面；归档不会删除历史流水。
        </text>
      </view>

      <view class="mz-btn mz-btn-primary mz-btn-block" @tap="openCreate">
        <mz-icon name="add" :size="18" color="#FFFFFF" />
        <text>新增分类</text>
      </view>

      <view class="tabs">
        <view class="tab" :class="{ 'tab-on': type === 'expense' }" @tap="type = 'expense'">支出分类</view>
        <view class="tab" :class="{ 'tab-on': type === 'income' }" @tap="type = 'income'">收入分类</view>
      </view>

      <view v-if="loading" class="skeleton">
        <view v-for="n in 4" :key="n" class="sk-line"></view>
      </view>

      <view v-else-if="filtered.length" class="grid">
        <view v-for="c in filtered" :key="c.id" class="cat" @tap="openEdit(c)">
          <view class="cat-icon" :style="{ backgroundColor: tint(c.color) }">
            <mz-icon :name="iconOf(c.icon)" :size="22" :color="c.color || '#14B8A6'" />
          </view>
          <view class="col flex-1 cat-main">
            <text class="cat-name ellipsis">{{ c.name }}</text>
            <text class="t-label-sm c-secondary">{{ c.isSystem ? '系统预设' : '自定义分类' }}</text>
          </view>
          <view class="icon-btn">
            <mz-icon name="edit" :size="20" color="#64748B" />
          </view>
        </view>
      </view>

      <view v-else class="inline-empty"><text>暂无分类</text></view>
    </view>

    <!-- ===== 编辑 / 新增抽屉 ===== -->
    <view v-if="editor.open" class="mask" @tap="closeEditor">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <view class="col flex-1">
            <text class="t-h3">{{ editor.item ? '编辑分类' : '新增分类' }}</text>
            <text class="t-body-sm c-secondary">名称最多 12 个字，类型创建后不可修改。</text>
          </view>
          <view class="icon-btn" @tap="closeEditor">
            <mz-icon name="close" :size="22" color="#64748B" />
          </view>
        </view>

        <scroll-view class="sheet-body" scroll-y>
          <view class="field">
            <text class="t-label">分类类型</text>
            <view class="type-row">
              <view
                class="type-opt"
                :class="{ 'type-opt-on': editor.type === 'expense', 'type-opt-off': !!editor.item }"
                @tap="pickType('expense')"
              >
                <mz-icon name="arrow_outward" :size="16" color="#0F766E" />
                <text>支出</text>
              </view>
              <view
                class="type-opt"
                :class="{ 'type-opt-on': editor.type === 'income', 'type-opt-off': !!editor.item }"
                @tap="pickType('income')"
              >
                <mz-icon name="arrow_downward" :size="16" color="#0F766E" />
                <text>收入</text>
              </view>
            </view>
          </view>

          <view class="field">
            <view class="between">
              <text class="t-label">分类名称</text>
              <text class="t-label-sm c-tertiary">{{ editor.name.length }} / 12</text>
            </view>
            <input
              v-model="editor.name"
              class="mz-input"
              type="text"
              :maxlength="12"
              placeholder="请输入类目名称"
              placeholder-class="ph"
            />
          </view>

          <view class="field">
            <text class="t-label">类目图标</text>
            <view class="icon-pick">
              <view
                v-for="ic in ICONS"
                :key="ic"
                class="icon-cell"
                :class="{ 'icon-cell-on': editor.icon === ic }"
                @tap="editor.icon = ic"
              >
                <mz-icon :name="ic" :size="22" :color="editor.icon === ic ? '#0F766E' : '#64748B'" />
              </view>
            </view>
          </view>

          <view class="field">
            <text class="t-label">分类主题色</text>
            <view class="color-pick">
              <view
                v-for="co in COLORS"
                :key="co"
                class="color-dot"
                :class="{ 'color-dot-on': editor.color === co }"
                :style="{ backgroundColor: co }"
                @tap="editor.color = co"
              >
                <mz-icon v-if="editor.color === co" name="check" :size="14" color="#FFFFFF" />
              </view>
            </view>
          </view>
        </scroll-view>

        <view class="sheet-foot">
          <view
            v-if="editor.item"
            class="mz-btn mz-btn-sm mz-btn-ghost danger-text"
            @tap="archive"
          >归档分类</view>
          <view v-else class="spacer"></view>
          <view class="row gap-2">
            <view class="mz-btn mz-btn-ghost" @tap="closeEditor">取消</view>
            <view class="mz-btn mz-btn-primary" :class="{ 'is-busy': editor.busy }" @tap="save">保存</view>
          </view>
        </view>
      </view>
    </view>
  </mz-page>
</template>

<script>
/* 分类管理（浏览器版 22-settings-categories.html + categories-page.js）。
 *
 * 浏览器版把 main 整块换掉重画，编辑用动态创建的遮罩层。这里换成 Vue 的
 * v-for + 一个页面内抽屉，语义一致：类型 tabs、九宫格卡片、新增/编辑/归档。
 *
 * 两处刻意的偏差：
 *   1. 图标表里 school 不在字体子集里，换成 history_edu；同时打开编辑器时
 *      把历史别名（school / card_giftcard / work）规整成可用图标，存一次就修好。
 *   2. 分类改动会让 meta 缓存过期，保存/归档后必须 invalidateMeta()，
 *      否则记账面板还在用旧的分类列表。
 */
import mzIcon from '@/components/mz-icon/mz-icon.vue'
import mzPage from '@/components/mz-page/mz-page.vue'
import api from '@/common/api'
import { invalidateMeta } from '@/common/store'
import { toast, confirm } from '@/common/ui'

const ICONS = [
  'restaurant',
  'directions_subway',
  'shopping_bag',
  'home',
  'sports_esports',
  'medical_services',
  'history_edu',
  'pets',
  'payments',
  'category',
]
const COLORS = ['#14B8A6', '#06B6D4', '#F59E0B', '#6366F1', '#8B5CF6', '#EC4899', '#64748B']

const ICON_ALIAS = {
  school: 'history_edu',
  card_giftcard: 'redeem',
  work: 'account_balance',
}

function iconOf(name) {
  return ICON_ALIAS[name] || name || 'category'
}

export default {
  components: { mzIcon, mzPage },
  data() {
    return {
      ICONS,
      COLORS,
      loading: true,
      items: [],
      type: 'expense',
      editor: {
        open: false,
        item: null,
        type: 'expense',
        name: '',
        icon: 'category',
        color: '#14B8A6',
        busy: false,
      },
    }
  },
  computed: {
    filtered() {
      const t = this.type
      return this.items.filter(function (x) {
        return x.type === t
      })
    },
  },
  onLoad() {
    this.load()
  },
  methods: {
    iconOf,
    tint(color) {
      return (color || '#14B8A6') + '1A'
    },
    load() {
      const self = this
      return api
        .get('/categories', { includeArchived: 0 })
        .then(function (items) {
          self.items = items || []
          self.loading = false
        })
        .catch(function () {
          self.loading = false
        })
    },
    openCreate() {
      this.editor = {
        open: true,
        item: null,
        type: this.type,
        name: '',
        icon: 'category',
        color: '#14B8A6',
        busy: false,
      }
    },
    openEdit(item) {
      this.editor = {
        open: true,
        item: item,
        type: item.type,
        name: item.name || '',
        icon: iconOf(item.icon),
        color: item.color || '#14B8A6',
        busy: false,
      }
    },
    closeEditor() {
      this.editor.open = false
    },
    pickType(t) {
      // 类型创建后不可修改 —— 编辑态下忽略切换
      if (this.editor.item) return
      this.editor.type = t
    },
    save() {
      const self = this
      const e = this.editor
      const name = String(e.name || '').trim()
      if (!name) {
        toast('请输入分类名称', 'error')
        return
      }
      if (e.busy) return
      e.busy = true
      const body = { name: name, icon: e.icon, color: e.color }
      const req = e.item
        ? api.patch('/categories/' + e.item.id, body)
        : api.post('/categories', Object.assign(body, { type: e.type }))
      req
        .then(function () {
          invalidateMeta()
          toast('分类已保存', 'success')
          e.open = false
          return self.load()
        })
        .catch(function () {
          e.busy = false
        })
    },
    archive() {
      const self = this
      const item = this.editor.item
      if (!item) return
      confirm('归档后新记账将不再显示该分类，但历史流水会保留。确认归档？', {
        title: '归档分类',
        confirmText: '确认归档',
        danger: true,
      }).then(function (ok) {
        if (!ok) return
        api.del('/categories/' + item.id).then(function (result) {
          invalidateMeta()
          const n = result && result.txnCount
          toast(n ? '已归档，' + n + ' 笔历史流水保持不变' : '分类已归档', 'success')
          self.editor.open = false
          self.load()
        })
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

.tabs {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  padding: 6rpx;
  border-radius: 18rpx;
  background-color: rgb(var(--mz-surface-container-low));
}
.tab {
  flex: 1;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  font-size: 27rpx;
  color: var(--text-secondary);
}
.tab-on { background-color: rgb(var(--mz-surface-container-lowest)); color: var(--brand-600); font-weight: 700; }

.grid { display: flex; flex-direction: column; gap: 16rpx; }
.cat {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-lowest));
  box-shadow: var(--shadow-tier1);
}
.cat-icon {
  width: 84rpx;
  height: 84rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cat-main { gap: 6rpx; min-width: 0; }
.cat-name { font-size: 29rpx; font-weight: 700; color: var(--text-primary); }
.icon-btn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 抽屉 */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background-color: rgba(15, 23, 42, 0.45);
}
.sheet {
  display: flex;
  flex-direction: column;
  height: 88vh;
  border-radius: 28rpx 28rpx 0 0;
  background-color: rgb(var(--mz-surface-container-lowest));
}
.sheet-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16rpx;
  padding: 28rpx 24rpx 20rpx;
  border-bottom: 1rpx solid var(--border);
}
.sheet-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 24rpx;
}
.sheet-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--border);
}
.spacer { flex: 1; }
.danger-text { color: var(--danger); }

.field { display: flex; flex-direction: column; gap: 12rpx; margin-top: 24rpx; }
.ph { color: var(--text-tertiary); }

.type-row { display: flex; flex-direction: row; gap: 12rpx; }
.type-opt {
  flex: 1;
  height: 78rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: 18rpx;
  font-size: 26rpx;
  color: var(--text-secondary);
  background-color: rgb(var(--mz-surface-container-low));
}
.type-opt-on {
  background-color: rgb(var(--mz-surface-container-lowest));
  color: var(--text-primary);
  font-weight: 700;
  border: 2rpx solid var(--brand-600);
}
.type-opt-off { opacity: 0.5; }

.icon-pick { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12rpx; }
.icon-cell {
  width: 96rpx;
  height: 88rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(var(--mz-surface-container-low));
}
.icon-cell-on {
  background-color: rgb(var(--mz-surface-container-lowest));
  border: 2rpx solid var(--brand-600);
}

.color-pick { display: flex; flex-direction: row; flex-wrap: wrap; gap: 20rpx; }
.color-dot {
  width: 64rpx;
  height: 64rpx;
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.color-dot-on { border: 4rpx solid rgb(var(--mz-surface-container-lowest)); }

.is-busy { opacity: 0.6; }

.inline-empty {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-secondary);
}

.skeleton { display: flex; flex-direction: column; gap: 16rpx; }
.sk-line {
  height: 132rpx;
  border-radius: 20rpx;
  background-color: rgb(var(--mz-surface-container-low));
  animation: sk 1.2s ease-in-out infinite;
}
@keyframes sk {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
