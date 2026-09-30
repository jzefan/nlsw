<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { importAttendanceLedgerRecords, type AttendanceLedgerImportEntry, type AttendanceLedgerImportResult, type AttendanceLedgerRow } from '@/services/api/attendance.api'

const props = defineProps<{ month: string, rows: AttendanceLedgerRow[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

/** 可导入的字段：都是「次数」。请假不在其中——请假以系统里审批通过的申请单为准。 */
type ImportField = 'lateWithin10' | 'lateOver10' | 'lateTotal' | 'earlyLeave' | 'noClockRecord'
type RowStatus = 'ready' | 'missing' | 'ambiguous' | 'invalid' | 'empty'

const IMPORT_FIELDS: ImportField[] = ['lateWithin10', 'lateOver10', 'lateTotal', 'earlyLeave', 'noClockRecord']
const fieldLabels: Record<ImportField, string> = {
  lateWithin10: '迟到（≤10分钟）',
  lateOver10: '迟到（>10分钟）',
  lateTotal: '迟到合计',
  earlyLeave: '早退',
  noClockRecord: '无打卡记录',
}
const statusLabels: Record<RowStatus, string> = {
  ready: '待导入',
  missing: '名单里没有',
  ambiguous: '同名待确认',
  invalid: '数据有问题',
  empty: '无需导入',
}
const nameAliases = ['姓名', '员工姓名', '名字']
/** 表头别名：两级表头拼出来的「迟到10分钟以内」也能认出来。 */
const fieldAliases: Record<ImportField, string[]> = {
  lateWithin10: ['迟到10分钟以内', '10分钟以内', '十分钟以内'],
  lateOver10: ['迟到10分钟以上', '10分钟以上', '十分钟以上'],
  lateTotal: ['迟到合计', '合计'],
  earlyLeave: ['早退'],
  noClockRecord: ['无打卡记录', '无打卡'],
}
const noteAliases = ['备注', '说明']

interface PreviewRow {
  /** 文件里的行号，方便回 Excel 里定位 */
  line: number
  rawName: string
  /** 自动匹配或人工指定的人；null 表示还没定 */
  matched: AttendanceLedgerRow | null
  status: RowStatus
  note: string
  values: Partial<Record<ImportField, number>>
  importNote: string
  invalid: string[]
  /** 导入后的结果 */
  outcome: AttendanceLedgerImportResult | null
}

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const parsing = ref(false)
const importing = ref(false)
const preview = ref<PreviewRow[]>([])

/** 名单：按姓名索引（可能重名），供自动匹配与人工指定。 */
const rosterByName = computed(() => {
  const map = new Map<string, AttendanceLedgerRow[]>()
  for (const row of props.rows) {
    const key = normalizeText(row.name || row.displayName || '')
    if (!key) continue
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return map
})

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim()
}
function normalizeLabel(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').replace(/[（）()]/g, '').trim()
}
function matchByAliases(label: string, aliases: string[]) {
  const normalized = normalizeLabel(label)
  if (!normalized) return false
  return aliases.some(alias => normalized === normalizeLabel(alias) || normalized.includes(normalizeLabel(alias)))
}
function labelsOfRow(matrix: unknown[][], row: number) {
  return (matrix[row] ?? []).map(cell => String(cell ?? '').trim())
}
/**
 * 表头可能是两行：「迟到」跨三列、下一行才是「10分钟以内 / 10分钟以上 / 合计」。
 * 所以列名要把相邻两行拼起来判；下一行是纯数字时不拼（那是数据）。
 */
function mergedLabels(matrix: unknown[][], row: number) {
  const current = labelsOfRow(matrix, row)
  const next = row + 1 < matrix.length ? labelsOfRow(matrix, row + 1) : []
  const width = Math.max(current.length, next.length)
  return Array.from({ length: width }, (_, column) => {
    const head = current[column] ?? ''
    const tail = next[column] ?? ''
    if (!head) return tail
    if (!tail || /^\d+(\.\d+)?$/.test(tail)) return head
    return `${head}${tail}`
  })
}

interface ColumnPlan {
  headerRow: number
  name: number
  fields: Array<{ column: number, key: ImportField }>
  note: number
}

function planColumns(matrix: unknown[][]): ColumnPlan {
  let headerRow = -1
  for (let row = 0; row < Math.min(matrix.length, 6); row++) {
    if (labelsOfRow(matrix, row).some(label => matchByAliases(label, nameAliases))) { headerRow = row; break }
  }
  if (headerRow < 0) throw new Error('没找到「姓名」列，请对照「下载模板」检查表头')

  const labels = mergedLabels(matrix, headerRow)
  const name = labels.findIndex(label => matchByAliases(label, nameAliases))
  const note = labels.findIndex(label => matchByAliases(label, noteAliases))
  const fields: ColumnPlan['fields'] = []
  for (const key of IMPORT_FIELDS) {
    const column = labels.findIndex(label => matchByAliases(label, fieldAliases[key]))
    if (column >= 0 && column !== name && column !== note) fields.push({ column, key })
  }
  if (!fields.length) throw new Error('没识别到迟到 / 早退 / 无打卡记录列，请对照「下载模板」检查表头')
  return { headerRow, name, fields, note }
}

/**
 * 表尾的说明行（「注：空白表示没有违纪行为」）与模板自带的示例行不是员工行，直接跳过。
 * 真人姓名不会带冒号、也不会整串被圆括号包住。
 */
function isNonEmployeeLabel(name: string) {
  return /^[（(].*[)）]$/.test(name) || name.includes('：') || name.includes(':')
}

/** 空白 = 不动原有值；非法值（负数、文字）整行作废。 */
function cellToCount(value: unknown): number | undefined | null {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const number = Number(text)
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) return null
  return number
}

function buildPreview(matrix: unknown[][], plan: ColumnPlan): PreviewRow[] {
  const rows: PreviewRow[] = []
  for (let index = plan.headerRow + 1; index < matrix.length; index++) {
    const raw = matrix[index] ?? []
    // 两级表头的第二行、空行、表尾注释行都没有姓名，跳过
    const rawName = String(raw[plan.name] ?? '').trim()
    if (!rawName || isNonEmployeeLabel(rawName)) continue

    const values: Partial<Record<ImportField, number>> = {}
    const invalid: string[] = []
    for (const { column, key } of plan.fields) {
      const count = cellToCount(raw[column])
      if (count === null) invalid.push(`${fieldLabels[key]}不是有效的次数（应为非负整数）`)
      else if (count !== undefined) values[key] = count
    }
    const importNote = plan.note >= 0 ? String(raw[plan.note] ?? '').trim() : ''

    const candidates = rosterByName.value.get(normalizeText(rawName)) ?? []
    let matched: AttendanceLedgerRow | null = candidates.length === 1 ? candidates[0] : null
    let status: RowStatus = 'ready'
    let note = ''
    if (candidates.length > 1) { status = 'ambiguous'; note = `有 ${candidates.length} 个同名员工，请在「对应员工」里指定` }
    else if (!candidates.length) { status = 'missing'; note = '名单里没有这个姓名，请在「对应员工」里指定或检查错别字' }
    if (invalid.length) status = 'invalid'
    // 表里这一行什么都没填（「空白表示没有违纪行为」）：不是错误，只是没有要写入的内容
    else if (!Object.keys(values).length && !importNote) status = 'empty'

    rows.push({ line: index + 1, rawName, matched, status, note, values, importNote, invalid, outcome: null })
  }
  if (!rows.length) throw new Error('没有解析到任何员工行，请检查姓名列')
  return rows
}

const readyRows = computed(() => preview.value.filter(row => row.matched && !row.invalid.length
  && (Object.keys(row.values).length > 0 || row.importNote)))

function pickEmployee(row: PreviewRow, employeeId: string) {
  row.matched = props.rows.find(item => item.employeeId === employeeId) ?? null
  if (row.matched) {
    const empty = !Object.keys(row.values).length && !row.importNote
    row.status = row.invalid.length ? 'invalid' : empty ? 'empty' : 'ready'
    row.note = ''
  }
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  parsing.value = true
  fileName.value = file.name
  preview.value = []
  try {
    const buffer = await file.arrayBuffer()
    const book = XLSX.read(buffer, { type: 'array' })
    const sheet = book.Sheets[book.SheetNames[0]]
    if (!sheet) throw new Error('文件里没有工作表')
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
    preview.value = buildPreview(matrix, planColumns(matrix))
  }
  catch (error) {
    preview.value = []
    toast.error(error instanceof Error ? error.message : '文件解析失败')
  }
  finally {
    parsing.value = false
    if (input) input.value = ''
  }
}

function downloadTemplate() {
  const header1 = ['姓名', '迟到', null, null, '早退', '无打卡记录', '备注']
  const header2 = [null, '10分钟以内', '10分钟以上', '合计', null, null, null]
  const sheet = XLSX.utils.aoa_to_sheet([header1, header2, ['（示例）', 0, 0, 0, 0, 0, '']])
  sheet['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 3 } }]
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '考勤记录')
  XLSX.writeFile(book, `考勤导入模板_${props.month}.xlsx`)
}

async function submit() {
  if (importing.value || !readyRows.value.length) return
  importing.value = true
  try {
    const entries: AttendanceLedgerImportEntry[] = readyRows.value.map(row => ({
      employeeId: row.matched!.employeeId,
      name: row.rawName,
      ...row.values,
      importNote: row.importNote,
    }))
    const response = await importAttendanceLedgerRecords(props.month, entries)
    if (response.ok === false) throw new Error(String(response.error || '导入失败'))
    const results = response.data?.results ?? []
    for (const row of preview.value) {
      row.outcome = results.find(item => item.employeeId === row.matched?.employeeId) ?? null
    }
    const failed = results.filter(item => item.status === 'failed').length
    if (failed) toast.error(`导入完成：成功 ${results.length - failed} 人，失败 ${failed} 人`)
    else toast.success(`已导入 ${results.length} 人的考勤记录`)
    emit('imported')
  }
  catch (error) {
    const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
    toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '导入失败')
  }
  finally {
    importing.value = false
  }
}

