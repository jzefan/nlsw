<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Stamp, CheckCircle2, AlertTriangle, Clock, RotateCcw, ArrowRight, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/stores/auth'
import {
  getSealRequests,
  getSealItems,
  checkoutSealRequest,
  returnSealRequest,
  SEAL_TYPE_MAP,
  type SealRequest,
  type SealItem,
  type SealType
} from '@/services/api/seal.api'

const authStore = useAuthStore()

const currentTab = ref<'approved' | 'checked_out' | 'overdue'>('approved')
const loading = ref(false)
const list = ref<SealRequest[]>([])

// 发章弹窗状态
const checkoutDialogOpen = ref(false)
const checkoutItem = ref<SealRequest | null>(null)
const availableItems = ref<SealItem[]>([])
const selectedItemIds = ref<string[]>([])
const loadingItems = ref(false)
const submittingCheckout = ref(false)

// 收章归还弹窗状态
const returnDialogOpen = ref(false)
const returningItem = ref<SealRequest | null>(null)
const returnNote = ref('')
const submittingReturn = ref(false)

async function loadList() {
  loading.value = true
  try {
    const res = await getSealRequests({
      view: 'custody',
      status: currentTab.value
    })
    if (res.ok && res.data) {
      list.value = res.data
    }
  } catch (err: any) {
    toast.error('加载工作台待办失败')
  } finally {
    loading.value = false
  }
}

// 打开“发章”弹窗
async function openCheckoutDialog(row: SealRequest) {
  checkoutItem.value = row
  selectedItemIds.value = []
  checkoutDialogOpen.value = true
  loadingItems.value = true

  try {
    const res = await getSealItems({ status: 'active' })
    if (res.ok && res.data) {
      // 过滤出该单据所需类别的、且未在借的实体章
      availableItems.value = res.data.filter(i => row.sealTypes.includes(i.sealType))

      // 默认智能预选每种类别的第 1 枚空闲章
      const autoSelected: string[] = []
      for (const st of row.sealTypes) {
        const candidate = availableItems.value.find(i => i.sealType === st && !i.physicalOut)
        if (candidate) {
          autoSelected.push(candidate._id)
        }
      }
      selectedItemIds.value = autoSelected
    }
  } catch (err: any) {
    toast.error('加载可用实体章失败')
  } finally {
    loadingItems.value = false
  }
}

// 检查每个所需类别是否都选中了 1 枚
const checkoutReady = computed(() => {
  if (!checkoutItem.value) return false
  const selectedItems = availableItems.value.filter(i => selectedItemIds.value.includes(i._id))
  for (const st of checkoutItem.value.sealTypes) {
    const hasOne = selectedItems.some(i => i.sealType === st && !i.physicalOut)
    if (!hasOne) return false
  }
  return true
})

