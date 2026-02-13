<script setup lang="ts">
// @ts-nocheck
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import { CalendarIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  class?: string
  disabled?: boolean
  disabledDate?: (date: Date) => boolean
  disabledHint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Min date: 2015-01-01
const minDate = new CalendarDate(2015, 1, 1)

// Import missing types
import type { DateValue } from '@internationalized/date'
import { Button as UiButton } from '@/components/ui/button'
import { Calendar as UiCalendar } from '@/components/ui/calendar'
import { Popover as UiPopover, PopoverContent as UiPopoverContent, PopoverTrigger as UiPopoverTrigger } from '@/components/ui/popover'

// Popover open state
const popoverOpen = ref(false)

// Calendar placeholder (used for navigation)
const calendarPlaceholder = ref<DateValue>(today(getLocalTimeZone()))

// Internal date value
const dateValue = computed<DateValue | undefined>({
  get: () => {
    if (!props.modelValue) return undefined
    const [year, month, day] = props.modelValue.split('-').map(Number)
    return new CalendarDate(year, month, day)
  },
  set: (value) => {
    if (!value) {
      emit('update:modelValue', '')
      return
    }
    const date = value.toDate(getLocalTimeZone())
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    emit('update:modelValue', formatted)
    popoverOpen.value = false
  },
})

// Display value
const displayValue = computed(() => {
  if (!props.modelValue) return ''
  return props.modelValue
})

// Watch for modelValue changes to update calendar placeholder
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    const [year, month, day] = newValue.split('-').map(Number)
    calendarPlaceholder.value = new CalendarDate(year, month, day)
  }
}, { immediate: true })

function isDateUnavailable(date: DateValue) {
  if (props.disabledDate) {
    return props.disabledDate(date.toDate(getLocalTimeZone()))
  }
  return false
}

function handleCalendarClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const button = target.closest('button')
  if (button && (button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-disabled'))) {
    toast.warning(props.disabledHint || '该日期不可选择')
  }
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
          props.class
        )"
      >
        <CalendarIcon class="mr-2 h-4 w-4" />
        {{ displayValue || placeholder || '选择日期' }}
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent class="w-auto p-0" @click="handleCalendarClick">
      <UiCalendar
        v-model="dateValue"
        v-model:placeholder="calendarPlaceholder"
        :min-value="minDate"
        :is-date-unavailable="isDateUnavailable"
        layout="month-and-year"
        locale="zh-CN"
      />
    </UiPopoverContent>
  </UiPopover>
</template>