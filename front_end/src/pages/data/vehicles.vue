<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { watchDebounced } from '@vueuse/core'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { h, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { DataDictItem } from '@/services/api/data-dict.api'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useModal } from '@/composables/use-modal'
import { deleteVehicle, getVehicles } from '@/services/api/data-dict.api'

import DataDictPage from './components/DataDictPage.vue'
import VehicleDialog from './components/VehicleDialog.vue'

const data = ref<DataDictItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const searchTerm = ref('')

async function loadData() {
  loading.value = true
  try {
    const res = await getVehicles({ page: page.value, limit: limit.value, search: searchTerm.value })
    if (res.ok) {
      data.value = res.data
      total.value = res.total
    }
  }
  finally {
    loading.value = false
  }
}

watchDebounced(
  searchTerm,
  () => {
    page.value = 1
    loadData()
  },
  { debounce: 500, maxWait: 1000 },
)

onMounted(loadData)

const { Modal } = useModal()
const dialogOpen = ref(false)
const editingItem = ref(null)

function openAdd() {
  editingItem.value = null
  dialogOpen.value = true
}

function openEdit(item: any) {
  editingItem.value = item
  dialogOpen.value = true
}

async function handleDelete(item: any) {
  if (!confirm(`确定要删除 ${item.name} 吗？`))
    return
  try {
    await deleteVehicle(item.name)
    toast.success('删除成功')
    loadData()
  }
  catch (e: any) {
    toast.error(e.message)
  }
}

const columns: ColumnDef<any>[] = [
  { accessorKey: 'name', header: '车船号' },
  { accessorKey: 'veh_type', header: '类型' },
  { accessorKey: 'veh_category', header: '分类' },
  { accessorKey: 'contact_name', header: '联系人' },
  { accessorKey: 'phone', header: '电话' },
  {
    id: 'actions',
    size: 180,
    header: '操作',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h(Button, {
        variant: 'outline',
        size: 'sm',
        class: 'h-8 px-2',
        onClick: () => openEdit(row.original),
      }, () => [h(Pencil, { class: 'size-3.5 mr-1' }), '修改']),
      h(Button, {
        variant: 'destructive',
        size: 'sm',
        class: 'h-8 px-2',
        onClick: () => handleDelete(row.original),
      }, () => [h(Trash2, { class: 'size-3.5 mr-1' }), '删除']),
    ]),
  },
]
</script>

<template>
  <DataDictPage
    title="车船号"
    :data="data"
    :columns="columns"
    :loading="loading"
    :total="total"
    :page="page"
    :limit="limit"
    @update:page="(p) => { page = p; loadData() }"
    @refresh="loadData"
    @add="openAdd"
  >
    <template #filter>
      <div class="flex items-center gap-2 mr-2">
        <Input v-model="searchTerm" placeholder="搜索..." class="w-64" />
      </div>
    </template>

    <template #dialog>
      <component :is="Modal.Root" v-model:open="dialogOpen">
        <component :is="Modal.Content">
          <VehicleDialog
            v-if="dialogOpen"
            :item="editingItem"
            @close="dialogOpen = false"
            @refresh="loadData"
          />
        </component>
      </component>
    </template>
  </DataDictPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
