<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, ChevronDown, ChevronUp, RotateCcw, Check, X, Loader2, Clock } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDevice } from '@/composables/use-device'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useApprovalStore } from '@/stores/approvals'
import { useAuthStore } from '@/stores/auth'
import {
  getSealRequests,
  getSealRequestDetail,
  withdrawSealRequest,
  reviewSealRequest,
  SEAL_TYPE_MAP,
  SEAL_STATUS_MAP,
  type SealRequest,
  type SealType
} from '@/services/api/seal.api'
import SealRequestDialog from './SealRequestDialog.vue'
import SealRequestDetailPanel from './SealRequestDetailPanel.vue'

const props = withDefaults(defineProps<{
  view?: 'mine' | 'inbox' | 'history' | 'all'
}>(), {
  view: 'mine'
})

const emit = defineEmits<{
  (e: 'meta', meta: { pendingCount?: number; hasGlobalApprovalView?: boolean }): void
}>()

const route = useRoute()
const authStore = useAuthStore()
const approvalStore = useApprovalStore()
const { isMobile } = useDevice()

const loading = ref(false)
const rows = ref<SealRequest[]>([])
const page = ref(1)
const limit = 20
const total = ref(0)

const statusFilter = ref<string>('all')
const sealTypeFilter = ref<string>('all')

const createDialogOpen = ref(false)
const expandedId = ref<string | null>(null)
const expandedDetail = ref<SealRequest | null>(null)
const loadingDetail = ref(false)

// 审批弹窗状态
const reviewDialogOpen = ref(false)
const reviewingItem = ref<SealRequest | null>(null)
const reviewDecision = ref<'approved' | 'rejected'>('approved')
const reviewComment = ref('')
const submittingReview = ref(false)

const isMine = computed(() => props.view === 'mine')
const isInbox = computed(() => props.view === 'inbox')
const isHistory = computed(() => props.view === 'history')

async function loadData() {
  loading.value = true
  try {
    const res = await getSealRequests({
      view: props.view,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      sealType: sealTypeFilter.value === 'all' ? undefined : sealTypeFilter.value,
      page: page.value,
      limit
    })
    if (res.ok && res.data) {
      rows.value = res.data
      total.value = res.pagination?.total || 0
      if (res.meta) {
        emit('meta', res.meta)
      }
      checkDeepLink()
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '加载用章申请列表失败')
  } finally {
    loading.value = false
  }
}

async function checkDeepLink() {
  const targetId = String(route.query.id || '')
  if (!targetId || expandedId.value === targetId) return

  const found = rows.value.find(r => r._id === targetId)
  if (found) {
    await toggleExpand(targetId)
  } else {
    try {
      const res = await getSealRequestDetail(targetId)
      if (res.ok && res.data) {
        rows.value = [res.data, ...rows.value]
        await toggleExpand(targetId)
      }
    } catch (e) {
      console.warn('Failed to load deep-linked request:', targetId)
    }
  }
}

async function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    expandedDetail.value = null
    return
  }

  expandedId.value = id
  loadingDetail.value = true
  try {
    const res = await getSealRequestDetail(id)
    if (res.ok && res.data) {
      expandedDetail.value = res.data
    }
  } catch (err: any) {
    toast.error('加载单据详情异常')
  } finally {
    loadingDetail.value = false
  }
}

