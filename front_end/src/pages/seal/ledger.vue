<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { FileText, BarChart3, RotateCcw, Loader2, Stamp, Calendar } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDevice } from '@/composables/use-device'
import {
  getSealLedger,
  getSealStatistics,
  SEAL_TYPE_MAP,
  type SealUsageLog,
  type SealStatisticsItem,
  type SealType
} from '@/services/api/seal.api'

const { isMobile } = useDevice()

const activeTab = ref<'ledger' | 'statistics'>('ledger')

// 台账明细状态
const loadingLedger = ref(false)
const ledgerLogs = ref<SealUsageLog[]>([])
const ledgerPage = ref(1)
const ledgerLimit = 20
const ledgerTotal = ref(0)
const actionFilter = ref<string>('all')
const sealTypeFilter = ref<string>('all')

// 统计报表状态
const loadingStats = ref(false)
const statsList = ref<SealStatisticsItem[]>([])

const ACTION_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  submit: { label: '提交申请', variant: 'secondary' },
  approve: { label: '审批通过', variant: 'outline' },
  reject: { label: '审批驳回', variant: 'destructive' },
  withdraw: { label: '撤回申请', variant: 'outline' },
  checkout: { label: '借出发章', variant: 'default' },
  return: { label: '归还收章', variant: 'secondary' },
  overdue: { label: '标记逾期', variant: 'destructive' },
  remind: { label: '催还通知', variant: 'destructive' },
  watch_notified: { label: '候补通知', variant: 'outline' }
}

async function loadLedger() {
  loadingLedger.value = true
  try {
    const res = await getSealLedger({
      action: actionFilter.value === 'all' ? undefined : actionFilter.value,
      sealType: sealTypeFilter.value === 'all' ? undefined : sealTypeFilter.value,
      page: ledgerPage.value,
      limit: ledgerLimit
    })
    if (res.ok && res.data) {
      ledgerLogs.value = res.data
      ledgerTotal.value = res.pagination?.total || 0
    }
  } catch (err: any) {
    toast.error('加载使用台账失败')
  } finally {
    loadingLedger.value = false
  }
}

async function loadStatistics() {
  loadingStats.value = true
  try {
    const res = await getSealStatistics()
    if (res.ok && res.data) {
      statsList.value = res.data
    }
  } catch (err: any) {
    toast.error('加载统计数据失败')
  } finally {
    loadingStats.value = false
  }
}

