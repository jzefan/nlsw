<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { watchDebounced } from '@vueuse/core'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { h, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useModal } from '@/composables/use-modal'
import { addDestination, deleteDestination, getDestinations, updateDestination, type DataDictItem } from '@/services/api/data-dict.api'

import BaseContactDialog from './components/BaseContactDialog.vue'
import DataDictPage from './components/DataDictPage.vue'

const data = ref<DataDictItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const searchTerm = ref('')

async function loadData() {
  loading.value = true
  try {
    const res = await getDestinations({ page: page.value, limit: limit.value, search: searchTerm.value })
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
    const result = await deleteDestination(item.name)
    if (result.ok) {
      toast.success('删除成功')
      loadData()
    }
    else {
      toast.error(result.response || '删除失败')
    }
  }
  catch (e: any) {
    toast.error(e.message)
  }
}

const columns: ColumnDef<any>[] = [
  { accessorKey: 'name', header: '目的地' },
  {
    id: 'contact',
    header: '联系信息',
    cell: ({ row }) => h('div', [
      h('div', [
        row.original.contact_name || '',
        row.original.phone ? h('span', { class: 'text-xs text-muted-foreground ml-2' }, row.original.phone) : null,
      ]),
      row.original.address ? h('div', { class: 'text-xs text-muted-foreground' }, row.original.address) : null,
    ]),
  },
  {
    id: 'actions',
    meta: { fixedWidth: '120px' },
    header: () => h('div', { class: 'text-center' }, '操作'),
    cell: ({ row }) => h('div', { class: 'flex items-center justify-end gap-2' }, [
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
    title="目的地"
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
          <BaseContactDialog
            v-if="dialogOpen"
            :item="editingItem"
            title="Destination"
            :api-add="addDestination"
            :api-update="updateDestination"
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