watch(open, value => {
  if (value) return
  preview.value = []
  fileName.value = ''
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>导入考勤记录 · {{ month }}</DialogTitle>
        <DialogDescription>
          导入迟到次数、早退次数、无打卡记录次数与备注，落到每位员工这一行。
          系统按「考勤设置 → 实到分钟计算规则」用这些次数算实到建议值，<span class="text-foreground">由考勤管理员确认或修改</span>；空白单元格不会改动已填内容。请假以系统里审批通过的申请单为准，不导入。
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap items-center gap-2">
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleFile">
        <Button size="sm" :disabled="parsing || importing" @click="fileInput?.click()"><Upload class="mr-1.5 size-4" />{{ parsing ? '解析中…' : '选择文件' }}</Button>
        <Button size="sm" variant="outline" :disabled="importing" @click="downloadTemplate"><Download class="mr-1.5 size-4" />下载模板</Button>
        <span v-if="fileName" class="text-xs text-muted-foreground">{{ fileName }}</span>
      </div>

      <p v-if="!preview.length" class="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">选择考勤表后，这里会先显示逐行核对结果，确认无误再导入</p>

      <div v-else class="overflow-x-auto rounded-md border">
        <Table class="min-w-[860px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead class="w-10">行</TableHead>
              <TableHead class="w-24">表中姓名</TableHead>
              <TableHead class="w-36">对应员工</TableHead>
              <TableHead v-for="key in IMPORT_FIELDS" :key="key" class="w-20 text-right">{{ fieldLabels[key] }}</TableHead>
              <TableHead class="min-w-32">备注</TableHead>
              <TableHead class="w-28">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="row in preview" :key="row.line">
              <TableCell class="tabular-nums text-muted-foreground">{{ row.line }}</TableCell>
              <TableCell class="font-medium">{{ row.rawName }}</TableCell>
              <TableCell>
                <Select :model-value="row.matched?.employeeId ?? ''" @update:model-value="value => pickEmployee(row, String(value ?? ''))">
                  <SelectTrigger size="sm" class="w-full text-xs" :aria-label="`指定${row.rawName}对应的员工`">
                    <SelectValue :placeholder="row.matched ? '' : '请选择员工'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="person in rows" :key="person.employeeId" :value="person.employeeId">
                      {{ person.name }}<span v-if="person.employeeNo" class="text-muted-foreground">（{{ person.employeeNo }}）</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div v-if="row.matched" class="mt-1 text-[11px] text-muted-foreground">{{ row.matched.employeeNo || '无工号' }}<span v-if="row.matched.department"> · {{ row.matched.department }}</span></div>
              </TableCell>
              <TableCell v-for="key in IMPORT_FIELDS" :key="key" class="text-right tabular-nums">
                <span v-if="row.values[key] !== undefined">{{ row.values[key] }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell>
                <div v-if="row.importNote" class="max-w-[200px] whitespace-normal break-words text-muted-foreground">{{ row.importNote }}</div>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell>
                <Badge v-if="row.outcome" :variant="row.outcome.status === 'failed' ? 'destructive' : 'outline'">
                  {{ row.outcome.status === 'failed' ? `失败：${row.outcome.error}` : row.outcome.status === 'created' ? '已新建行' : '已更新' }}
                </Badge>
                <Badge v-else-if="row.status === 'ready'" variant="outline">待导入</Badge>
                <Badge v-else-if="row.status === 'empty'" variant="outline" class="text-muted-foreground">无需导入</Badge>
                <Badge v-else variant="outline" class="text-amber-700 dark:text-amber-400" :title="row.note">{{ statusLabels[row.status] }}</Badge>
                <div v-if="row.invalid.length" class="mt-1 text-[11px] text-muted-foreground">{{ row.invalid.join('；') }}</div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="importing" @click="open = false">关闭</Button>
        <Button :disabled="!readyRows.length || importing" @click="submit">{{ importing ? '导入中…' : `导入 ${readyRows.length} 人` }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
