<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Send } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { publishPayrollStatements, type PayrollPublishSummary, type PayrollStatementRow } from '@/services/api/payroll.api'
import { formatCents } from '@/utils/payroll'

const props = defineProps<{ month: string, rows: PayrollStatementRow[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ published: [] }>()

/** 能发布的是「存了完整草稿」的人：没录入的人没有草稿，已发布且无修改的人也不需要再发。 */
const candidates = computed(() => props.rows.filter(row => row.statementStatus === 'draft'))
const selected = ref(new Set<string>())
const publishing = ref(false)
const result = ref<PayrollPublishSummary | null>(null)

const allSelected = computed(() => candidates.value.length > 0 && selected.value.size === candidates.value.length)
const selectedRows = computed(() => candidates.value.filter(row => selected.value.has(row.employeeId)))
const selectedNetPayCents = computed(() => selectedRows.value.reduce((sum, row) => sum + netPayOf(row), 0))

/** 有已发布版本的是「修订」，其余是首次发布。 */
function isRevision(row: PayrollStatementRow) {
  return Boolean(row.publishedTotals)
}

function netPayOf(row: PayrollStatementRow) {
  return (row.totals ?? row.publishedTotals)?.netPayCents ?? 0
}

function toggleRow(employeeId: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(employeeId)
  else next.delete(employeeId)
  selected.value = next
}

function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(candidates.value.map(row => row.employeeId)) : new Set()
}

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '批量发布失败')
}

async function submit() {
  if (publishing.value) return
  const targets = selectedRows.value
  if (!targets.length) return
  publishing.value = true
  try {
    const response = await publishPayrollStatements(props.month, targets.map(row => row.employeeId))
    if (response.ok === false || !response.data) throw new Error(String(response.error || '批量发布失败'))
    result.value = response.data
    if (response.data.failed) toast.error(`批量发布完成：成功 ${response.data.published} 人，失败 ${response.data.failed} 人`)
    else toast.success(`已发布 ${response.data.published} 人的工资条`)
    emit('published')
  }
  catch (error) { showError(error) }
  finally { publishing.value = false }
}

// 打开时默认全选（用户要的「默认是全部」，可再逐个取消）
watch(open, (value) => {
  if (!value) return
  result.value = null
  selected.value = new Set(candidates.value.map(row => row.employeeId))
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>批量发布 · {{ month }}</DialogTitle>
        <DialogDescription>只列出已存草稿的人，默认全选；发布后员工即可看到本月工资条。</DialogDescription>
      </DialogHeader>

      <div v-if="!candidates.length" class="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
        本月没有待发布的工资草稿。
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>待发布 {{ candidates.length }} 人<span v-if="selectedRows.length">，已选 {{ selectedRows.length }} 人</span></span>
          <span v-if="selectedRows.length" class="tabular-nums">合计实发 {{ formatCents(selectedNetPayCents) }}</span>
        </div>

        <div class="max-h-80 overflow-auto rounded-md border bg-background">
          <Table class="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead class="w-12">
                  <Checkbox :model-value="allSelected" :disabled="publishing" :aria-label="allSelected ? '取消全选' : '全选待发布人员'" @update:model-value="checked => toggleAll(checked === true)" />
                </TableHead>
                <TableHead>员工</TableHead>
                <TableHead class="w-24">类型</TableHead>
                <TableHead class="w-28 text-right">实发金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in candidates" :key="row.employeeId">
                <TableCell><Checkbox :model-value="selected.has(row.employeeId)" :disabled="publishing" :aria-label="`选择${row.name}`" @update:model-value="checked => toggleRow(row.employeeId, checked === true)" /></TableCell>
                <TableCell>
                  <div class="font-medium">{{ row.name }}</div>
                  <div class="text-xs text-muted-foreground">{{ [row.employeeNo, row.department].filter(Boolean).join(' · ') || '—' }}</div>
                </TableCell>
                <TableCell><Badge variant="outline">{{ isRevision(row) ? '修订' : '首次发布' }}</Badge></TableCell>
                <TableCell class="text-right tabular-nums">{{ formatCents(netPayOf(row)) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div v-if="result" class="space-y-1 rounded-md border px-3 py-2 text-xs">
          <div class="font-medium">发布结果：成功 {{ result.published }} 人，失败 {{ result.failed }} 人</div>
          <ul v-if="result.results.some(item => item.status === 'failed')" class="list-disc pl-4 text-muted-foreground">
            <li v-for="item in result.results.filter(row => row.status === 'failed')" :key="item.employeeId">{{ item.name || item.employeeId }}：{{ item.error }}</li>
          </ul>
        </div>
      </template>

      <DialogFooter>
        <Button variant="outline" :disabled="publishing" @click="open = false">关闭</Button>
        <Button :disabled="!selectedRows.length || publishing" @click="submit"><Send class="mr-1.5 size-4" />{{ publishing ? '发布中…' : `发布 ${selectedRows.length} 人` }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
