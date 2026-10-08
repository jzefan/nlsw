<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { payrollComponentFields } from '@/services/api/attendance.api'
import { importPayrollDrafts, type PayrollComponents, type PayrollImportSummary, type PayrollStatementRow } from '@/services/api/payroll.api'
import { useDevice } from '@/composables/use-device'
import { computePayrollTotals } from '@/constants/payroll-fields'
import { formatCents } from '@/utils/payroll'

const props = defineProps<{ month: string, rows: PayrollStatementRow[] }>()
const { isMobile } = useDevice()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

type ComponentKey = typeof payrollComponentFields[number][0]
/** 汇总列：文件里留着（和公司现行表格一致），但系统不接收，只用来提示与录入项的差异。 */
type SummaryKind = 'totalCompensationCents' | 'payableBeforePersonalDeductionsCents' | 'netPayCents'
type RowStatus = 'new' | 'overwrite-draft' | 'overwrite-published' | 'missing' | 'ambiguous' | 'invalid'

const statusLabels: Record<RowStatus, string> = {
  new: '新增草稿',
  'overwrite-draft': '覆盖草稿',
  'overwrite-published': '覆盖已发布',
  missing: '名单里没有',
  ambiguous: '重名待确认',
  invalid: '数据有问题',
}
/** 可以写入的状态；其余（找不到人、重名、金额非法）只提示、不导入。 */
const writableStatuses: RowStatus[] = ['new', 'overwrite-draft', 'overwrite-published']

const nameAliases = ['姓名', '员工姓名', '名字']
const employeeNoAliases = ['工号', '员工工号', '职工号']
const summaryAliases: Array<{ kind: SummaryKind, aliases: string[] }> = [
  { kind: 'totalCompensationCents', aliases: ['工资总额', '薪酬总额', '工资合计'] },
  { kind: 'payableBeforePersonalDeductionsCents', aliases: ['合计应发', '应发合计', '应发工资'] },
  { kind: 'netPayCents', aliases: ['实发金额', '实发工资', '实发合计', '实发'] },
]

/**
 * 表头别名：公司表格换了叫法也能识别。匹配先精确、再包含（长别名优先），
 * 这样「补贴 / 交通补贴」这类两级表头拼出来的「补贴交通补贴」也能落到交通补贴上。
 */
const columnAliases: Record<ComponentKey, string[]> = {
  basicPayCents: ['基本薪资', '基本工资小计'],
  performancePayCents: ['绩效', '绩效奖金', '绩效薪资'],
  positionPayCents: ['岗位津贴', '岗位薪资'],
  seniorityPayCents: ['工龄补贴', '工龄薪资'],
  attendanceBonusCents: ['全勤奖', '满勤'],
  transportAllowanceCents: ['交通补助', '交通费'],
  lunchAllowanceCents: ['餐补', '午餐补助', '伙食补贴'],
  overtimeAllowanceCents: ['加班费', '加班补助'],
  welfareCents: ['福利', '福利费', '节日福利'],
  employerSocialInsuranceCents: ['社保单位承担', '公司社保', '社保(公司)'],
  employerHousingFundCents: ['公积金单位承担', '公司公积金', '公积金(公司)'],
  employeeSocialInsuranceCents: ['社保个人', '个人社保', '社保(个人)'],
  employeeHousingFundCents: ['公积金个人', '个人公积金', '公积金(个人)'],
  sickLeaveDeductionCents: ['病假扣款'],
  personalLeaveDeductionCents: ['事假扣款'],
  absenceDeductionCents: ['旷工扣款'],
  incomeTaxCents: ['个人所得税', '个税', '个税扣款'],
}

interface PreviewRow {
  /** 文件里的行号，方便回到 Excel 里定位 */
  line: number
  rawName: string
  rawEmployeeNo: string
  matched: PayrollStatementRow | null
  status: RowStatus
  note: string
  /** 只是提示，不影响导入（例如文件里的汇总列与录入项对不上） */
  warnings: string[]
  /** 提示的明细，放在单元格 title 里 */
  warningDetail: string
  components: PayrollComponents
  netPayCents: number
}

