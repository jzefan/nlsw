<script setup lang="ts">
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { FileText, LoaderCircle, PackageSearch, ReceiptText, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type {
  GlobalBillSearchItem,
  GlobalInvoiceSearchItem,
  GlobalSearchItem,
  GlobalSearchResultType,
} from '@/services/api/global-search.api'

import {
  CommandDialog,
  CommandInput,
  CommandList,
} from '@/components/ui/command'
import { searchGlobalRecords } from '@/services/api/global-search.api'
import { formatDate, formatNumber } from '@/utils/format'

const router = useRouter()
const resultsScrollRef = ref<HTMLElement | null>(null)

const open = ref(false)
const keyword = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const hasSearched = ref(false)
const resultType = ref<GlobalSearchResultType>('none')
const items = ref<GlobalSearchItem[]>([])
const currentPage = ref(1)
const hasMore = ref(false)
const pageSize = 8
let activeSearchSession = 0

const shortcutLabel = computed(() => {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform))
    return '⌘K'
  return 'Ctrl K'
})

const resultHeading = computed(() => {
  if (resultType.value === 'bill') return '提单'
  if (resultType.value === 'invoice') return '运单'
  return '搜索结果'
})

const dialogBodyHeightClass = 'h-[320px] min-h-[320px]'
const billGridClass = 'grid-cols-[0.85fr_1.35fr_1.35fr_1.15fr_1.7fr_0.9fr_0.9fr_1.2fr]'
const invoiceGridClass = 'grid-cols-[0.9fr_1.35fr_1.2fr_1.5fr_0.9fr_1fr_1.15fr_1.5fr]'
const billItems = computed<GlobalBillSearchItem[]>(() =>
  items.value.filter((item): item is GlobalBillSearchItem => item.type === 'bill'),
)
const invoiceItems = computed<GlobalInvoiceSearchItem[]>(() =>
  items.value.filter((item): item is GlobalInvoiceSearchItem => item.type === 'invoice'),
)

function formatBillSpec(item: Extract<GlobalSearchItem, { type: 'bill' }>) {
  const parts = [item.thickness, item.width, item.len].filter(value => Number(value) > 0)
  return parts.length > 0 ? parts.join('×') : '-'
}

function resetSearchState() {
  keyword.value = ''
  items.value = []
  resultType.value = 'none'
  hasSearched.value = false
  loading.value = false
  loadingMore.value = false
  currentPage.value = 1
  hasMore.value = false
}

async function fetchSearchPage(rawKeyword: string, page: number, sessionId: number, append = false) {
  const trimmed = rawKeyword.trim()

  if (!trimmed) {
    items.value = []
    resultType.value = 'none'
    hasSearched.value = false
    loading.value = false
    loadingMore.value = false
    hasMore.value = false
    currentPage.value = 1
    return
  }

  if (append) {
    loadingMore.value = true
  }
  else {
    loading.value = true
  }

  try {
    const result = await searchGlobalRecords(trimmed, pageSize, page)
    if (sessionId !== activeSearchSession) {
      return
    }

    if (!result.ok) {
      throw new Error(result.error || '搜索失败')
    }

    items.value = append ? [...items.value, ...(result.items || [])] : (result.items || [])
    resultType.value = result.resultType || 'none'
    hasSearched.value = true
    currentPage.value = result.page || page
    hasMore.value = result.hasMore === true
  }
  catch (error: any) {
    if (sessionId !== activeSearchSession) {
      return
    }

    if (!append) {
      items.value = []
      resultType.value = 'none'
      hasMore.value = false
      currentPage.value = 1
    }
    hasSearched.value = true
    toast.error('搜索失败', { description: error.message || '请稍后重试' })
  }
  finally {
    if (sessionId === activeSearchSession) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

async function runSearch(rawKeyword: string) {
  activeSearchSession += 1
  currentPage.value = 1
  hasMore.value = false
  await fetchSearchPage(rawKeyword, 1, activeSearchSession, false)
}

async function loadMoreResults() {
  if (!hasMore.value || loading.value || loadingMore.value) {
    return
  }

  const trimmed = keyword.value.trim()
  if (!trimmed) {
    return
  }

  await fetchSearchPage(trimmed, currentPage.value + 1, activeSearchSession, true)
}

function handleResultsScroll(event: Event) {
  const target = event.target as HTMLElement | null
  if (!target || loading.value || loadingMore.value || !hasMore.value) {
    return
  }

  const threshold = 48
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - threshold) {
    loadMoreResults()
  }
}

watch(resultType, () => {
  nextTick(() => {
    if (resultsScrollRef.value) {
      resultsScrollRef.value.scrollTop = 0
    }
  })
})

watch(items, () => {
  nextTick(() => {
    if (currentPage.value === 1 && resultsScrollRef.value) {
      resultsScrollRef.value.scrollTop = 0
    }
  })
})

const debouncedSearch = useDebounceFn((value: string) => {
  runSearch(value)
}, 500)

watch(keyword, (value) => {
  debouncedSearch(value)
})

watch(open, (isOpen) => {
  if (!isOpen) {
    resetSearchState()
  }
})

function openDialog() {
  open.value = true
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable
}

useEventListener(window, 'keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
  if (isEditableTarget(event.target)) return

  event.preventDefault()
  openDialog()
})

