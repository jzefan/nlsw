<script setup lang="ts">
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import { Button as UiButton } from '@/components/ui/button'
import { Popover as UiPopover, PopoverContent as UiPopoverContent, PopoverTrigger as UiPopoverTrigger } from '@/components/ui/popover'

const props = defineProps<{
  modelValue?: string // YYYY-MM
  placeholder?: string
  class?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const popoverOpen = ref(false)

const currentYear = ref(
  props.modelValue ? parseInt(props.modelValue.split('-')[0]) : new Date().getFullYear(),
)

watch(() => props.modelValue, (val) => {
  if (val) {
    currentYear.value = parseInt(val.split('-')[0])
  }
})

const selectedMonth = computed(() => {
  if (!props.modelValue) return null
  const [y, m] = props.modelValue.split('-').map(Number)
  return { year: y, month: m }
})

const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const displayValue = computed(() => {
  if (!props.modelValue) return ''
  const [y, m] = props.modelValue.split('-')
  return `${y}年${parseInt(m)}月`
})

function selectMonth(month: number) {
  const val = `${currentYear.value}-${String(month).padStart(2, '0')}`
  emit('update:modelValue', val)
  popoverOpen.value = false
}

function isSelected(month: number) {
  return selectedMonth.value?.year === currentYear.value && selectedMonth.value?.month === month
}
</script>

<template>
  <UiPopover v-model:open="popoverOpen">
    <UiPopoverTrigger as-child>
      <UiButton
        variant="outline"
        :disabled="props.disabled"
        :class="cn(
          'justify-start text-left font-normal w-full',
          !modelValue && 'text-muted-foreground',
          props.class,
        )"
      >
        <CalendarIcon class="mr-2 h-4 w-4" />
        {{ displayValue || placeholder || '选择月份' }}
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent class="w-[220px] p-3" align="start">
      <div class="flex items-center justify-between mb-2">
        <UiButton variant="ghost" size="icon" class="h-7 w-7" @click="currentYear--">
          <ChevronLeft class="h-4 w-4" />
        </UiButton>
        <span class="text-sm font-medium">{{ currentYear }}年</span>
        <UiButton variant="ghost" size="icon" class="h-7 w-7" @click="currentYear++">
          <ChevronRight class="h-4 w-4" />
        </UiButton>
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        <UiButton
          v-for="(label, index) in months"
          :key="index"
          :variant="isSelected(index + 1) ? 'default' : 'ghost'"
          size="sm"
          class="h-8 text-xs"
          @click="selectMonth(index + 1)"
        >
          {{ label }}
        </UiButton>
      </div>
    </UiPopoverContent>
  </UiPopover>
</template>