async function submitCheckout() {
  if (!checkoutItem.value || !checkoutReady.value) return
  submittingCheckout.value = true
  try {
    const res = await checkoutSealRequest(checkoutItem.value._id, {
      sealItemIds: selectedItemIds.value
    })
    if (res.ok) {
      toast.success('发章出库成功，状态已转为使用中')
      checkoutDialogOpen.value = false
      loadList()
    } else {
      toast.error(res.error || '发章失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '发章异常')
  } finally {
    submittingCheckout.value = false
  }
}

// 打开“确认收章”弹窗
function openReturnDialog(row: SealRequest) {
  returningItem.value = row
  returnNote.value = ''
  returnDialogOpen.value = true
}

async function submitReturn() {
  if (!returningItem.value) return
  submittingReturn.value = true
  try {
    const res = await returnSealRequest(returningItem.value._id, {
      note: returnNote.value.trim()
    })
    if (res.ok) {
      toast.success('收章销账成功，已向借用人发送通知')
      returnDialogOpen.value = false
      loadList()
    } else {
      toast.error(res.error || '收章失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '收章异常')
  } finally {
    submittingReturn.value = false
  }
}

function formatDateTime(val: string | undefined | null) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getOverdueHours(expectedStr: string) {
  const diff = Date.now() - new Date(expectedStr).getTime()
  const hours = Math.round(diff / 3600000)
  return hours > 0 ? `${hours}小时` : '刚刚'
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 头部说明与 Tab 切换 -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
      <div class="flex items-center gap-1.5 p-1 bg-muted/60 rounded-md">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
          :class="currentTab === 'approved' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="currentTab = 'approved'; loadList()"
        >
          <Clock class="h-3.5 w-3.5 text-blue-500" />
          <span>待发章</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
          :class="currentTab === 'checked_out' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="currentTab = 'checked_out'; loadList()"
        >
          <Stamp class="h-3.5 w-3.5 text-emerald-500" />
          <span>在借使用中</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
          :class="currentTab === 'overdue' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="currentTab = 'overdue'; loadList()"
        >
          <AlertTriangle class="h-3.5 w-3.5 text-destructive" />
          <span>已逾期待催还</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-8 gap-1 text-xs" @click="loadList">
          <RotateCcw class="h-3.5 w-3.5" /> 刷新
        </Button>
      </div>
    </div>

    <!-- 列表数据 -->
    <div class="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/50 text-xs">
            <TableHead class="w-24">单号</TableHead>
            <TableHead class="w-32">借用人 / 部门</TableHead>
            <TableHead class="w-40">申请类别 / 分配章</TableHead>
            <TableHead class="min-w-44">用章文件</TableHead>
            <TableHead class="w-44">预约时段 / 预计归还</TableHead>
            <TableHead class="w-24 text-center">状态</TableHead>
            <TableHead class="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                正在加载数据...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="list.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                当前暂无此状态待办事项
              </TableCell>
            </TableRow>
          </template>

          <template v-for="row in list" v-else :key="row._id">
            <TableRow class="text-xs transition-colors hover:bg-muted/40">
              <!-- 单号 -->
              <TableCell class="font-mono font-medium text-foreground">
                No.{{ row.serialNo }}
              </TableCell>

              <!-- 借用人 -->
              <TableCell>
                <div class="font-medium text-foreground">{{ row.applicant?.name }}</div>
                <div class="text-[11px] text-muted-foreground">{{ row.useDepartment || row.applicant?.department }}</div>
              </TableCell>

              <!-- 印章类别 / 实体章 -->
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <!-- 若已分配实体章，直接展示章编号 -->
                  <template v-if="row.sealItems && row.sealItems.length > 0">
                    <Badge
                      v-for="si in row.sealItems"
                      :key="si.sealItemId"
                      variant="default"
                      class="text-[10px] font-mono px-1.5 py-0"
                    >
                      {{ si.code }}
                    </Badge>
                  </template>
                  <!-- 待发章时展示申请类别 -->
                  <template v-else>
                    <Badge
                      v-for="st in row.sealTypes"
                      :key="st"
                      variant="outline"
                      class="text-[10px] px-1 py-0"
                    >
                      {{ SEAL_TYPE_MAP[st] }}
                    </Badge>
                  </template>
                </div>
              </TableCell>

              <!-- 文件名称与份数 -->
              <TableCell>
                <div class="font-medium line-clamp-1 text-foreground" :title="row.documentName">
                  {{ row.documentName }}
                </div>
                <div class="text-[11px] text-muted-foreground">
                  份数：{{ row.copies }}份 | 事由：{{ row.reason }}
                </div>
              </TableCell>

              <!-- 时间段 -->
              <TableCell class="text-[11px] text-muted-foreground">
                <div>借出：{{ formatDateTime(row.checkedOutAt || row.useAt) }}</div>
                <div :class="row.status === 'overdue' ? 'text-destructive font-medium' : ''">
                  预计归还：{{ formatDateTime(row.expectedReturnAt) }}
                </div>
              </TableCell>

              <!-- 状态 -->
              <TableCell class="text-center">
                <Badge
                  v-if="row.status === 'approved'"
                  variant="outline"
                  class="text-[10px] text-blue-600 border-blue-500/30 bg-blue-500/5 font-normal"
                >
                  待发章
                </Badge>
                <Badge
                  v-else-if="row.status === 'checked_out'"
                  variant="default"
                  class="text-[10px] font-normal"
                >
                  在借中
                </Badge>
                <Badge
                  v-else-if="row.status === 'overdue'"
                  variant="destructive"
                  class="text-[10px] font-normal"
                >
                  逾期 {{ getOverdueHours(row.expectedReturnAt) }}
                </Badge>
              </TableCell>

              <!-- 操作按钮 -->
              <TableCell class="text-right">
                <!-- 待发章视图：一键发章 -->
                <Button
                  v-if="row.status === 'approved'"
                  size="sm"
                  class="h-7 px-2.5 text-xs gap-1"
                  @click="openCheckoutDialog(row)"
                >
                  <Stamp class="h-3 w-3" />
                  <span>指定发章</span>
                </Button>

                <!-- 在借与逾期：确认收章 -->
                <Button
                  v-if="['checked_out', 'overdue'].includes(row.status)"
                  variant="outline"
                  size="sm"
                  class="h-7 px-2.5 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  @click="openReturnDialog(row)"
                >
                  <CheckCircle2 class="h-3 w-3" />
                  <span>确认收章</span>
                </Button>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 发章分配实体章弹窗 -->
    <Dialog v-model:open="checkoutDialogOpen">
      <DialogContent class="max-w-md p-5">
        <DialogHeader>
          <DialogTitle class="text-sm font-semibold">保管员指定发章</DialogTitle>
        </DialogHeader>

        <div class="space-y-3 py-2 text-xs">
          <div class="p-2.5 bg-muted/40 rounded border space-y-1">
            <div><span class="text-muted-foreground">申请单号：</span>No.{{ checkoutItem?.serialNo }}</div>
            <div><span class="text-muted-foreground">领用人：</span>{{ checkoutItem?.applicant?.name }} ({{ checkoutItem?.useDepartment }})</div>
            <div><span class="text-muted-foreground">用章文件：</span>{{ checkoutItem?.documentName }} ({{ checkoutItem?.copies }}份)</div>
          </div>

          <div class="space-y-2">
            <div class="font-medium text-foreground">请为该单据勾选指定分配的在库实体章：</div>

            <div v-if="loadingItems" class="py-4 text-center text-muted-foreground">
              <Loader2 class="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
              加载在用实体章...
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="st in checkoutItem?.sealTypes"
                :key="st"
                class="border rounded p-2.5 space-y-1.5 bg-background"
              >
                <div class="font-medium flex items-center justify-between text-xs">
                  <span>{{ SEAL_TYPE_MAP[st] }}</span>
                  <span class="text-[11px] text-muted-foreground">必须选 1 枚</span>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <div
                    v-for="item in availableItems.filter(i => i.sealType === st)"
                    :key="item._id"
                    class="flex items-center justify-between p-2 rounded border text-xs cursor-pointer transition-all"
                    :class="[
                      item.physicalOut
                        ? 'bg-muted/40 opacity-50 cursor-not-allowed border-dashed'
                        : selectedItemIds.includes(item._id)
                          ? 'border-primary bg-primary/[0.04]'
                          : 'hover:border-foreground/30'
                    ]"
                    @click="!item.physicalOut && (selectedItemIds = [
                      ...selectedItemIds.filter(id => !availableItems.some(x => x._id === id && x.sealType === st)),
                      item._id
                    ])"
                  >
                    <span class="font-mono font-medium">{{ item.code }}</span>
                    <span v-if="item.physicalOut" class="text-[10px] text-destructive">已在借</span>
                    <Badge v-else-if="selectedItemIds.includes(item._id)" class="text-[9px] h-3.5 px-1">已选</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" size="sm" @click="checkoutDialogOpen = false">取消</Button>
          <Button size="sm" :disabled="!checkoutReady || submittingCheckout" @click="submitCheckout">
            <Loader2 v-if="submittingCheckout" class="h-3.5 w-3.5 mr-1 animate-spin" />
            <span>确认借出发章</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 确认收章归还弹窗 -->
    <Dialog v-model:open="returnDialogOpen">
      <DialogContent class="max-w-md p-5">
        <DialogHeader>
          <DialogTitle class="text-sm font-semibold">确认收章入库销账</DialogTitle>
        </DialogHeader>

        <div class="space-y-3 py-2 text-xs">
          <div class="p-2.5 bg-muted/40 rounded border space-y-1">
            <div><span class="text-muted-foreground">单号：</span>No.{{ returningItem?.serialNo }}</div>
            <div><span class="text-muted-foreground">借用人：</span>{{ returningItem?.applicant?.name }}</div>
            <div><span class="text-muted-foreground">所借印章：</span>
              <span v-for="si in returningItem?.sealItems" :key="si.sealItemId" class="font-mono mr-2 font-medium">
                {{ si.code }}
              </span>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-muted-foreground">收章备注 / 情况说明（选填）</label>
            <Textarea
              v-model="returnNote"
              rows="3"
              placeholder="如：印章完好归还入库；若有异常或逾期原因可在此记录"
              class="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter class="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" size="sm" @click="returnDialogOpen = false">取消</Button>
          <Button size="sm" :disabled="submittingReturn" @click="submitReturn">
            <Loader2 v-if="submittingReturn" class="h-3.5 w-3.5 mr-1 animate-spin" />
            <span>确认收章入库</span>
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
