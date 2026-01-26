<script setup lang="ts">
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-vue-next'
import { watchDebounced } from '@vueuse/core'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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
  if (!reset && !hasMore.value) return

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
      } else {
        items.value.push(...result.data)
      }
      hasMore.value = result.data.length >= limit
      page.value++
    }
  } catch (e) {
    console.error('搜索失败', e)
  } finally {
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
  { debounce: 300 }
)

// 无限滚动
function handleScroll(e: Event) {
  const target = e.target as HTMLElement
  if (!target) return

  const { scrollTop, scrollHeight, clientHeight } = target
  if (scrollHeight - scrollTop - clientHeight < 100) {
    if (!loading.value && hasMore.value) {
      loadItems(false)
    }
  }
}

// 选择
function selectItem(name: string) {
  modelValue.value = name === modelValue.value ? '' : name
  open.value = false
}

// 打开时初始加载
watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = ''
    items.value = []
    loadItems(true)
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

// 获取显示文本
const displayText = computed(() => {
  return modelValue.value || props.placeholder || '请选择...'
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :aria-expanded="open"
        :class="cn('justify-between font-normal h-9', props.class || 'w-full', { 'text-muted-foreground': !modelValue })"
      >
        <span class="truncate">{{ displayText }}</span>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
          :key="item.name"
          class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          @click="selectItem(item.name)"
        >
          <Check
            :class="cn(
              'mr-2 h-4 w-4',
              modelValue === item.name ? 'opacity-100' : 'opacity-0'
            )"
          />
          {{ item.name }}
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
</template>
