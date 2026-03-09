<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface TabOption {
  value: string
  label: string
}

export interface SettleModeOption {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  settleMode: string
  tabOptions: TabOption[]
  settleModeOptions: SettleModeOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:settleMode', value: string): void
}>()

function handleTabChange(value: string | number) {
  emit('update:modelValue', String(value))
}

function handleSettleModeChange(value: string) {
  emit('update:settleMode', value)
}
</script>

<template>
  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
    <!-- Row 1: 结算模式 + Tabs -->
    <div class="flex items-center justify-between md:justify-start gap-2">
      <!-- 结算模式切换 -->
      <div class="inline-flex shrink-0 rounded-md shadow-sm" role="group">
        <button
          v-for="(option, index) in settleModeOptions"
          :key="option.value"
          type="button"
          class="px-4 py-2 text-sm font-medium border" :class="[
            index === 0 ? 'rounded-l-lg' : '',
            index === settleModeOptions.length - 1 ? 'rounded-r-lg' : '',
            index > 0 ? 'border-l-0' : '',
            settleMode === option.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted border-input',
          ]"
          @click="handleSettleModeChange(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- Tabs（移动端放第1行右侧，桌面端放最右侧） -->
      <Tabs :model-value="modelValue" class="w-auto" @update:model-value="handleTabChange">
        <TabsList>
          <TabsTrigger
            v-for="option in tabOptions"
            :key="option.value"
            :value="option.value"
            class="md:w-[140px]"
          >
            {{ option.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Row 2: 操作按钮插槽（移动端第2行，桌面端和第1行同行） -->
    <div class="flex items-center gap-2 flex-wrap">
      <slot name="actions" />
    </div>
  </div>
</template>
