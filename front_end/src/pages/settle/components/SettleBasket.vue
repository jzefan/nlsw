<script setup lang="ts" generic="T extends Record<string, any>">
import { ShoppingCart, Trash2, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

interface BasketItem {
  _id: string
  [key: string]: any
}

interface Props {
  open: boolean
  items: T[]
  settleMode?: string
  statistics?: {
    count: number
    totalNum: number
    totalWeight: number
    totalAmount: number
  }
}

interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'settle', items: T[]): void
  (e: 'remove', item: T): void
  (e: 'clear'): void
}

const props = withDefaults(defineProps<Props>(), {
  settleMode: '',
})

const emit = defineEmits<Emits>()

// 本地打开状态
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

// 默认统计（如果未提供）
const defaultStatistics = computed(() => ({
  count: props.items.length,
  totalNum: 0,
  totalWeight: 0,
  totalAmount: 0,
}))

const stats = computed(() => props.statistics || defaultStatistics.value)

// 关闭面板
function close() {
  isOpen.value = false
}

// 移除单个项目
function handleRemove(item: T) {
  emit('remove', item)
}

// 清空
function handleClear() {
  if (props.items.length === 0)
    return

  const confirmed = window.confirm('确定要清空结算篮吗？')
  if (confirmed) {
    emit('clear')
  }
}

// 结算
function handleSettle() {
  if (props.items.length === 0) {
    toast.warning('结算篮为空，请先添加提单')
    return
  }
  emit('settle', props.items)
}

// 定义插槽内容的类型
defineSlots<{
  item?: (props: { item: T }) => any
  'item-title'?: (props: { item: T }) => any
  'item-subtitle'?: (props: { item: T }) => any
  'item-details'?: (props: { item: T }) => any
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="basket-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/50 z-50"
        @click="close"
      />
    </Transition>
    <Transition name="basket-slide">
      <div
        v-if="isOpen"
        class="fixed top-0 right-0 bottom-0 w-[500px] max-w-[90vw] bg-background shadow-xl z-50 flex flex-col"
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div class="flex items-center gap-2">
            <ShoppingCart class="w-5 h-5 text-primary" />
            <span class="font-semibold text-lg">结算篮</span>
            <span class="text-muted-foreground text-sm">({{ items.length }} 条)</span>
          </div>
          <button
            class="p-1 hover:bg-muted rounded-md transition-colors"
            @click="close"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- 统计信息 -->
        <div class="px-4 py-2 border-b bg-muted/20 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">块数: <strong class="text-foreground">{{ stats.totalNum }}</strong></span>
            <span class="text-muted-foreground">重量: <strong class="text-foreground">{{ stats.totalWeight.toFixed(3) }}</strong> 吨</span>
            <span class="text-muted-foreground">金额: <strong class="text-primary">¥{{ stats.totalAmount.toFixed(2) }}</strong></span>
          </div>
        </div>

        <!-- 移动端顶部操作按钮 -->
        <div class="md:hidden px-4 py-2 border-b bg-muted/30">
          <div class="flex items-center gap-2">
            <UiButton
              variant="outline"
              size="sm"
              class="flex-1"
              :disabled="items.length === 0"
              @click="handleClear"
            >
              <Trash2 class="w-4 h-4 mr-1" />
              清空
            </UiButton>
            <UiButton
              variant="default"
              size="sm"
              class="flex-1"
              :disabled="items.length === 0"
              @click="handleSettle"
            >
              结算 ({{ items.length }})
            </UiButton>
          </div>
        </div>

        <!-- 列表内容 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div
            v-if="items.length === 0"
            class="flex flex-col items-center justify-center h-full text-muted-foreground"
          >
            <ShoppingCart class="w-12 h-12 mb-2 opacity-30" />
            <p>结算篮为空</p>
            <p class="text-sm">请选择提单后点击"加入结算篮"</p>
          </div>
          <div
            v-for="item in items"
            v-else
            :key="item._id"
            class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors"
          >
            <!-- 使用插槽自定义显示内容 -->
            <slot name="item" :item="item">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <slot name="item-title" :item="item">
                    <span class="font-medium truncate">{{ item._id }}</span>
                  </slot>
                </div>
                <slot name="item-subtitle" :item="item">
                  <div class="text-sm text-muted-foreground truncate">
                    {{ item.name || '-' }}
                  </div>
                </slot>
                <slot name="item-details" :item="item">
                  <div class="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>详情</span>
                  </div>
                </slot>
              </div>
            </slot>
            <button
              class="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title="从结算篮移除"
              @click="handleRemove(item)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 底部操作（桌面端） -->
        <div class="hidden md:block px-4 py-3 border-t bg-muted/30 space-y-2">
          <div class="flex items-center gap-2">
            <UiButton
              variant="outline"
              size="sm"
              class="flex-1"
              :disabled="items.length === 0"
              @click="handleClear"
            >
              <Trash2 class="w-4 h-4 mr-1" />
              清空
            </UiButton>
            <UiButton
              variant="default"
              size="sm"
              class="flex-1"
              :disabled="items.length === 0"
              @click="handleSettle"
            >
              结算 ({{ items.length }})
            </UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.basket-fade-enter-active,
.basket-fade-leave-active {
  transition: opacity 0.2s ease;
}
.basket-fade-enter-from,
.basket-fade-leave-to {
  opacity: 0;
}

.basket-slide-enter-active,
.basket-slide-leave-active {
  transition: transform 0.3s ease;
}
.basket-slide-enter-from,
.basket-slide-leave-to {
  transform: translateX(100%);
}
</style>
