<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchResult {
  name: string
  [key: string]: any
}

export interface SearchResponse {
  ok: boolean
  data: SearchResult[]
  total?: number
}

const props = defineProps<{
  placeholder?: string
  searchFn: (search: string, limit: number, page: number) => Promise<SearchResponse>
  class?: string
  disabled?: boolean
}>()

const modelValue = defineModel<string>({ default: '' })

const open = ref(false)
const searchQuery = ref('')
const items = ref<SearchResult[]>([])
const loading = ref(false)
const hasMore = ref(true)
const page = ref(1)
const limit = 20
const searchVersion = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// 搜索
async function loadItems(reset = false) {
  if (!reset && !hasMore.value)
    return

  const currentVersion = ++searchVersion.value

  if (reset) {
    page.value = 1
    hasMore.value = true
  }

  loading.value = true
  try {
    const result = await props.searchFn(searchQuery.value, limit, page.value)

    if (currentVersion !== searchVersion.value) {
      return
    }

    if (result.ok) {
      if (reset) {
        items.value = result.data
      }
      else {
        items.value.push(...result.data)
      }
      hasMore.value = result.data.length >= limit
      page.value++
    }
  }
  catch (e) {
    console.error('搜索失败', e)
  }
  finally {
    if (currentVersion === searchVersion.value) {
      loading.value = false
    }
  }
}

// 监听搜索词变化（防抖）
watchDebounced(
  searchQuery,
  () => {
    loadItems(true)
  },
  { debounce: 300 },
)

// 无限滚动
function handleScroll(e: Event) {
  const target = e.target as HTMLElement
  if (!target)
    return

  const { scrollTop, scrollHeight, clientHeight } = target
  if (scrollHeight - scrollTop - clientHeight < 100) {
    if (!loading.value && hasMore.value) {
      loadItems(false)
    }
  }
}

// 选择 — 支持 item.value 作为唯一标识（默认使用 item.name）
function selectItem(item: SearchResult) {
  const val = item.value ?? item.name
  modelValue.value = val === modelValue.value ? '' : val
  open.value = false
}

// 打开时初始加载
watch(open, (isOpen) => {
  if (isOpen && !props.disabled) {
    searchQuery.value = ''
    items.value = []
    loadItems(true)
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
  else if (isOpen && props.disabled) {
    // 如果禁用状态下被打开，立即关闭
    open.value = false
  }
})

// 获取显示文本
const displayText = computed(() => {
  return modelValue.value || props.placeholder || '请选择...'
})

// 清除选择
function clearValue(e: Event) {
  e.stopPropagation()
  e.preventDefault()
  modelValue.value = ''
  open.value = false // 确保不打开下拉列表
}
</script>

<template>
  <div class="relative">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          role="combobox"
          :aria-expanded="open"
          :disabled="props.disabled"
          :class="cn('justify-between font-normal h-9', props.class || 'w-full', { 'text-muted-foreground': !modelValue })"
        >
          <span class="truncate">{{ displayText }}</span>
          <div class="ml-2 flex items-center gap-1 shrink-0">
            <ChevronsUpDown class="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-[--reka-popover-trigger-width] p-0" align="start">
        <!-- 搜索框 -->
        <div class="flex h-9 items-center gap-2 border-b px-3">
          <Search class="size-4 shrink-0 opacity-50" />
          <input
            ref="inputRef"
            v-model="searchQuery"
            type="text"
            placeholder="输入关键字搜索..."
            class="placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
        </div>

        <!-- 列表 -->
        <div
          class="max-h-[200px] overflow-y-auto p-1"
          @scroll="handleScroll"
        >
          <!-- 空状态 -->
          <div v-if="!loading && items.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            {{ searchQuery ? '未找到匹配项' : '暂无数据' }}
          </div>

          <!-- 列表项 -->
          <div
            v-for="item in items"
            :key="item.value ?? item.name"
            class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            @click="selectItem(item)"
          >
            <Check
              :class="cn(
                'mr-2 h-4 w-4',
                modelValue === (item.value ?? item.name) ? 'opacity-100' : 'opacity-0',
              )"
            />
            <span class="flex-1 flex items-center justify-between gap-2">
              <span>{{ item.name }}</span>
              <span v-if="item.shipper" class="text-xs text-muted-foreground">{{ item.shipper }}</span>
              <span v-else-if="item.order_item_no" class="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{{ item.order_item_no }}</span>
            </span>
          </div>

          <!-- 加载中 -->
          <div v-if="loading" class="py-2 text-center text-sm text-muted-foreground">
            <Loader2 class="inline-block h-4 w-4 animate-spin mr-1" />
            加载中...
          </div>

          <!-- 加载更多提示 -->
          <div v-else-if="hasMore && items.length > 0" class="py-2 text-center text-sm text-muted-foreground">
            向下滚动加载更多
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- 清除按钮 - 独立于Button，避免触发下拉 -->
    <button
      v-if="modelValue && !props.disabled"
      type="button"
      class="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-sm transition-colors z-10"
      @click="clearValue"
    >
      <X class="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
    </button>
  </div>
</template>