async function handleWithdraw(row: SealRequest) {
  if (!confirm(`确定要撤回用章申请 No.${row.serialNo} 吗？`)) return
  try {
    const res = await withdrawSealRequest(row._id)
    if (res.ok) {
      toast.success('已成功撤回申请')
      loadData()
      if (expandedId.value === row._id) {
        toggleExpand(row._id)
      }
    } else {
      toast.error(res.error || '撤回失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '撤回异常')
  }
}

function openReviewDialog(row: SealRequest, decision: 'approved' | 'rejected') {
  reviewingItem.value = row
  reviewDecision.value = decision
  reviewComment.value = ''
  reviewDialogOpen.value = true
}

async function submitReview() {
  if (!reviewingItem.value) return
  submittingReview.value = true
  try {
    const res = await reviewSealRequest(reviewingItem.value._id, {
      decision: reviewDecision.value,
      comment: reviewComment.value
    })
    if (res.ok) {
      toast.success(reviewDecision.value === 'approved' ? '审批通过' : '已驳回申请')
      // 刚审完一条：侧栏角标与页面待办链接立刻跟着减
      void approvalStore.refresh()
      reviewDialogOpen.value = false
      loadData()
      if (expandedId.value === reviewingItem.value._id) {
        toggleExpand(reviewingItem.value._id)
      }
    } else {
      toast.error(res.error || '审批失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '审批异常')
  } finally {
    submittingReview.value = false
  }
}

function formatDateTime(val: string | undefined | null) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 移动端卡片与展开区的动作条件，与桌面端表格里的判断保持一致。 */
function canReviewRow(row: SealRequest) {
  return row.status === 'pending' && (isInbox.value || row.currentApproverId === authStore.user?.id || authStore.isOwner)
}
function canWithdrawRow(row: SealRequest) {
  return ['pending', 'approved'].includes(row.status) && (isMine.value || String(row.applicantId) === String(authStore.user?.id))
}

/** 详情面板要用的展示文本，桌面展开行与移动端卡片共用同一份。 */
function detailDisplay(detail: SealRequest) {
  return {
    reason: detail.reason,
    remark: detail.remark || '无',
    checkedOut: detail.checkedOutAt ? `${formatDateTime(detail.checkedOutAt)} (经办: ${detail.operatorName || '—'})` : '未发章',
    actualReturn: detail.actualReturnAt ? formatDateTime(detail.actualReturnAt) : '未归还'
  }
}
function detailSealItems(detail: SealRequest) {
  return (detail.sealItems || []).map(item => ({ id: item.sealItemId, code: item.code, typeName: SEAL_TYPE_MAP[item.sealType] }))
}
function detailLogs(detail: SealRequest) {
  return (detail.logs || []).map(log => ({ id: log._id, operator: log.operatorName || '系统', note: log.note || '', time: formatDateTime(log.at) }))
}

watch([statusFilter, sealTypeFilter], () => {
  page.value = 1
  loadData()
})

watch(() => props.view, () => {
  page.value = 1
  loadData()
})

watch(() => route.query.id, () => {
  checkDeepLink()
})

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 头部工具栏与筛选 -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
      <div class="flex flex-wrap items-center gap-2">
        <!-- 类别筛选 -->
        <Select v-model="sealTypeFilter">
          <SelectTrigger class="h-8 w-32 text-xs">
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
          <SelectTrigger class="h-8 w-28 text-xs">
            <SelectValue placeholder="审批状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem v-for="(conf, key) in SEAL_STATUS_MAP" :key="key" :value="key">
              {{ conf.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-8 px-2 text-xs" @click="loadData">
          <RotateCcw class="h-3.5 w-3.5 mr-1" /> 刷新
        </Button>
        <Button v-if="isMine" size="sm" class="h-8 gap-1 text-xs" @click="createDialogOpen = true">
          <Plus class="h-3.5 w-3.5" />
          <span>新建用章申请</span>
        </Button>
      </div>
    </div>

    <!-- 移动端：卡片列表，展开详情与桌面端共用同一个面板 -->
    <div v-if="isMobile" class="space-y-2">
      <div v-if="loading && rows.length === 0" class="rounded-lg border bg-background py-10 text-center text-xs text-muted-foreground">
        <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
        正在加载数据...
      </div>
      <div v-else-if="rows.length === 0" class="rounded-lg border bg-background py-10 text-center text-xs text-muted-foreground">
        暂无用章申请记录
      </div>
      <template v-else>
        <div v-for="row in rows" :key="row._id" class="rounded-lg border bg-background overflow-hidden">
          <button
            type="button"
            class="w-full px-3 py-2.5 text-left"
            :aria-expanded="expandedId === row._id"
            @click="toggleExpand(row._id)"
          >
            <div class="flex items-start gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground" :title="row.documentName">{{ row.documentName }}</span>
              <Badge :variant="SEAL_STATUS_MAP[row.status]?.variant || 'secondary'" class="shrink-0 text-[10px] font-normal">
                {{ SEAL_STATUS_MAP[row.status]?.label || row.status }}
              </Badge>
            </div>
            <div class="mt-1 text-xs text-muted-foreground tabular-nums">
              {{ formatDateTime(row.useAt) }} 至 {{ formatDateTime(row.expectedReturnAt) }}
            </div>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{{ row.reason }}</p>
          </button>

          <div class="flex items-center justify-end gap-2 border-t px-3 py-2">
            <Button
              v-if="canReviewRow(row)"
              variant="outline"
              size="sm"
              class="h-9 px-3 text-xs"
              :aria-expanded="expandedId === row._id"
              @click="toggleExpand(row._id)"
            >
              {{ expandedId === row._id ? '收起' : '审核' }}
            </Button>
            <Button
              v-else
              variant="ghost"
              size="sm"
              class="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              :aria-expanded="expandedId === row._id"
              @click="toggleExpand(row._id)"
            >
              {{ expandedId === row._id ? '收起' : '查看' }}
            </Button>
            <Button
              v-if="canWithdrawRow(row)"
              variant="ghost"
              size="sm"
              class="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              @click="handleWithdraw(row)"
            >
              撤回
            </Button>
          </div>

          <div v-if="expandedId === row._id" class="border-t bg-muted/30 p-3">
            <div v-if="loadingDetail" class="py-4 text-center text-xs text-muted-foreground">
              <Loader2 class="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
              加载详情...
            </div>

            <div v-else-if="expandedDetail" class="space-y-3">
              <!-- 申请人 / 部门 / 用章类型 / 份数 -->
              <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <span class="text-muted-foreground">申请人：</span>
                  <span class="text-foreground">{{ expandedDetail.applicant?.name || '—' }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">部门：</span>
                  <span class="text-foreground">{{ expandedDetail.useDepartment || expandedDetail.applicant?.department || '—' }}</span>
                </div>
                <div class="col-span-2 flex flex-wrap items-center gap-1">
                  <span class="text-muted-foreground">用章类型：</span>
                  <Badge
                    v-for="st in expandedDetail.sealTypes"
                    :key="st"
                    variant="outline"
                    class="text-[10px] font-normal px-1 py-0"
                  >
                    {{ SEAL_TYPE_MAP[st] }}
                  </Badge>
                </div>
                <div>
                  <span class="text-muted-foreground">份数：</span>
                  <span class="text-foreground tabular-nums">{{ expandedDetail.copies }}</span>
                </div>
              </div>

              <SealRequestDetailPanel
                :display="detailDisplay(expandedDetail)"
                :seal-items="detailSealItems(expandedDetail)"
                :logs="detailLogs(expandedDetail)"
              />

              <!-- 审批操作：意见在确认弹窗里填写，通过 / 驳回与桌面端同一入口 -->
              <div v-if="canReviewRow(row)" class="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-9 px-3 text-xs text-destructive hover:bg-destructive/10"
                  @click="openReviewDialog(row, 'rejected')"
                >
                  驳回
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-9 px-3 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  @click="openReviewDialog(row, 'approved')"
                >
                  通过
                </Button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="total > limit" class="flex items-center justify-between text-xs text-muted-foreground py-1">
        <div>共 {{ total }} 条记录</div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="h-9" :disabled="page <= 1" @click="page--; loadData()">上一页</Button>
          <span class="tabular-nums">第 {{ page }} 页</span>
          <Button variant="outline" size="sm" class="h-9" :disabled="page * limit >= total" @click="page++; loadData()">下一页</Button>
        </div>
      </div>
    </div>

    <!-- 数据表格 -->
    <div v-else class="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/50 text-xs">
            <TableHead class="w-24">单号</TableHead>
            <TableHead class="w-28">申请人</TableHead>
            <TableHead class="w-36">用章类别</TableHead>
            <TableHead class="min-w-48">文件名称与事由</TableHead>
            <TableHead class="w-48">用章时间段</TableHead>
            <TableHead class="w-20 text-center">状态</TableHead>
            <TableHead class="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading && rows.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                正在加载数据...
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="rows.length === 0">
            <TableRow>
              <TableCell colspan="7" class="h-36 text-center text-xs text-muted-foreground">
                暂无用章申请记录
              </TableCell>
            </TableRow>
          </template>

          <template v-for="row in rows" v-else :key="row._id">
            <TableRow class="text-xs transition-colors hover:bg-muted/40">
              <!-- 单号 -->
              <TableCell class="font-mono font-medium text-foreground">
                No.{{ row.serialNo }}
              </TableCell>

              <!-- 申请人 -->
              <TableCell>
                <div class="font-medium text-foreground">{{ row.applicant?.name || '—' }}</div>
                <div class="text-[11px] text-muted-foreground">{{ row.useDepartment || row.applicant?.department || '' }}</div>
              </TableCell>

              <!-- 用章类别 -->
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge
                    v-for="st in row.sealTypes"
                    :key="st"
                    variant="outline"
                    class="text-[10px] font-normal px-1 py-0"
                  >
                    {{ SEAL_TYPE_MAP[st] }}
                  </Badge>
                </div>
              </TableCell>

              <!-- 文件名称与事由 -->
              <TableCell>
                <div class="font-medium line-clamp-1 text-foreground" :title="row.documentName">
                  {{ row.documentName }}
                  <span class="text-muted-foreground font-normal ml-1">({{ row.copies }}份)</span>
                </div>
                <div class="text-[11px] text-muted-foreground line-clamp-1" :title="row.reason">
                  {{ row.reason }}
                </div>
              </TableCell>

              <!-- 用章时段 -->
              <TableCell class="text-[11px] text-muted-foreground">
                <div>{{ formatDateTime(row.useAt) }}</div>
                <div>至 {{ formatDateTime(row.expectedReturnAt) }}</div>
              </TableCell>

              <!-- 状态 -->
              <TableCell class="text-center">
                <Badge :variant="SEAL_STATUS_MAP[row.status]?.variant || 'secondary'" class="text-[10px] font-normal">
                  {{ SEAL_STATUS_MAP[row.status]?.label || row.status }}
                </Badge>
              </TableCell>

              <!-- 操作 -->
              <TableCell class="text-right space-x-1">
                <!-- 审批操作 -->
                <template v-if="row.status === 'pending' && (isInbox || row.currentApproverId === authStore.user?.id || authStore.isOwner)">
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    @click="openReviewDialog(row, 'approved')"
                  >
                    同意
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                    @click="openReviewDialog(row, 'rejected')"
                  >
                    驳回
                  </Button>
                </template>

                <!-- 申请人撤回 -->
                <Button
                  v-if="['pending', 'approved'].includes(row.status) && (isMine || String(row.applicantId) === String(authStore.user?.id))"
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  @click="handleWithdraw(row)"
                >
                  撤回
                </Button>

                <!-- 展开详情 -->
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  @click="toggleExpand(row._id)"
                >
                  <span>详情</span>
                  <ChevronUp v-if="expandedId === row._id" class="h-3 w-3 ml-0.5" />
                  <ChevronDown v-else class="h-3 w-3 ml-0.5" />
                </Button>
              </TableCell>
            </TableRow>

            <!-- 详情展开行 -->
            <TableRow v-if="expandedId === row._id" class="bg-muted/20 hover:bg-muted/20">
              <TableCell colspan="7" class="p-4 text-xs">
                <div v-if="loadingDetail" class="py-4 text-center text-muted-foreground">
                  <Loader2 class="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                  加载详情...
                </div>

                <SealRequestDetailPanel
                  v-else-if="expandedDetail"
                  :display="detailDisplay(expandedDetail)"
                  :seal-items="detailSealItems(expandedDetail)"
                  :logs="detailLogs(expandedDetail)"
                />
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 底部简易分页 -->
    <div v-if="total > limit" class="flex items-center justify-between text-xs text-muted-foreground py-2">
      <div>共 {{ total }} 条记录</div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--; loadData()">上一页</Button>
        <span>第 {{ page }} 页</span>
        <Button variant="outline" size="sm" :disabled="page * limit >= total" @click="page++; loadData()">下一页</Button>
      </div>
    </div>

    <!-- 新建申请弹窗 -->
    <SealRequestDialog
      v-model:open="createDialogOpen"
      @success="loadData"
    />

    <!-- 审批操作确认弹窗 -->
    <Dialog v-model:open="reviewDialogOpen">
      <DialogContent class="max-w-md p-5">
        <DialogHeader>
          <DialogTitle class="text-sm font-semibold">
            {{ reviewDecision === 'approved' ? '批准用章申请' : '驳回用章申请' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-3 py-2 text-xs">
          <div>
            <span class="text-muted-foreground">审批单据：</span>
            <span class="font-medium">No.{{ reviewingItem?.serialNo }} ({{ reviewingItem?.documentName }})</span>
          </div>
          <div>
            <span class="text-muted-foreground">申请人：</span>
            <span>{{ reviewingItem?.applicant?.name }} ({{ reviewingItem?.useDepartment }})</span>
          </div>

          <div class="space-y-1.5 pt-1">
            <label class="font-medium text-muted-foreground">
              {{ reviewDecision === 'approved' ? '审批意见（选填）' : '驳回理由（必填）' }}
            </label>
            <Textarea
              v-model="reviewComment"
              rows="3"
              :placeholder="reviewDecision === 'approved' ? '填写审批备注' : '填写驳回理由，告知申请人原因'"
              class="text-xs resize-none"
            />
          </div>
        </div>

        <DialogFooter class="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" size="sm" @click="reviewDialogOpen = false">取消</Button>
          <Button
            size="sm"
            :variant="reviewDecision === 'approved' ? 'default' : 'destructive'"
            :disabled="submittingReview || (reviewDecision === 'rejected' && !reviewComment.trim())"
            @click="submitReview"
          >
            <Loader2 v-if="submittingReview" class="h-3.5 w-3.5 mr-1 animate-spin" />
            <span>{{ reviewDecision === 'approved' ? '确认批准' : '确认驳回' }}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
