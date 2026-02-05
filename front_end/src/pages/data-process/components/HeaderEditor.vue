<script setup lang="ts">
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { ref } from 'vue'

import type { HeaderInfo } from '@/utils/excel-transform'

const props = defineProps<{
  modelValue: HeaderInfo
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: HeaderInfo): void
}>()

const isExpanded = ref(false)

function updateField(field: keyof HeaderInfo, value: string | number) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: String(value),
  })
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <UiCard>
    <UiCardHeader class="py-2 cursor-pointer hover:bg-muted/50 transition-colors" @click="toggleExpand">
      <div class="flex items-center justify-between">
        <UiCardTitle class="text-base">
          运单信息
        </UiCardTitle>
        <component :is="isExpanded ? ChevronUp : ChevronDown" class="w-5 h-5 text-muted-foreground" />
      </div>
    </UiCardHeader>
    <UiCardContent v-if="isExpanded">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <UiInput
          :model-value="modelValue.billingName"
          placeholder="开单名称"
          @update:model-value="updateField('billingName', $event)"
        />

        <UiInput
          :model-value="modelValue.vehicle"
          placeholder="车船号"
          @update:model-value="updateField('vehicle', $event)"
        />

        <UiInput
          :model-value="modelValue.shipper"
          placeholder="发货单位"
          @update:model-value="updateField('shipper', $event)"
        />

        <UiInput
          type="date"
          :model-value="modelValue.shipDate"
          placeholder="发货日期"
          @update:model-value="updateField('shipDate', $event)"
        />

        <UiInput
          :model-value="modelValue.destination"
          placeholder="目的地"
          @update:model-value="updateField('destination', $event)"
        />
      </div>
    </UiCardContent>
  </UiCard>
</template>