interface ColumnPlan {
  headerRow: number
  name: number
  employeeNo: number
  components: Array<{ column: number, key: ComponentKey }>
  summaries: Array<{ column: number, kind: SummaryKind }>
}

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const parsing = ref(false)
const importing = ref(false)
const preview = ref<PreviewRow[]>([])
const result = ref<PayrollImportSummary | null>(null)

/** 去掉空白、全角括号、末尾「元」等写法差异，只留下可比对的列名。 */
function normalizeLabel(value: unknown) {
  return String(value ?? '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[：:]/g, '')
    .replace(/\(元\)$/g, '')
    .replace(/元$/g, '')
}

/** 姓名/工号比对：统一去空白与全角空格，英文统一小写。 */
function normalizeText(value: string) {
  return value.replace(/[\s\u3000]+/g, '').toLowerCase()
}

const flatAliases = payrollComponentFields
  .flatMap(([key, label]) => [label, ...(columnAliases[key] ?? [])].map(alias => ({ key: key as ComponentKey, alias: normalizeLabel(alias) })))
  .sort((first, second) => second.alias.length - first.alias.length)

function matchByAliases(label: string, aliases: string[]) {
  if (!label) return false
  const needles = aliases.map(normalizeLabel).filter(Boolean)
  return needles.includes(label) || needles.some(needle => needle.length >= 2 && label.includes(needle))
}

function matchComponentKey(label: string): ComponentKey | null {
  if (!label) return null
  for (const item of flatAliases) if (item.alias === label) return item.key
  // 包含兜底按别名长度从长到短试；「请假 / 病假」这类两级表头会拼成「请假病假」，
  // 靠这一步才能落到「病假」上，所以两个字的别名也要参与。
  for (const item of flatAliases) if (item.alias.length >= 2 && label.includes(item.alias)) return item.key
  return null
}

/** 单元格 → 分。空白（含「-」「无」）返回 undefined 视作 0；解析不出或负数返回 null 表示该行有问题。 */
function cellToCents(value: unknown): number | undefined | null {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
  const text = String(value).trim()
  if (!text || ['-', '—', '–', '/', '无'].includes(text)) return undefined
  const cleaned = text.replace(/[¥￥,\s\u3000]/g, '').replace(/\(元\)$|元$/, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const cents = Math.round(Number(cleaned) * 100)
  return cents >= 0 && Number.isSafeInteger(cents) ? cents : null
}

/** 只取当前行的列名（找表头行用，不把下一行拼进来）。 */
function labelsOfRow(matrix: unknown[][], row: number) {
  return (matrix[row] ?? []).map(value => normalizeLabel(value))
}

/**
 * 表头可能是两行：「补贴」跨三列、下一行才是「交通补贴 / 午餐补贴 / 加班补贴」。
 * 所以列名要把相邻两行拼起来判；下一行明显是数据（纯数字）时不拼。
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

function planColumns(matrix: unknown[][]): ColumnPlan {
  let headerRow = -1
  let bestScore = 0
  for (let row = 0; row < Math.min(matrix.length, 6); row++) {
    const score = labelsOfRow(matrix, row).filter(label => matchComponentKey(label)).length
    if (score > bestScore) { bestScore = score; headerRow = row }
  }
  if (headerRow < 0 || bestScore < 2) throw new Error('没识别到工资列，请对照「下载模板」检查表头')

  const labels = mergedLabels(matrix, headerRow)
  const name = labels.findIndex(label => matchByAliases(label, nameAliases))
  const employeeNo = labels.findIndex(label => matchByAliases(label, employeeNoAliases))
  if (name < 0) throw new Error('没找到「姓名」列，请对照「下载模板」检查表头')

  const components: ColumnPlan['components'] = []
  const summaries: ColumnPlan['summaries'] = []
  labels.forEach((label, column) => {
    if (column === name || column === employeeNo) return
    const summary = summaryAliases.find(item => matchByAliases(label, item.aliases))
    if (summary) { summaries.push({ column, kind: summary.kind }); return }
    const key = matchComponentKey(label)
    if (key) components.push({ column, key })
  })
  if (components.length < 3) throw new Error('识别到的工资项太少，请对照「下载模板」检查表头')
  return { headerRow, name, employeeNo, components, summaries }
}

const rosterByName = computed(() => {
  const map = new Map<string, PayrollStatementRow[]>()
  for (const row of props.rows) {
    const key = normalizeText(row.name || '')
    if (!key) continue
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return map
})

const rosterByNo = computed(() => {
  const map = new Map<string, PayrollStatementRow>()
  for (const row of props.rows) {
    const key = normalizeText(row.employeeNo || '')
    if (key && !map.has(key)) map.set(key, row)
  }
  return map
})

/** 已有工资条的落点：已发布过的要提醒重新发布，草稿则直接覆盖。 */
function statusOf(row: PayrollStatementRow): RowStatus {
  if (row.statementStatus === 'published' || row.publishedTotals) return 'overwrite-published'
  if (row.statementStatus === 'draft') return 'overwrite-draft'
  return 'new'
}

/** 16 项全 0 的工资明细：文件里没写的列按 0 计。 */
function blankComponents(): PayrollComponents {
  const value = {} as PayrollComponents
  for (const [key] of payrollComponentFields) value[key] = 0
  return value
}

function buildPreview(matrix: unknown[][], plan: ColumnPlan): PreviewRow[] {
  const rows: PreviewRow[] = []
  for (let index = plan.headerRow + 1; index < matrix.length; index++) {
    const raw = matrix[index] ?? []
    const rawName = String(raw[plan.name] ?? '').trim()
    const rawEmployeeNo = plan.employeeNo >= 0 ? String(raw[plan.employeeNo] ?? '').trim() : ''
    const hasMoney = plan.components.some(({ column }) => String(raw[column] ?? '').trim() !== '')
    // 两级表头的第二行（「交通补贴 / 午餐补贴 / …」）既没姓名、金额列也全是文字，要跳过
    const isHeaderTail = rawName === '' && plan.components.every(({ column }) => {
      const value = raw[column]
      return value === null || value === undefined || String(value).trim() === '' || typeof value === 'string'
    })
    if (!rawName && (isHeaderTail || !hasMoney)) continue // 空行或两级表头的第二行

    const line = index + 1
    const components = blankComponents()
    const invalidFields: string[] = []
    for (const { column, key } of plan.components) {
      const cents = cellToCents(raw[column])
      if (cents === null) invalidFields.push(`${payrollComponentFields.find(([item]) => item === key)?.[1] ?? key}不是有效金额（不能为负）`)
      else if (cents !== undefined) components[key] = cents
    }

    if (!rawName) {
      rows.push({ line, rawName, rawEmployeeNo, matched: null, status: 'invalid', note: '这一行没有姓名', warnings: [], warningDetail: '', components, netPayCents: 0 })
      continue
    }

    let matched: PayrollStatementRow | null = null
    let note = ''
    if (rawEmployeeNo) {
      matched = rosterByNo.value.get(normalizeText(rawEmployeeNo)) ?? null
      if (!matched) note = `工号 ${rawEmployeeNo} 在员工名单里找不到`
    }
    else {
      const candidates = rosterByName.value.get(normalizeText(rawName)) ?? []
      if (candidates.length === 1) matched = candidates[0]
      else if (!candidates.length) note = '员工名单里没有这个姓名'
      else note = `有 ${candidates.length} 个同名员工（${candidates.map(item => item.employeeNo || '无工号').join('、')}），请在文件里加「工号」列`
    }

    let status: RowStatus
    if (invalidFields.length) status = 'invalid'
    else if (!matched) status = note.startsWith('有 ') ? 'ambiguous' : 'missing'
    else status = statusOf(matched)

    // 文件里的汇总列按「录入项 + 系统口径」核对，对不上只提示、不阻断；明细放 title，避免把表格撑开
    const warnings: string[] = []
    let warningDetail = ''
    const mismatched: string[] = []
    for (const { column, kind } of plan.summaries) {
      const fileCents = cellToCents(raw[column])
      if (fileCents === undefined || fileCents === null) continue
      const expected = summaryValue(components, kind)
      if (expected === fileCents) continue
      const label = summaryAliases.find(item => item.kind === kind)?.aliases[0] ?? '汇总列'
      mismatched.push(`${label}：文件 ${formatCents(fileCents)}，按录入项应为 ${formatCents(expected)}`)
    }
    if (mismatched.length) {
      warnings.push('文件里的汇总列与录入项不一致，导入后以系统口径为准')
      warningDetail = mismatched.join('；')
    }

    rows.push({ line, rawName, rawEmployeeNo, matched, status, note: [note, ...invalidFields].filter(Boolean).join('；'), warnings, warningDetail, components, netPayCents: computePayrollTotals(components).netPayCents })
  }
  markDuplicates(rows)
  return rows
}

/**
 * 文件里同一个人出现两行时后端会整批拒绝，所以在预览阶段就把多余的行标出来。
 * 保留第一次出现的那行（通常是原始行），后面的标为重复、不导入。
 */
function markDuplicates(rows: PreviewRow[]) {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.matched || !writableStatuses.includes(row.status)) continue
    if (!seen.has(row.matched.employeeId)) { seen.add(row.matched.employeeId); continue }
    row.status = 'invalid'
    row.note = [row.note, '文件里有重复的员工，这一行不会导入'].filter(Boolean).join('；')
  }
}

