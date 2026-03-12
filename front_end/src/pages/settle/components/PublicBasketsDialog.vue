<script setup lang="ts" generic="T extends Record<string, any>">
import { Download, Globe, ShoppingCart, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  open: boolean
  items: T[]
  statistics?: {
    count: number
    totalNum: number
    totalWeight: number
    totalAmount: number
  }
}

interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'export'): void
  (e: 'price-input'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const stats = computed(() => props.statistics || {
  count: props.items.length,
  totalNum: 0,
  totalWeight: 0,
  totalAmount: 0,
})

function close() {
  isOpen.value = false
}

function handleExport() {
  if (props.items.length === 0) {
    toast.warning('公开篮为空，无数据可导出')
    return
  }
  emit('export')
}

function handlePriceInput() {
  if (props.items.length === 0) {
    toast.warning('公开篮为空')
    return
  }
  emit('price-input')
}

defineSlots<{
  item?: (props: { item: T }) => any
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
            <Globe class="w-5 h-5 text-green-600" />
            <span class="font-semibold text-lg">公开篮</span>
            <span class="text-muted-foreground text-sm">({{ items.length }} 条)</span>
          </div>
          <div class="flex items-center gap-1">
            <TooltipProvider :delay-duration="300">
              <!-- 导出按钮 -->
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    class="p-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                    @click="handleExport"
                  >
                    <Download class="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>导出</p></TooltipContent>
              </Tooltip>
              <!-- 价格按钮 -->
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    class="p-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                    @click="handlePriceInput"
                  >
                    <span class="text-sm font-medium">¥</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>设置价格</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              class="p-1 hover:bg-muted rounded-md transition-colors"
              @click="close"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="px-4 py-2 border-b bg-muted/20 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">块数: <strong class="text-foreground">{{ stats.totalNum }}</strong></span>
            <span class="text-muted-foreground">重量: <strong class="text-foreground">{{ stats.totalWeight.toFixed(3) }}</strong> 吨</span>
            <span class="text-muted-foreground">金额: <strong class="text-primary">¥{{ stats.totalAmount.toFixed(2) }}</strong></span>
          </div>
        </div>

        <!-- 提示信息 -->
        <div class="px-4 py-2 border-b bg-green-50 text-xs text-green-700">
          以下是其他用户公开的结算篮内容（只读）
        </div>

        <!-- 列表内容 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div
            v-if="items.length === 0"
            class="flex flex-col items-center justify-center h-full text-muted-foreground"
          >
            <Globe class="w-12 h-12 mb-2 opacity-30" />
            <p>暂无公开的结算篮</p>
            <p class="text-sm">其他用户可在结算篮中开启公开</p>
          </div>
          <div
            v-for="(item, index) in items"
            v-else
            :key="item._id || index"
            class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border transition-colors"
          >
            <slot name="item" :item="item">
              <div class="flex-1 min-w-0">
                <span class="font-medium truncate">{{ item._id }}</span>
              </div>
            </slot>
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
