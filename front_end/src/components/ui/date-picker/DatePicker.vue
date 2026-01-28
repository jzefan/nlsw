<script setup lang="ts">
import type { DateValue } from 'reka-ui'
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import { CalendarIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  class?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Min date: 2015-01-01
const minDate = new CalendarDate(2015, 1, 1)

// Convert string to DateValue
const dateValue = computed<DateValue | undefined>({
// ...
// ...
})

const displayValue = computed(() => {
  if (!props.modelValue) return ''
  return props.modelValue
})
</script>

<template>
  <UiPopover>
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
    <UiPopoverContent class="w-auto p-0">
      <UiCalendar
        v-model="dateValue"
        :min-value="minDate"
        :placeholder="today(getLocalTimeZone())"
        layout="month-and-year"
        locale="zh-CN"
      />
    </UiPopoverContent>
  </UiPopover>
</template>