function summaryValue(components: PayrollComponents, kind: SummaryKind) {
  const totals = computePayrollTotals(components)
  if (kind === 'totalCompensationCents') return totals.totalCompensationCents
  if (kind === 'netPayCents') return totals.netPayCents
  return totals.payableBeforePersonalDeductionsCents
}

const readyRows = computed(() => preview.value.filter(row => row.matched && writableStatuses.includes(row.status)))
const statusCounts = computed(() => ({
  new: preview.value.filter(row => row.status === 'new').length,
  draft: preview.value.filter(row => row.status === 'overwrite-draft').length,
  published: preview.value.filter(row => row.status === 'overwrite-published').length,
  blocked: preview.value.filter(row => !writableStatuses.includes(row.status)).length,
}))

function reset() {
  fileName.value = ''
  preview.value = []
  result.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  parsing.value = true
  result.value = null
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('文件里没有工作表')
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
    preview.value = buildPreview(matrix, planColumns(matrix))
    fileName.value = file.name
    if (!preview.value.length) toast.error('没读到数据行，请确认文件里有工资数据')
  }
  catch (error) {
    preview.value = []
    fileName.value = ''
    toast.error(error instanceof Error ? error.message : '工资文件解析失败')
  }
  finally { parsing.value = false }
}

/**
 * 模板表头与公司现行工资表一致：首行是列名，只有首行有名字的列跨两行纵向合并，
 * 「补贴 / 请假」这类分组在首行横向合并、子列写第二行。汇总列留空不填也行。
 */
