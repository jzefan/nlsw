import { watchDebounced } from '@vueuse/core'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import { useModal } from '@/composables/use-modal'
import type { DataDictItem, PageResult } from '@/services/api/data-dict.api'

export interface DataDictApi {
  getList: (params: { page?: number, limit?: number, search?: string }) => Promise<PageResult<DataDictItem>>
  delete: (name: string) => Promise<{ ok: boolean, response?: string }>
}

export function useDataDict(api: DataDictApi) {
  const data = ref<DataDictItem[]>([])
  const loading = ref(false)
  const total = ref(0)
  const page = ref(1)
  const limit = ref(20)
  const searchTerm = ref('')

  async function loadData() {
    loading.value = true
    try {
      const res = await api.getList({ page: page.value, limit: limit.value, search: searchTerm.value })
      if (res.ok) {
        data.value = res.data
        total.value = res.total
      }
      else {
        toast.error('加载失败')
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

  // Dialog state
  const { Modal } = useModal()
  const dialogOpen = ref(false)
  const editingItem = ref<DataDictItem | null>(null)

  function openAdd() {
    editingItem.value = null
    dialogOpen.value = true
  }

  function openEdit(item: DataDictItem) {
    editingItem.value = item
    dialogOpen.value = true
  }

  async function handleDelete(item: DataDictItem) {
    if (!confirm(`确定要删除 ${item.name} 吗？`))
      return
    try {
      const result = await api.delete(item.name)
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

  function onPageChange(p: number) {
    page.value = p
    loadData()
  }

  return {
    // State
    data,
    loading,
    total,
    page,
    limit,
    searchTerm,
    // Dialog
    Modal,
    dialogOpen,
    editingItem,
    // Methods
    loadData,
    openAdd,
    openEdit,
    handleDelete,
    onPageChange,
  }
}
