<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Plus, Database, RotateCcw, Pencil, Ban, Trash2, CheckCircle, Loader2, Stamp } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDevice } from '@/composables/use-device'
import {
  getSealItems,
  createSealItem,
  updateSealItem,
  SEAL_TYPE_MAP,
  type SealItem,
  type SealType,
  type SealItemStatus
} from '@/services/api/seal.api'

const { isMobile } = useDevice()

const loading = ref(false)
const items = ref<SealItem[]>([])
const statusFilter = ref<string>('active')
const sealTypeFilter = ref<string>('all')

// 新增/编辑弹窗
const dialogOpen = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const form = ref({
  sealType: 'official' as SealType,
  code: '',
  note: ''
})
const submitting = ref(false)

async function loadData() {
  loading.value = true
  try {
    const res = await getSealItems({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      sealType: sealTypeFilter.value === 'all' ? undefined : sealTypeFilter.value
    })
    if (res.ok && res.data) {
      items.value = res.data
    }
  } catch (err: any) {
    toast.error('加载印章台账失败')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  isEditing.value = false
  editingId.value = ''
  form.value = {
    sealType: 'official',
    code: '',
    note: ''
  }
  dialogOpen.value = true
}

function openEditDialog(item: SealItem) {
  isEditing.value = true
  editingId.value = item._id
  form.value = {
    sealType: item.sealType,
    code: item.code,
    note: item.note || ''
  }
  dialogOpen.value = true
}

async function handleSave() {
  if (!form.value.sealType) {
    toast.error('请选择印章类别')
    return
  }

  submitting.value = true
  try {
    if (isEditing.value) {
      const res = await updateSealItem(editingId.value, {
        code: form.value.code,
        note: form.value.note
      })
      if (res.ok) {
        toast.success('印章信息已更新')
        dialogOpen.value = false
        loadData()
      } else {
        toast.error(res.error || '更新失败')
      }
    } else {
      const res = await createSealItem({
        sealType: form.value.sealType,
        code: form.value.code,
        note: form.value.note
      })
      if (res.ok) {
        toast.success('实体章已登记入库')
        dialogOpen.value = false
        loadData()
      } else {
        toast.error(res.error || '新增失败')
      }
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '操作异常')
  } finally {
    submitting.value = false
  }
}

async function handleStatusChange(item: SealItem, newStatus: SealItemStatus) {
  if (item.physicalOut && ['disabled', 'scrapped'].includes(newStatus)) {
    toast.error(`实体章【${item.code}】当前正处于在借状态，归还前严禁停用或报废`)
    return
  }

  const actionName = newStatus === 'active' ? '启用' : newStatus === 'disabled' ? '停用' : '报废'
  if (!confirm(`确定要将实体章【${item.code}】设为【${actionName}】状态吗？`)) return

  try {
    const res = await updateSealItem(item._id, { status: newStatus })
    if (res.ok) {
      toast.success(`实体章已${actionName}`)
      loadData()
    } else {
      toast.error(res.error || '更新状态失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '更新状态异常')
  }
}

watch([statusFilter, sealTypeFilter], () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-4 p-4 md:p-0">
    <!-- 顶部筛选与操作 -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
      <div class="flex w-full flex-nowrap items-center gap-2 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
        <!-- 类别筛选 -->
        <Select v-model="sealTypeFilter">
          <SelectTrigger class="h-8 w-32 shrink-0 text-xs">
            <SelectValue placeholder="印章类别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类别</SelectItem>
            <SelectItem v-for="(name, key) in SEAL_TYPE_MAP" :key="key" :value="key">
              {{ name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- 状态筛选 -->
        <Select v-model="statusFilter">
          <SelectTrigger class="h-8 w-28 shrink-0 text-xs">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">在用</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
            <SelectItem value="scrapped">已报废</SelectItem>
            <SelectItem value="all">全部有效</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" class="h-8 shrink-0 px-2 text-xs" @click="loadData">
          <RotateCcw class="h-3.5 w-3.5 mr-1" /> 刷新
        </Button>
      </div>

      <div class="flex w-full items-center gap-2 sm:w-auto">
        <Button size="sm" class="h-9 w-full gap-1 text-xs sm:h-8 sm:w-auto" @click="openCreateDialog">
          <Plus class="h-3.5 w-3.5" />
          <span>登记新印章</span>
        </Button>
      </div>
    </div>

    <!-- 实体章列表（移动端：卡片流） -->
    <div v-if="isMobile" class="space-y-2">
      <p v-if="loading && items.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">正在加载数据...</p>
      <p v-else-if="items.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">暂无实体章记录</p>
      <template v-else>
        <div v-for="item in items" :key="item._id" class="overflow-hidden rounded-xl border bg-card">
          <div class="space-y-1.5 px-3 py-2.5">
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{{ SEAL_TYPE_MAP[item.sealType] }}</span>
              <Badge
                v-if="item.status === 'active'"
                variant="outline"
                class="shrink-0 text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/5 font-normal"
              >
                在用
              </Badge>
              <Badge v-else-if="item.status === 'disabled'" variant="secondary" class="shrink-0 text-[10px] font-normal">
                已停用
              </Badge>
              <Badge v-else-if="item.status === 'scrapped'" variant="destructive" class="shrink-0 text-[10px] font-normal">
                已报废
              </Badge>
            </div>

            <div class="flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">实体章编号</span>
              <span class="flex min-w-0 flex-1 items-center gap-1.5 font-mono font-medium text-foreground">
                <Stamp class="h-3.5 w-3.5 shrink-0 text-primary" />
                <span class="truncate">{{ item.code }}</span>
              </span>
            </div>

            <div class="flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">物理库存</span>
              <span class="min-w-0 flex-1">
                <Badge v-if="item.physicalOut" variant="destructive" class="text-[10px] font-normal">
                  在借中 ({{ item.currentBorrowerName || '占用' }})
                </Badge>
                <span v-else class="font-medium text-emerald-600">在库空闲</span>
              </span>
            </div>

            <div class="flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">借出次数</span>
              <span class="min-w-0 flex-1 font-mono text-foreground">{{ item.borrowCount || 0 }} 次</span>
            </div>

            <div class="flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">备注</span>
              <span class="min-w-0 flex-1 text-muted-foreground">{{ item.note || '—' }}</span>
            </div>
          </div>

          <div class="flex items-center justify-end gap-1 border-t px-3 py-2">
            <template v-if="item.status !== 'scrapped'">
              <Button variant="ghost" size="sm" class="text-xs" @click="openEditDialog(item)">编辑</Button>
              <Button
                v-if="item.status === 'active'"
                variant="ghost"
                size="sm"
                class="text-xs text-amber-600 hover:text-amber-700"
                :disabled="item.physicalOut"
                @click="handleStatusChange(item, 'disabled')"
              >
                停用
              </Button>
              <Button
                v-if="item.status === 'disabled'"
                variant="ghost"
                size="sm"
                class="text-xs text-emerald-600 hover:text-emerald-700"
                @click="handleStatusChange(item, 'active')"
              >
                启用
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-xs text-destructive hover:bg-destructive/10"
                :disabled="item.physicalOut"
                @click="handleStatusChange(item, 'scrapped')"
              >
                报废
              </Button>
            </template>
            <span v-else class="text-[11px] text-muted-foreground">已归档</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 实体章表格 -->
    <div v-else class="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/50 text-xs">
            <TableHead class="w-28">印章类别</TableHead>
            <TableHead class="w-36">实体章编号</TableHead>
            <TableHead class="w-24 text-center">状态</TableHead>
            <TableHead class="w-28 text-center">物理库存</TableHead>
            <TableHead class="w-28 text-center">借出次数</TableHead>
            <TableHead class="min-w-44">备注 / 存放位置</TableHead>
            <TableHead class="w-36 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading && items.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                正在加载数据...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="items.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                暂无实体章记录
              </TableCell>
            </TableRow>
          </template>

          <template v-for="item in items" v-else :key="item._id">
            <TableRow class="text-xs transition-colors hover:bg-muted/40">
              <!-- 类别 -->
              <TableCell class="font-medium text-foreground">
                {{ SEAL_TYPE_MAP[item.sealType] }}
              </TableCell>

              <!-- 编号 -->
              <TableCell>
                <div class="flex items-center gap-1.5 font-mono font-medium text-foreground">
                  <Stamp class="h-3.5 w-3.5 text-primary" />
                  <span>{{ item.code }}</span>
                </div>
              </TableCell>

              <!-- 状态 -->
              <TableCell class="text-center">
                <Badge
                  v-if="item.status === 'active'"
                  variant="outline"
                  class="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/5 font-normal"
                >
                  在用
                </Badge>
                <Badge
                  v-else-if="item.status === 'disabled'"
                  variant="secondary"
                  class="text-[10px] font-normal"
                >
                  已停用
                </Badge>
                <Badge
                  v-else-if="item.status === 'scrapped'"
                  variant="destructive"
                  class="text-[10px] font-normal"
                >
                  已报废
                </Badge>
              </TableCell>

              <!-- 物理库存 / 当前在借 -->
              <TableCell class="text-center">
                <Badge
                  v-if="item.physicalOut"
                  variant="destructive"
                  class="text-[10px] font-normal"
                  :title="`在借人: ${item.currentBorrowerName || '未知'}`"
                >
                  在借中 ({{ item.currentBorrowerName || '占用' }})
                </Badge>
                <span v-else class="text-emerald-600 font-medium text-[11px]">
                  在库空闲
                </span>
              </TableCell>

              <!-- 累计借出 -->
              <TableCell class="text-center font-mono">
                {{ item.borrowCount || 0 }} 次
              </TableCell>

              <!-- 备注 -->
              <TableCell class="text-muted-foreground">
                {{ item.note || '—' }}
              </TableCell>

              <!-- 操作 -->
              <TableCell class="text-right space-x-1">
                <!-- 报废章只读保留 -->
                <template v-if="item.status !== 'scrapped'">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs"
                    @click="openEditDialog(item)"
                  >
                    编辑
                  </Button>

                  <Button
                    v-if="item.status === 'active'"
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                    :disabled="item.physicalOut"
                    @click="handleStatusChange(item, 'disabled')"
                  >
                    停用
                  </Button>

                  <Button
                    v-if="item.status === 'disabled'"
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                    @click="handleStatusChange(item, 'active')"
                  >
                    启用
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                    :disabled="item.physicalOut"
                    @click="handleStatusChange(item, 'scrapped')"
                  >
                    报废
                  </Button>
                </template>
                <span v-else class="text-muted-foreground text-[11px]">已归档</span>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-md p-5">
        <DialogHeader>
          <DialogTitle class="text-sm font-semibold">
            {{ isEditing ? '编辑实体印章' : '登记新实体印章' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-3 py-2 text-xs">
          <div class="space-y-1.5">
            <label class="font-medium text-muted-foreground">印章所属类别</label>
            <Select v-model="form.sealType" :disabled="isEditing">
              <SelectTrigger class="h-9 text-xs">
                <SelectValue placeholder="选择印章类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(name, key) in SEAL_TYPE_MAP" :key="key" :value="key">
                  {{ name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-muted-foreground">实体章编号</label>
            <Input
              v-model="form.code"
              placeholder="留空则按类别自动生成（如：公章-2）"
              class="h-9"
            />
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-muted-foreground">备注 / 存放位置</label>
            <Input
              v-model="form.note"
              placeholder="如：财务室1号保险箱、行政前台抽屉"
              class="h-9"
            />
          </div>
        </div>

        <DialogFooter class="flex-row justify-end gap-2 pt-2 sm:gap-0">
          <Button variant="outline" size="sm" class="h-9 sm:h-8" @click="dialogOpen = false">取消</Button>
          <Button size="sm" class="h-9 sm:h-8" :disabled="submitting" @click="handleSave">
            <Loader2 v-if="submitting" class="h-3.5 w-3.5 mr-1 animate-spin" />
            <span>保存</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