function downloadTemplate() {
  const first = ['姓名', '基本工资', '绩效工资', '岗位工资', '工龄工资', '满勤奖', '补贴', '', '', '', '社保公司承担', '公积金公司承担', '工资总额（含社保公积金）', '社保个人承担', '公积金个人承担', '请假', '', '旷工', '合计应发（不含）', '个人所得税扣款', '实发金额']
  const second = ['', '', '', '', '', '', '交通补贴', '午餐补贴', '加班补贴', '福利', '', '', '', '', '病假', '事假', '', '', '', '']
  const sheet = XLSX.utils.aoa_to_sheet([first, second])
  const merges: XLSX.Range[] = []
  // 列名只在首行 → 纵向合并两行
  first.forEach((label, column) => {
    if (label && !second[column]) merges.push({ s: { r: 0, c: column }, e: { r: 1, c: column } })
  })
  // 分组的子列一直排到下一个首行有名字的列 → 首行横向合并
  first.forEach((label, column) => {
    if (!label) return
    let last = column
    while (last + 1 < first.length && !first[last + 1] && second[last + 1]) last++
    if (last > column) merges.push({ s: { r: 0, c: column }, e: { r: 0, c: last } })
  })
  sheet['!merges'] = merges
  sheet['!cols'] = first.map((_, index) => ({ wch: index === 0 ? 14 : 12 }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '工资表')
  XLSX.writeFile(book, `工资导入模板_${props.month}.xlsx`)
}

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '导入工资数据失败')
}

