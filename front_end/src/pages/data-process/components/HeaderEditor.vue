<script setup lang="ts">
import type { HeaderInfo } from '@/utils/excel-transform'

const props = defineProps<{
  modelValue: HeaderInfo
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: HeaderInfo): void
}>()

function updateField(field: keyof HeaderInfo, value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  })
}
</script>

<template>
  <UiCard>
    <UiCardHeader class="py-3">
      <UiCardTitle class="text-base">
        运单信息
      </UiCardTitle>
      <UiCardDescription>
        编辑发货运单头部信息
      </UiCardDescription>
    </UiCardHeader>
    <UiCardContent>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">开单名称</label>
          <UiInput
            :model-value="modelValue.billingName"
            placeholder="输入开单名称"
            @update:model-value="updateField('billingName', $event)"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">车船号</label>
          <UiInput
            :model-value="modelValue.vehicle"
            placeholder="输入车船号"
            @update:model-value="updateField('vehicle', $event)"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">发货单位</label>
          <UiInput
            :model-value="modelValue.shipper"
            placeholder="输入发货单位"
            @update:model-value="updateField('shipper', $event)"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">发货日期</label>
          <UiInput
            type="date"
            :model-value="modelValue.shipDate"
            @update:model-value="updateField('shipDate', $event)"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">目的地</label>
          <UiInput
            :model-value="modelValue.destination"
            placeholder="输入目的地"
            @update:model-value="updateField('destination', $event)"
          />
        </div>
      </div>
    </UiCardContent>
  </UiCard>
</template>
