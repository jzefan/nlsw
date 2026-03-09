<script setup lang="ts">
import { useInfiniteQuery } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import axios from 'axios'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-vue-next'
import { ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  apiEndpoint: string
  labelField?: string
  valueField?: string
  queryParams?: Record<string, any>
  shouldFilter?: boolean
  disabled?: boolean
}>()

const emits = defineEmits(['update:modelValue', 'select'])

const open = ref(false)
const searchQuery = ref('')
const inputValue = ref('')
const selectedLabel = ref('')

// Debounced search
const debouncedSearch = useDebounceFn((val: string) => {
  searchQuery.value = val
}, 300)

watch(inputValue, (newVal) => {
  debouncedSearch(newVal)
})

// Watch queryParams to refetch when they change
watch(
  () => props.queryParams,
  (val) => {
    console.log('AsyncCombobox: queryParams changed:', val)
  },
  { deep: true },
)

async function fetchItems({ pageParam = 1 }) {
  try {
    const res = await axios.get(props.apiEndpoint, {
      params: {
        page: pageParam,
        limit: 20,
        search: searchQuery.value,
        ...props.queryParams,
      },
    })
    return res.data
  } catch (error) {
    console.error('AsyncCombobox fetch error:', error)
    throw error
  }
}

const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } = useInfiniteQuery({
  queryKey: computed(() => ['async-combobox', props.apiEndpoint, searchQuery.value, props.queryParams]),
  queryFn: fetchItems,
  staleTime: 5 * 60 * 1000, // Cache data for 5 minutes
  getNextPageParam: (lastPage) => {
    if (lastPage.page < lastPage.totalPages) {
      return lastPage.page + 1
    }
    return undefined
  },
  initialPageParam: 1,
  retry: 1,
})

const items = computed(() => {
  return data.value?.pages.flatMap((page) => page.data) || []
})

// Scroll handler for pagination
function handleScroll(e: Event) {
  const target = e.target as HTMLElement
  if (
    target.scrollTop + target.clientHeight >= target.scrollHeight - 10 &&
    hasNextPage.value &&
    !isFetchingNextPage.value
  ) {
    fetchNextPage()
  }
}

function handleSelect(item: any) {
  const value = item[props.valueField || 'name']
  emits('update:modelValue', value)
  emits('select', item)
  open.value = false
}

// Initial label population if modelValue exists
watch(
  () => [props.modelValue, items.value],
  ([newVal, currentItems]) => {
    if (newVal) {
      // Try to find the item in current list to get label
      const found = (currentItems as any[]).find((i) => i[props.valueField || 'name'] === newVal)
      if (found) {
        selectedLabel.value = found[props.labelField || 'name']
      } else if (selectedLabel.value && !inputValue.value) {
        // If we already have a label and didn't just clear it, keep it.
        // This happens when selecting an item: handleSelect sets label, then modelValue update fires this watch.
      } else {
        // Fallback to value if no label found and we aren't in the middle of selecting
        // Or just clear it if it's a reset.
        if (!inputValue.value) selectedLabel.value = newVal as string
      }
    } else {
      selectedLabel.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :aria-expanded="open"
        :disabled="disabled"
        class="w-full justify-between font-normal"
      >
        <span :class="cn('truncate', !selectedLabel && 'text-muted-foreground')">
          {{ selectedLabel || placeholder || 'Select item...' }}
        </span>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[--radix-popover-trigger-width] p-0">
      <Command :should-filter="false">
        <!-- Disable client-side filtering since we do it server-side -->
        <CommandInput v-model="inputValue" :placeholder="placeholder || 'Search...'" />
        <CommandList class="max-h-[200px] overflow-y-auto" @scroll="handleScroll">
          <CommandEmpty v-if="!isLoading && !isError && items.length === 0"> No results found. </CommandEmpty>
          <div v-if="isLoading" class="p-4 flex justify-center">
            <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
          <div v-if="isError" class="p-4 text-center text-sm text-red-500">Error loading data.</div>

          <CommandGroup v-if="!isError">
            <CommandItem
              v-for="(item, index) in items"
              :key="item?._id || item?.name || index"
              :value="item ? item[labelField || 'name'] : ''"
              @select="() => handleSelect(item)"
            >
              <Check
                :class="
                  cn(
                    'mr-0 h-4 w-4',
                    modelValue === (item ? item[valueField || 'name'] : '') ? 'opacity-100' : 'opacity-0',
                  )
                "
              />
              <slot name="item" :item="item">
                {{ item ? item[labelField || 'name'] : '' }}
              </slot>
            </CommandItem>
          </CommandGroup>

          <div v-if="isFetchingNextPage" class="p-2 text-center text-xs text-muted-foreground">Loading more...</div>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