async function submit() {
  if (importing.value) return
  const targets = readyRows.value
  if (!targets.length) return
  importing.value = true
  try {
    const response = await importPayrollDrafts(props.month, targets.map(row => ({ employeeId: row.matched!.employeeId, components: row.components })))
    if (response.ok === false || !response.data) throw new Error(String(response.error || '导入工资数据失败'))
    result.value = response.data
    if (response.data.failed) toast.error(`导入完成：${response.data.succeeded} 行成功，${response.data.failed} 行失败`)
    else toast.success(`已导入 ${response.data.succeeded} 行工资草稿`)
    if (response.data.overwrittenPublished) toast.info(`其中 ${response.data.overwrittenPublished} 人本来已发布过，需要重新发布才会生效`)
    emit('imported')
  }
  catch (error) { showError(error) }
  finally { importing.value = false }
}

watch(open, value => { if (!value) reset() })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>导入工资表 · {{ month }}</DialogTitle>
        <DialogDescription>按姓名匹配员工；导入的是草稿，核对无误后再发布给员工。</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleFile">
          <Button size="sm" :disabled="parsing || importing" @click="fileInput?.click()"><Upload class="mr-1.5 size-4" />{{ parsing ? '解析中…' : '选择文件' }}</Button>
          <Button size="sm" variant="outline" :disabled="importing" @click="downloadTemplate"><Download class="mr-1.5 size-4" />下载模板</Button>
          <span v-if="fileName" class="text-xs text-muted-foreground">已读取 {{ fileName }}</span>
        </div>

        <template v-if="preview.length">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>共 {{ preview.length }} 行</span>
            <span v-if="statusCounts.new">新增草稿 {{ statusCounts.new }}</span>
            <span v-if="statusCounts.draft">覆盖草稿 {{ statusCounts.draft }}</span>
            <span v-if="statusCounts.published" class="text-amber-700 dark:text-amber-400">覆盖已发布 {{ statusCounts.published }}（导入后需重新发布）</span>
            <span v-if="statusCounts.blocked" class="text-destructive">有问题 {{ statusCounts.blocked }} 行，不会导入</span>
          </div>

          <div v-if="isMobile" class="max-h-80 space-y-2 overflow-auto">
            <div v-for="row in preview" :key="row.line" class="rounded-lg border bg-background p-3">
              <div class="flex items-center gap-2">
                <span class="text-xs tabular-nums text-muted-foreground">#{{ row.line }}</span>
                <span class="min-w-0 truncate text-sm">{{ row.rawName || '—' }}</span>
                <span v-if="row.rawEmployeeNo" class="text-xs text-muted-foreground">{{ row.rawEmployeeNo }}</span>
                <span class="flex-1" />
                <Badge variant="outline" :class="row.status === 'overwrite-published' ? 'text-amber-700 dark:text-amber-400' : writableStatuses.includes(row.status) ? '' : 'text-destructive'">{{ statusLabels[row.status] }}</Badge>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-xs">
                <span class="min-w-0 truncate text-muted-foreground">
                  <template v-if="row.matched">{{ row.matched.name }}<span class="ml-1">{{ [row.matched.employeeNo, row.matched.department].filter(Boolean).join(' · ') }}</span></template>
                  <template v-else>未匹配到员工</template>
                </span>
                <span class="shrink-0 tabular-nums">{{ row.matched ? formatCents(row.netPayCents) : '—' }}</span>
              </div>
              <p v-if="row.note || row.warnings.length" class="mt-1 text-xs text-muted-foreground">
                <span v-if="row.note">{{ row.note }}</span>
                <span v-for="warning in row.warnings" :key="warning" :title="row.warningDetail" class="ml-1 text-amber-700 dark:text-amber-400">{{ warning }}</span>
              </p>
            </div>
          </div>
          <div v-else class="max-h-80 overflow-auto rounded-md border bg-background">
            <Table class="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-16">行号</TableHead>
                  <TableHead class="w-32">姓名</TableHead>
                  <TableHead class="w-52">匹配到的员工</TableHead>
                  <TableHead class="w-32">处理方式</TableHead>
                  <TableHead class="w-28 text-right">实发金额</TableHead>
                  <TableHead class="w-72">说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in preview" :key="row.line">
                  <TableCell class="text-xs tabular-nums text-muted-foreground">{{ row.line }}</TableCell>
                  <TableCell class="text-xs">{{ row.rawName || '—' }}<span v-if="row.rawEmployeeNo" class="ml-1 text-muted-foreground">{{ row.rawEmployeeNo }}</span></TableCell>
                  <TableCell class="text-xs">
                    <template v-if="row.matched">{{ row.matched.name }}<span class="ml-1 text-muted-foreground">{{ [row.matched.employeeNo, row.matched.department].filter(Boolean).join(' · ') }}</span></template>
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell><Badge variant="outline" :class="row.status === 'overwrite-published' ? 'text-amber-700 dark:text-amber-400' : writableStatuses.includes(row.status) ? '' : 'text-destructive'">{{ statusLabels[row.status] }}</Badge></TableCell>
                  <TableCell class="text-right text-xs tabular-nums">{{ row.matched ? formatCents(row.netPayCents) : '—' }}</TableCell>
                  <TableCell class="whitespace-normal text-xs text-muted-foreground">
                    <span v-if="row.note">{{ row.note }}</span>
                    <span v-for="warning in row.warnings" :key="warning" :title="row.warningDetail" class="ml-1 text-amber-700 dark:text-amber-400">{{ warning }}</span>
                    <span v-if="!row.note && !row.warnings.length">—</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p class="text-xs text-muted-foreground">预览里的实发金额按录入项由系统算出；文件里的「工资总额」「合计应发」「实发金额」等汇总列不录入，与录入项对不上时会标出来，最终以系统口径为准。带问题的行会跳过，其余行照常导入。</p>
        </template>

        <div v-if="result" class="space-y-1 rounded-md border px-3 py-2 text-xs">
          <div class="font-medium">导入结果：成功 {{ result.succeeded }} 行，失败 {{ result.failed }} 行<span v-if="result.overwrittenPublished" class="ml-1 font-normal text-amber-700 dark:text-amber-400">（{{ result.overwrittenPublished }} 人需要重新发布）</span></div>
          <ul v-if="result.results.some(item => item.status === 'failed')" class="list-disc pl-4 text-muted-foreground">
            <li v-for="item in result.results.filter(row => row.status === 'failed')" :key="item.employeeId">{{ item.name || item.employeeId }}：{{ item.error }}</li>
          </ul>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="importing" @click="open = false">关闭</Button>
        <Button :disabled="!readyRows.length || importing" @click="submit">{{ importing ? '导入中…' : `导入 ${readyRows.length} 行` }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
