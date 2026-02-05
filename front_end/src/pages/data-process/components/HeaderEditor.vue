<script setup lang="ts">
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { ref } from 'vue'

import type { HeaderInfo } from '@/utils/excel-transform'

import SearchableCombobox from '@/components/searchable-combobox.vue'
import { getCompanies, getDestinations, getVehicles } from '@/services/api/data-dict.api'

const props = defineProps<{
  modelValue: HeaderInfo
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: HeaderInfo): void
}>()

const isExpanded = ref(true)

function updateField(field: keyof HeaderInfo, value: string | number) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: String(value),
  })
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// Search functions for combobox
async function searchCompanies(search: string, limit: number, page: number) {
  return getCompanies({ search, limit, page })
}

async function searchVehicles(search: string, limit: number, page: number) {
  return getVehicles({ search, limit, page })
}

async function searchDestinations(search: string, limit: number, page: number) {
  return getDestinations({ search, limit, page })
}
</script>

<template>
  <UiCard>
    <UiCardHeader class="py-1 cursor-pointer hover:bg-muted/50 transition-colors" @click="toggleExpand">
      <div class="flex items-center justify-between">
        <UiCardTitle class="text-base">
          运单信息
        </UiCardTitle>
        <component :is="isExpanded ? ChevronUp : ChevronDown" class="w-5 h-5 text-muted-foreground" />
      </div>
    </UiCardHeader>
    <UiCardContent v-if="isExpanded">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <SearchableCombobox
          :model-value="modelValue.billingName"
          placeholder="开单名称"
          :search-fn="searchCompanies"
          @update:model-value="updateField('billingName', $event)"
        />

        <SearchableCombobox
          :model-value="modelValue.vehicle"
          placeholder="车船号"
          :search-fn="searchVehicles"
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

        <SearchableCombobox
          :model-value="modelValue.destination"
          placeholder="目的地"
          :search-fn="searchDestinations"
          @update:model-value="updateField('destination', $event)"
        />
      </div>
    </UiCardContent>
  </UiCard>
</template>