/** 移动端统计页顶部的小汇总：由已加载的统计行求和，不额外发请求。 */
const statsSummary = computed(() => ({
  itemCount: statsList.value.length,
  borrowCount: statsList.value.reduce((sum, item) => sum + (item.borrowCount || 0), 0),
  overdueCount: statsList.value.reduce((sum, item) => sum + (item.overdueCount || 0), 0),
  totalDurationMinutes: statsList.value.reduce((sum, item) => sum + (item.totalDurationMinutes || 0), 0)
}))

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return '0分钟'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}天${hours % 24}小时`
  }
  if (hours > 0) {
    return `${hours}小时${remainingMinutes > 0 ? `${remainingMinutes}分` : ''}`
  }
  return `${minutes}分钟`
}

function formatDateTime(val: string | undefined | null) {
  if (!val) return '—'
  const d = new Date(val)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

watch([actionFilter, sealTypeFilter], () => {
  ledgerPage.value = 1
  loadLedger()
})

onMounted(() => {
  loadLedger()
  loadStatistics()
})
</script>

<template>
  <div class="space-y-4 p-4 md:p-0">
    <!-- 顶部标签切换 -->
    <div class="flex items-center justify-between gap-2 bg-card p-3 rounded-lg border">
      <div class="flex min-w-0 items-center gap-1.5 overflow-x-auto p-1 bg-muted/60 rounded-md">
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium transition-all"
          :class="activeTab === 'ledger' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'ledger'"
        >
          <FileText class="h-3.5 w-3.5 text-primary" />
          <span>审计流水明细</span>
        </button>

        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium transition-all"
          :class="activeTab === 'statistics' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'statistics'; loadStatistics()"
        >
          <BarChart3 class="h-3.5 w-3.5 text-blue-500" />
          <span>印章使用统计</span>
        </button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 shrink-0 gap-1 text-xs"
        @click="activeTab === 'ledger' ? loadLedger() : loadStatistics()"
      >
        <RotateCcw class="h-3.5 w-3.5" /> 刷新
      </Button>
    </div>

    <!-- 视图 1：审计流水明细 -->
    <div v-if="activeTab === 'ledger'" class="space-y-3">
      <!-- 筛选栏 -->
      <div class="flex w-full flex-nowrap items-center gap-2 overflow-x-auto bg-card p-2.5 rounded-lg border text-xs sm:w-auto sm:flex-wrap sm:overflow-visible">
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

        <Select v-model="actionFilter">
          <SelectTrigger class="h-8 w-32 shrink-0 text-xs">
            <SelectValue placeholder="动作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部动作</SelectItem>
            <SelectItem v-for="(conf, key) in ACTION_MAP" :key="key" :value="key">
              {{ conf.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 流水记录（移动端：卡片流） -->
      <div v-if="isMobile" class="space-y-2">
        <p v-if="loadingLedger && ledgerLogs.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">加载台账明细...</p>
        <p v-else-if="ledgerLogs.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">暂无审计流水记录</p>
        <template v-else>
          <div v-for="log in ledgerLogs" :key="log._id" class="rounded-xl border bg-card px-3 py-2.5">
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{{ SEAL_TYPE_MAP[log.sealType] || log.sealType }}</span>
              <Badge :variant="ACTION_MAP[log.action]?.variant || 'outline'" class="shrink-0 text-[10px] font-normal px-1.5 py-0">
                {{ ACTION_MAP[log.action]?.label || log.action }}
              </Badge>
            </div>

            <div class="mt-1.5 flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">时间</span>
              <span class="min-w-0 flex-1 font-mono text-muted-foreground">{{ formatDateTime(log.at) }}</span>
            </div>

            <div class="mt-1 flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">实体章编号</span>
              <span class="min-w-0 flex-1 font-mono text-foreground">{{ log.sealItemCode || '—' }}</span>
            </div>

            <div class="mt-1 flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">操作人</span>
              <span class="min-w-0 flex-1 text-foreground">{{ log.operatorName || '系统' }}</span>
            </div>

            <div class="mt-1 flex gap-2 text-xs">
              <span class="w-16 shrink-0 text-muted-foreground">说明</span>
              <span class="min-w-0 flex-1 text-muted-foreground">{{ log.note || '—' }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 流水表格 -->
      <div v-else class="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/50 text-xs">
              <TableHead class="w-40">时间</TableHead>
              <TableHead class="w-24">动作</TableHead>
              <TableHead class="w-28">印章类别</TableHead>
              <TableHead class="w-32">实体章编号</TableHead>
              <TableHead class="w-28">操作人</TableHead>
              <TableHead class="min-w-64">业务说明 / 备注</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <template v-if="loadingLedger && ledgerLogs.length === 0">
              <TableRow>
                <TableCell colspan="6" class="h-36 text-center text-xs text-muted-foreground">
                  <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  加载台账明细...
                </TableCell>
              </TableRow>
            </template>

            <template v-else-if="ledgerLogs.length === 0">
              <TableRow>
                <TableCell colspan="6" class="h-36 text-center text-xs text-muted-foreground">
                  暂无审计流水记录
                </TableCell>
              </TableRow>
            </template>

            <template v-for="log in ledgerLogs" v-else :key="log._id">
              <TableRow class="text-xs transition-colors hover:bg-muted/40 font-normal">
                <TableCell class="text-muted-foreground font-mono">
                  {{ formatDateTime(log.at) }}
                </TableCell>
                <TableCell>
                  <Badge :variant="ACTION_MAP[log.action]?.variant || 'outline'" class="text-[10px] font-normal px-1.5 py-0">
                    {{ ACTION_MAP[log.action]?.label || log.action }}
                  </Badge>
                </TableCell>
                <TableCell class="font-medium">
                  {{ SEAL_TYPE_MAP[log.sealType] || log.sealType }}
                </TableCell>
                <TableCell class="font-mono">
                  {{ log.sealItemCode || '—' }}
                </TableCell>
                <TableCell>
                  {{ log.operatorName || '系统' }}
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ log.note || '—' }}
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>

      <!-- 分页 -->
      <div v-if="ledgerTotal > ledgerLimit" class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground py-2">
        <div>共 {{ ledgerTotal }} 条流水记录</div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="h-9 sm:h-8" :disabled="ledgerPage <= 1" @click="ledgerPage--; loadLedger()">上一页</Button>
          <span>第 {{ ledgerPage }} 页</span>
          <Button variant="outline" size="sm" class="h-9 sm:h-8" :disabled="ledgerPage * ledgerLimit >= ledgerTotal" @click="ledgerPage++; loadLedger()">下一页</Button>
        </div>
      </div>
    </div>

    <!-- 视图 2：印章使用统计 -->
    <div v-else-if="isMobile" class="space-y-2">
      <p v-if="loadingStats && statsList.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">计算印章统计数据...</p>
      <p v-else-if="statsList.length === 0" class="rounded-xl border bg-card py-10 text-center text-xs text-muted-foreground">暂无统计数据</p>
      <template v-else>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border bg-card px-3 py-2">
            <div class="text-xs text-muted-foreground">实体章</div>
            <div class="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{{ statsSummary.itemCount }} <span class="text-xs font-normal text-muted-foreground">枚</span></div>
          </div>
          <div class="rounded-lg border bg-card px-3 py-2">
            <div class="text-xs text-muted-foreground">累计借出</div>
            <div class="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{{ statsSummary.borrowCount }} <span class="text-xs font-normal text-muted-foreground">次</span></div>
          </div>
          <div class="rounded-lg border bg-card px-3 py-2">
            <div class="text-xs text-muted-foreground">累计借出时长</div>
            <div class="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{{ formatDuration(statsSummary.totalDurationMinutes) }}</div>
          </div>
          <div class="rounded-lg border bg-card px-3 py-2">
            <div class="text-xs text-muted-foreground">逾期次数</div>
            <div class="mt-0.5 text-lg font-semibold tabular-nums" :class="statsSummary.overdueCount > 0 ? 'text-destructive' : 'text-foreground'">{{ statsSummary.overdueCount }} <span class="text-xs font-normal text-muted-foreground">次</span></div>
          </div>
        </div>

        <div v-for="stat in statsList" :key="stat.sealItemId" class="rounded-xl border bg-card px-3 py-2.5">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground">{{ stat.code }}</span>
            <Badge v-if="stat.status === 'active'" variant="outline" class="shrink-0 text-[10px] text-emerald-600 bg-emerald-500/5">在用</Badge>
            <Badge v-else-if="stat.status === 'disabled'" variant="secondary" class="shrink-0 text-[10px]">停用</Badge>
            <Badge v-else variant="destructive" class="shrink-0 text-[10px]">报废</Badge>
          </div>

          <div class="mt-1.5 flex gap-2 text-xs">
            <span class="w-16 shrink-0 text-muted-foreground">印章类别</span>
            <span class="min-w-0 flex-1 text-foreground">{{ stat.sealTypeName }}</span>
          </div>

          <div class="mt-1 flex gap-2 text-xs">
            <span class="w-16 shrink-0 text-muted-foreground">在库状态</span>
            <span class="min-w-0 flex-1">
              <Badge v-if="stat.physicalOut" variant="destructive" class="text-[10px]">借出中 ({{ stat.currentBorrowerName }})</Badge>
              <span v-else class="font-medium text-emerald-600">空闲</span>
            </span>
          </div>

          <div class="mt-1 flex gap-2 text-xs">
            <span class="w-16 shrink-0 text-muted-foreground">累计借出</span>
            <span class="min-w-0 flex-1 font-mono text-foreground">{{ stat.borrowCount }} 次 <span class="text-muted-foreground">· {{ formatDuration(stat.totalDurationMinutes) }}</span></span>
          </div>

          <div class="mt-1 flex gap-2 text-xs">
            <span class="w-16 shrink-0 text-muted-foreground">逾期</span>
            <span class="min-w-0 flex-1 font-mono" :class="stat.overdueCount > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'">
              {{ stat.overdueCount }} 次 <span v-if="stat.overdueDurationMinutes > 0">· {{ formatDuration(stat.overdueDurationMinutes) }}</span>
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- 印章使用统计表格 -->
    <div v-else class="space-y-4">
      <div class="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/50 text-xs">
              <TableHead class="w-32">印章类别</TableHead>
              <TableHead class="w-36">实体章编号</TableHead>
              <TableHead class="w-24 text-center">状态</TableHead>
              <TableHead class="w-32 text-center">在库状态</TableHead>
              <TableHead class="w-28 text-center">累计借出</TableHead>
              <TableHead class="w-36 text-center">累计借用时长</TableHead>
              <TableHead class="w-28 text-center">逾期次数</TableHead>
              <TableHead class="w-36 text-center">累计逾期时长</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <template v-if="loadingStats && statsList.length === 0">
              <TableRow>
                <TableCell colspan="8" class="h-36 text-center text-xs text-muted-foreground">
                  <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  计算印章统计数据...
                </TableCell>
              </TableRow>
            </template>

            <template v-else-if="statsList.length === 0">
              <TableRow>
                <TableCell colspan="8" class="h-36 text-center text-xs text-muted-foreground">
                  暂无统计数据
                </TableCell>
              </TableRow>
            </template>

            <template v-for="stat in statsList" v-else :key="stat.sealItemId">
              <TableRow class="text-xs transition-colors hover:bg-muted/40 font-normal">
                <TableCell class="font-medium text-foreground">
                  {{ stat.sealTypeName }}
                </TableCell>
                <TableCell class="font-mono font-medium">
                  {{ stat.code }}
                </TableCell>
                <TableCell class="text-center">
                  <Badge v-if="stat.status === 'active'" variant="outline" class="text-[10px] text-emerald-600 bg-emerald-500/5">在用</Badge>
                  <Badge v-else-if="stat.status === 'disabled'" variant="secondary" class="text-[10px]">停用</Badge>
                  <Badge v-else variant="destructive" class="text-[10px]">报废</Badge>
                </TableCell>
                <TableCell class="text-center">
                  <Badge v-if="stat.physicalOut" variant="destructive" class="text-[10px]">
                    借出中 ({{ stat.currentBorrowerName }})
                  </Badge>
                  <span v-else class="text-emerald-600 font-medium text-[11px]">空闲</span>
                </TableCell>
                <TableCell class="text-center font-mono font-medium">
                  {{ stat.borrowCount }} 次
                </TableCell>
                <TableCell class="text-center font-mono text-muted-foreground">
                  {{ formatDuration(stat.totalDurationMinutes) }}
                </TableCell>
                <TableCell class="text-center font-mono" :class="stat.overdueCount > 0 ? 'text-destructive font-medium' : ''">
                  {{ stat.overdueCount }} 次
                </TableCell>
                <TableCell class="text-center font-mono" :class="stat.overdueDurationMinutes > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'">
                  {{ formatDuration(stat.overdueDurationMinutes) }}
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