async function selectResult(item: GlobalSearchItem) {
  try {
    if (item.type === 'bill') {
      await router.push({
        path: '/bills/list',
        query: {
          globalBillNo: item.bill_no,
        },
      })
    }
    else {
      await router.push({
        path: item.target_path,
        query: {
          globalWaybillNo: item.waybill_no,
        },
      })
    }

    open.value = false
  }
  catch (error: any) {
    toast.error('打开搜索结果失败', { description: error.message || '请稍后重试' })
  }
}
</script>

<template>
  <div class="flex items-center">
    <UiButton
      variant="outline"
      class="hidden md:flex h-9 w-[220px] items-center justify-between text-muted-foreground"
      @click="openDialog"
    >
      <span class="flex items-center gap-2 truncate">
        <Search class="size-4 shrink-0" />
        <span class="truncate">搜索提单/运单</span>
      </span>
      <span class="text-xs text-muted-foreground/80">{{ shortcutLabel }}</span>
    </UiButton>

    <UiButton
      variant="outline"
      size="icon"
      class="md:hidden"
      @click="openDialog"
    >
      <Search class="size-4" />
      <span class="sr-only">搜索提单和运单</span>
    </UiButton>
  </div>

  <CommandDialog
    v-model:open="open"
    title="全局搜索"
    description="搜索提单、运单、订单号和车船号"
    content-class="!w-[min(96vw,800px)] !max-w-[min(96vw,800px)]"
  >
    <CommandInput
      v-model="keyword"
      placeholder="输入订单号、提单号、运单号或车船号..."
    />

    <CommandList :class="dialogBodyHeightClass">
      <div
        v-if="!keyword.trim()"
        class="flex h-full items-center justify-center px-6"
      >
        <div class="mx-auto flex max-w-xl flex-col items-center text-center">
          <div class="mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Search class="size-5" />
          </div>
          <div class="text-base font-medium text-foreground">
            搜索提单和运单
          </div>
          <div class="mt-2 text-sm leading-6 text-muted-foreground">
            输入订单号、提单号、运单号或车船号即可开始搜索。
            <br class="hidden sm:block">
            系统会先优先展示提单结果，查不到提单时再继续展示运单结果。
          </div>
        </div>
      </div>

      <div
        v-else-if="loading"
        class="flex h-full items-center justify-center gap-2 px-4 text-sm text-muted-foreground"
      >
        <LoaderCircle class="size-4 animate-spin" />
        <span>正在搜索，请稍候...</span>
      </div>

      <div
        v-else-if="hasSearched && items.length === 0"
        class="flex h-full items-center px-4 text-sm text-muted-foreground"
      >
        未找到匹配的提单或运单。
      </div>

      <div
        v-else-if="items.length > 0"
        class="flex h-full flex-col"
      >
        <div class="min-h-0 flex-1 overflow-auto px-2 pb-2">
          <div class="overflow-hidden rounded-md border">
            <template v-if="resultType === 'bill'">
              <div :class="['grid items-center gap-3 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground', billGridClass]">
                <div>类型</div>
                <div>提单号</div>
                <div>订单号</div>
                <div>规格</div>
                <div>开单名称</div>
                <div class="text-right">单重</div>
                <div class="text-right">总重</div>
                <div>创建时间</div>
              </div>
              <div ref="resultsScrollRef" class="max-h-[248px] overflow-y-auto" @scroll="handleResultsScroll">
                <button
                  v-for="item in billItems"
                  :key="`${item.type}-${item.id}`"
                  type="button"
                  :class="['grid w-full items-center gap-3 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent hover:text-accent-foreground', billGridClass]"
                  @click="selectResult(item)"
                >
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <ReceiptText class="size-4 shrink-0 text-primary" />
                    <span>提单</span>
                  </div>
                <div class="break-all font-medium whitespace-normal">{{ item.bill_no }}</div>
                <div class="break-all whitespace-normal">{{ item.order_no }}</div>
                <div class="whitespace-normal break-words text-muted-foreground">{{ formatBillSpec(item) }}</div>
                <div class="whitespace-normal break-words">{{ item.billing_name || '未填写' }}</div>
                <div class="text-right">{{ formatNumber(item.weight) || '-' }}</div>
                <div class="text-right">{{ formatNumber(item.total_weight) || '-' }}</div>
                <div class="whitespace-normal break-words text-muted-foreground">{{ formatDate(item.create_date) || '-' }}</div>
              </button>
                <div v-if="loadingMore" class="flex items-center justify-center gap-2 border-t px-3 py-3 text-xs text-muted-foreground">
                  <LoaderCircle class="size-4 animate-spin" />
                  <span>正在加载更多...</span>
                </div>
                <div
                  v-else-if="!hasMore && items.length > pageSize"
                  class="border-t px-3 py-3 text-center text-xs text-muted-foreground"
                >
                  没有更多结果了
                </div>
              </div>
            </template>

            <template v-else>
              <div :class="['grid items-center gap-3 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground', invoiceGridClass]">
                <div>类型</div>
                <div>运单号</div>
                <div>车船号</div>
                <div>开单名称</div>
                <div class="text-right">发运块数</div>
                <div class="text-right">发运总量</div>
                <div>发货时间</div>
                <div>起始→目的地</div>
              </div>
              <div ref="resultsScrollRef" class="max-h-[248px] overflow-y-auto" @scroll="handleResultsScroll">
                <button
                  v-for="item in invoiceItems"
                  :key="`${item.type}-${item.id}`"
                  type="button"
                  :class="['grid w-full items-center gap-3 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent hover:text-accent-foreground', invoiceGridClass]"
                  @click="selectResult(item)"
                >
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <FileText class="size-4 shrink-0 text-primary" />
                    <span>{{ item.transport_type }}</span>
                  </div>
                  <div class="whitespace-normal break-words font-medium">{{ item.waybill_no }}</div>
                  <div class="whitespace-normal break-words">{{ item.vehicle_vessel_name || '未填写' }}</div>
                  <div class="whitespace-normal break-words">{{ item.ship_name || '未填写' }}</div>
                  <div class="text-right">{{ formatNumber(item.total_number, 0) || '0' }}</div>
                  <div class="text-right">{{ formatNumber(item.total_weight) || '-' }}</div>
                  <div class="whitespace-normal break-words text-muted-foreground">{{ formatDate(item.ship_date) || '-' }}</div>
                  <div class="whitespace-normal break-words text-muted-foreground">{{ item.ship_from || '-' }} → {{ item.ship_to || '-' }}</div>
                </button>
                <div v-if="loadingMore" class="flex items-center justify-center gap-2 border-t px-3 py-3 text-xs text-muted-foreground">
                  <LoaderCircle class="size-4 animate-spin" />
                  <span>正在加载更多...</span>
                </div>
                <div
                  v-else-if="!hasMore && items.length > pageSize"
                  class="border-t px-3 py-3 text-center text-xs text-muted-foreground"
                >
                  没有更多结果了
                </div>
              </div>
            </template>
          </div>
        </div>
        <div
          v-if="resultType === 'invoice'"
          class="border-t px-4 py-2 text-xs text-muted-foreground"
        >
          本次未找到匹配提单，已自动展示运单结果。
        </div>
        <div
          v-else-if="resultType === 'bill'"
          class="border-t px-4 py-2 text-xs text-muted-foreground"
        >
          当前已优先展示提单结果。
        </div>
      </div>

      <div
        v-else
        class="flex h-full items-center px-4 text-sm text-muted-foreground"
      >
        未找到匹配的提单或运单。
      </div>

      <div
        v-if="!keyword.trim()"
        class="border-t px-4 py-2 text-xs text-muted-foreground"
      >
        <div class="flex items-center gap-2">
          <PackageSearch class="size-3.5" />
          <span>支持模糊搜索订单号、提单号、运单号和车船号</span>
        </div>
      </div>
    </CommandList>
  </CommandDialog>
</template>
