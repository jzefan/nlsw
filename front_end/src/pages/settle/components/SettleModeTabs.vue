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
  <div class="flex items-center justify-between mb-4">
    <!-- 操作按钮组 -->
    <div class="flex items-center gap-2">
      <!-- 结算模式切换 -->
      <div class="inline-flex rounded-md shadow-sm" role="group">
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

      <!-- 操作按钮插槽 -->
      <slot name="actions" />
    </div>

    <!-- Tabs -->
    <Tabs :model-value="modelValue" class="w-auto" @update:model-value="handleTabChange">
      <TabsList>
        <TabsTrigger
          v-for="option in tabOptions"
          :key="option.value"
          :value="option.value"
          class="w-[140px]"
        >
          {{ option.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
</template>
