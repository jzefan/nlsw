<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DatePicker from './DatePicker.vue'

const props = withDefaults(defineProps<{
  modelValue?: string // YYYY-MM-DDTHH:mm, local wall clock time
  disabled?: boolean
  minuteStep?: number
  defaultHour?: string
  label?: string
  minValue?: string
  maxValue?: string
  disabledDate?: (date: Date) => boolean
  disabledHint?: string
  dateIndicator?: (date: Date) => string | undefined
}>(), { minuteStep: 1, label: '日期时间' })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'visible-year-change': [year: number]
}>()

const selectedDate = ref('')
const selectedHour = ref('')
const selectedMinute = ref('')
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const minutes = computed(() => Array.from({ length: 60 / props.minuteStep }, (_, index) => String(index * props.minuteStep).padStart(2, '0')))
const availableHours = computed(() => hours.filter((hour) => {
  if (!selectedDate.value) return true
  const value = `${selectedDate.value}T${hour}:00`
  return (!props.minValue || value >= props.minValue) && (!props.maxValue || value <= props.maxValue)
}))
const minDate = computed(() => props.minValue?.slice(0, 10))
const maxDate = computed(() => props.maxValue?.slice(0, 10))

watch(() => props.modelValue, value => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '')
  selectedDate.value = match?.[1] ?? ''
  selectedHour.value = match?.[2] ?? props.defaultHour ?? ''
  selectedMinute.value = match?.[3] ?? (props.defaultHour ? '00' : '')
}, { immediate: true })

watch(() => props.defaultHour, hour => {
  if (selectedDate.value) return
  selectedHour.value = hour && availableHours.value.includes(hour) ? hour : ''
  selectedMinute.value = selectedHour.value ? '00' : ''
})

function updateValue() {
  const value = selectedDate.value && selectedHour.value && selectedMinute.value
    ? `${selectedDate.value}T${selectedHour.value}:${selectedMinute.value}`
    : ''
  if (value !== (props.modelValue ?? '')) emit('update:modelValue', value)
}

function updateDate(value: string) {
  selectedDate.value = value
  if (selectedHour.value && !availableHours.value.includes(selectedHour.value)) {
    selectedHour.value = availableHours.value[0] ?? ''
    selectedMinute.value = selectedHour.value ? '00' : ''
  } else if (!selectedHour.value && props.defaultHour && availableHours.value.includes(props.defaultHour)) {
    selectedHour.value = props.defaultHour
    selectedMinute.value = '00'
  }
  updateValue()
}

function updateHour(value: unknown) {
  selectedHour.value = typeof value === 'string' ? value : ''
  if (props.minuteStep >= 60) selectedMinute.value = selectedHour.value ? '00' : ''
  updateValue()
}

function updateMinute(value: unknown) {
  selectedMinute.value = typeof value === 'string' ? value : ''
  updateValue()
}

watch(() => props.minuteStep, () => {
  if (!minutes.value.includes(selectedMinute.value)) {
    selectedMinute.value = '00'
    updateValue()
  }
})

watch(() => [props.minValue, props.maxValue, selectedDate.value] as const, () => {
  if (selectedHour.value && !availableHours.value.includes(selectedHour.value)) {
    selectedHour.value = availableHours.value[0] ?? ''
    selectedMinute.value = selectedHour.value ? '00' : ''
    updateValue()
  }
})
</script>

<template>
  <!-- 三段固定宽度并排：日期 11rem + 时 4.5rem + 分 4.5rem + 间隙。
       宽度约束放在外层容器，不去覆盖 DatePicker 内部的 w-full（那会与 tailwind-merge 打架）。 -->
  <div role="group" :aria-label="label" class="flex min-w-0 flex-wrap gap-2">
    <div class="w-[11rem] shrink-0">
      <DatePicker :model-value="selectedDate" :disabled="disabled" :min-date="minDate" :max-date="maxDate" :disabled-date="disabledDate" :disabled-hint="disabledHint" :date-indicator="dateIndicator" placeholder="选择日期" class="h-9" @update:model-value="updateDate" @visible-year-change="emit('visible-year-change', $event)" />
    </div>
    <div class="flex shrink-0 gap-2">
      <Select :model-value="selectedHour" :disabled="disabled" @update:model-value="updateHour">
        <SelectTrigger class="w-[4.5rem]" :aria-label="`${label}小时`"><SelectValue placeholder="时" /></SelectTrigger>
        <SelectContent><SelectItem v-for="hour in availableHours" :key="hour" :value="hour">{{ hour }} 时</SelectItem></SelectContent>
      </Select>
      <Select v-if="minuteStep < 60" :model-value="selectedMinute" :disabled="disabled" @update:model-value="updateMinute">
        <SelectTrigger class="w-[4.5rem]" :aria-label="`${label}分钟`"><SelectValue placeholder="分" /></SelectTrigger>
        <SelectContent><SelectItem v-for="minute in minutes" :key="minute" :value="minute">{{ minute }} 分</SelectItem></SelectContent>
      </Select>
    </div>
  </div>
</template>
