<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Pencil, RefreshCw, Settings2, SlidersHorizontal, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getPayrollContributionScheme, getPayrollStandards, savePayrollContributionScheme, savePayrollStandard, type PayrollContributionScheme, type PayrollStandard, type PayrollStandardInput, type PayrollStandardRow } from '@/services/api/payroll.api'
import { DEFAULT_CONTRIBUTION_SCHEME, centsToYuanInput, computeStandardContributions, contributionSchemeTotals, formatCents, parsePercentInput, parseYuanToCents, rateToPercentInput } from '@/utils/payroll'

const props = defineProps<{ canEdit: boolean }>()

type StandardKey = keyof PayrollStandardInput
/** 输入框可能被 <input type="number"> 转成数字，所以草稿允许 string | number。 */
type Draft = Record<StandardKey, string | number>

const moneyFields: ReadonlyArray<readonly [StandardKey, string]> = [
  ['basicPayCents', '基本工资'],
  ['positionPayCents', '岗位工资'],
  ['seniorityPayCents', '工龄工资'],
  ['attendanceBonusCents', '满勤奖'],
]
/** 社保与公积金的费率都改由「五险一金方案」统一决定，员工这里只填各自的缴费基数。 */
const socialFields: ReadonlyArray<readonly [StandardKey, string]> = [
  ['companySocialInsuranceBaseCents', '公司基数'],
  ['personalSocialInsuranceBaseCents', '个人基数'],
]
const fundFields: ReadonlyArray<readonly [StandardKey, string]> = [
  ['companyHousingFundBaseCents', '公司基数'],
  ['personalHousingFundBaseCents', '个人基数'],
]
const allFields = [...moneyFields, ...socialFields, ...fundFields]

/** 五险的展示顺序；工伤、生育个人不缴。 */
const socialInsuranceItems = [
  { key: 'pension', label: '养老保险', employerKey: 'pensionEmployerPercent', employeeKey: 'pensionEmployeePercent' },
  { key: 'medical', label: '医疗保险', employerKey: 'medicalEmployerPercent', employeeKey: 'medicalEmployeePercent' },
  { key: 'unemployment', label: '失业保险', employerKey: 'unemploymentEmployerPercent', employeeKey: 'unemploymentEmployeePercent' },
  { key: 'injury', label: '工伤保险', employerKey: 'injuryEmployerPercent', employeeKey: null },
  { key: 'maternity', label: '生育保险', employerKey: 'maternityEmployerPercent', employeeKey: null },
] as const
type SchemeKey = keyof PayrollContributionScheme
const schemePercentKeys: SchemeKey[] = [
  ...socialInsuranceItems.flatMap(item => (item.employeeKey ? [item.employerKey, item.employeeKey] : [item.employerKey])),
  'housingFundEmployerPercent', 'housingFundEmployeePercent',
] as SchemeKey[]

const rows = ref<PayrollStandardRow[]>([])
const loading = ref(false)
const loadError = ref(false)
const editingId = ref('')
const savingId = ref('')
const drafts = ref<Record<string, Draft>>({})

/** 五险一金方案：全公司统一，改动会影响所有未录入月份的社保与公积金金额。 */
const schemeOpen = ref(false)
const scheme = ref<PayrollContributionScheme>({ ...DEFAULT_CONTRIBUTION_SCHEME })
const schemeDraft = ref<Record<SchemeKey, string>>(schemeToDraft({ ...DEFAULT_CONTRIBUTION_SCHEME }))
const schemeEditing = ref(false)
const schemeSaving = ref(false)
const schemeLoadError = ref(false)
const schemeTotals = computed(() => contributionSchemeTotals(scheme.value))
/** 编辑态按草稿实时算合计，让「改成多少」在保存前就看得见；未编辑时与已保存方案一致。 */
const schemeDisplayTotals = computed(() => {
  if (!schemeEditing.value) return schemeTotals.value
  const draft = {} as PayrollContributionScheme
  for (const key of schemePercentKeys) draft[key] = parsePercentInput(schemeDraft.value[key]) ?? 0
  draft.medicalEmployeeFlatCents = parseYuanToCents(schemeDraft.value.medicalEmployeeFlatCents) ?? 0
  return contributionSchemeTotals(draft)
})

const configuredCount = computed(() => rows.value.filter(row => row.standard).length)

/** 批量设置：勾选员工后统一填写若干项，留空的项保持各员工原值不变。 */
const selected = ref(new Set<string>())
const batchOpen = ref(false)
const batchDraft = ref<Record<StandardKey, string>>(blankBatchDraft())
const batchSaving = ref(false)
const batchProgress = ref({ done: 0, total: 0 })
const batchFailures = ref<string[]>([])
const hasUnsavedChanges = computed(() => rows.value.some(isDirty)
  || (schemeEditing.value && Object.entries(schemeToDraft(scheme.value)).some(([key, value]) => String(schemeDraft.value[key as SchemeKey]) !== value))
  || (batchOpen.value && allFields.some(([key]) => batchDraft.value[key] !== '')))
const refreshDisabled = computed(() => loading.value || !!savingId.value || schemeSaving.value || batchSaving.value || hasUnsavedChanges.value)

const selectedRows = computed(() => rows.value.filter(row => selected.value.has(row.employeeId)))
const allSelected = computed(() => rows.value.length > 0 && selected.value.size === rows.value.length)
const unsetCount = computed(() => rows.value.filter(row => !row.standard).length)

function zeroStandard(): PayrollStandardInput {
  return Object.fromEntries(allFields.map(([key]) => [key, 0])) as PayrollStandardInput
}

/** 五险一金方案的可编辑草稿：比例按百分比文本、固定额按元文本。 */
function schemeToDraft(value: PayrollContributionScheme): Record<SchemeKey, string> {
  return {
    pensionEmployerPercent: rateToPercentInput(value.pensionEmployerPercent),
    pensionEmployeePercent: rateToPercentInput(value.pensionEmployeePercent),
    medicalEmployerPercent: rateToPercentInput(value.medicalEmployerPercent),
    medicalEmployeePercent: rateToPercentInput(value.medicalEmployeePercent),
    medicalEmployeeFlatCents: centsToYuanInput(value.medicalEmployeeFlatCents),
    unemploymentEmployerPercent: rateToPercentInput(value.unemploymentEmployerPercent),
    unemploymentEmployeePercent: rateToPercentInput(value.unemploymentEmployeePercent),
    injuryEmployerPercent: rateToPercentInput(value.injuryEmployerPercent),
    maternityEmployerPercent: rateToPercentInput(value.maternityEmployerPercent),
    housingFundEmployerPercent: rateToPercentInput(value.housingFundEmployerPercent),
    housingFundEmployeePercent: rateToPercentInput(value.housingFundEmployeePercent),
  }
}

function makeDraft(standard: PayrollStandard | null): Draft {
  const values = standard ?? zeroStandard()
  return Object.fromEntries(allFields.map(([key]) => [key, centsToYuanInput(values[key])])) as Draft
}

/** 编辑态里实时预览社保与公积金金额，用的就是保存时的同一套口径（都按当前方案）。 */
function draftContributions(draft: Draft): PayrollStandard['contributions'] {
  const numbers = Object.fromEntries(allFields.map(([key]) => {
    const raw = draft[key] ?? ''
    return [key, parseYuanToCents(raw) ?? 0]
  })) as PayrollStandardInput
  return computeStandardContributions(numbers, scheme.value)
}

function contributionsOf(row: PayrollStandardRow): PayrollStandard['contributions'] {
  const standard = row.standard
  // 只读态的金额由服务端按真实方案算好，这里只在字段缺失时兜底
  if (!standard) return computeStandardContributions(zeroStandard(), scheme.value)
  return standard.contributions ?? computeStandardContributions(standard, scheme.value)
}

function isDirty(row: PayrollStandardRow) {
  const draft = drafts.value[row.employeeId]
  if (!draft) return false
  const current = makeDraft(row.standard)
  return allFields.some(([key]) => String(draft[key] ?? '') !== String(current[key] ?? ''))
}

function startSchemeEdit() {
  if (!props.canEdit || loading.value || savingId.value || schemeSaving.value || batchSaving.value || batchOpen.value) return
  if (editingId.value) { toast.error('请先保存当前修改'); return }
  schemeDraft.value = schemeToDraft(scheme.value)
  schemeEditing.value = true
}

function cancelSchemeEdit() {
  schemeDraft.value = schemeToDraft(scheme.value)
  schemeEditing.value = false
}

async function confirmSchemeEdit() {
  if (schemeSaving.value) return
  const next = {} as PayrollContributionScheme
  for (const key of schemePercentKeys) {
    const parsed = parsePercentInput(schemeDraft.value[key])
    if (parsed === null) { toast.error('五险一金比例请输入 0 至 100、最多两位小数的数值'); return }
    next[key] = parsed
  }
  const flat = parseYuanToCents(schemeDraft.value.medicalEmployeeFlatCents)
  if (flat === null) { toast.error('大额医疗固定额请输入有效金额，最多两位小数'); return }
  next.medicalEmployeeFlatCents = flat

  schemeSaving.value = true
  try {
    const response = await savePayrollContributionScheme(next)
    if (response.ok === false) throw new Error(String(response.error || '保存五险一金方案失败'))
    scheme.value = response.data?.scheme ?? next
    schemeDraft.value = schemeToDraft(scheme.value)
    schemeEditing.value = false
    toast.success('五险一金方案已保存')
    // 未录入月份的社保金额要按新方案重算，重新拉一遍标准
    await load()
  }
  catch (error) {
    const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
    toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '保存五险一金方案失败')
  }
  finally { schemeSaving.value = false }
}

async function load() {
  if (loading.value) return
  if (hasUnsavedChanges.value) { toast.error('请先保存或取消当前修改'); return }
  loading.value = true
  loadError.value = false
  schemeLoadError.value = false
  try {
    const [standardsResponse, schemeResponse] = await Promise.all([getPayrollStandards(), getPayrollContributionScheme()])
    if (standardsResponse.ok === false) throw new Error(String(standardsResponse.error || '读取薪资标准失败'))
    // 请求期间仍可能在已打开的编辑框中输入，响应也不能覆盖这些修改。
    if (hasUnsavedChanges.value) { toast.error('请先保存或取消当前修改'); return }
    rows.value = standardsResponse.data?.rows ?? []
    editingId.value = ''
    drafts.value = {}
    // 方案读不到不影响员工标准的展示（只读金额由服务端按真实方案算好），只在方案抽屉里给重试
    if (schemeResponse.ok === false) schemeLoadError.value = true
    else if (schemeResponse.data?.scheme) {
      scheme.value = schemeResponse.data.scheme
      schemeDraft.value = schemeToDraft(schemeResponse.data.scheme)
    }
  }
  catch (error) {
    loadError.value = true
    const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
    toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '读取薪资标准失败')
  }
  finally { loading.value = false }
}

function startEdit(row: PayrollStandardRow) {
  if (!props.canEdit || loading.value || savingId.value || schemeSaving.value || batchSaving.value || batchOpen.value) return
  if (schemeEditing.value) { toast.error('请先保存或取消五险一金方案修改'); return }
  if (editingId.value && editingId.value !== row.employeeId && isDirty(rows.value.find(item => item.employeeId === editingId.value) ?? row)) {
    toast.error('请先保存当前修改')
    return
  }
  editingId.value = row.employeeId
  drafts.value = { ...drafts.value, [row.employeeId]: makeDraft(row.standard) }
}

function cancelEdit(row: PayrollStandardRow) {
  const next = { ...drafts.value }
  delete next[row.employeeId]
  drafts.value = next
  editingId.value = ''
}

async function confirmEdit(row: PayrollStandardRow) {
  const draft = drafts.value[row.employeeId]
  if (!draft || savingId.value) return
  if (!isDirty(row)) { cancelEdit(row); return }

  const standard = {} as PayrollStandardInput
  for (const [key, label] of allFields) {
    const raw = draft[key] ?? ''
    const value = parseYuanToCents(raw)
    if (value === null) {
      toast.error(`${label}请输入有效金额，最多两位小数`)
      return
    }
    standard[key] = value
  }

  savingId.value = row.employeeId
  try {
    const response = await savePayrollStandard(row.employeeId, standard, row.standard?.version ?? 0)
    if (response.ok === false) throw new Error(String(response.error || '保存薪资标准失败'))
    toast.success(`${row.displayName || row.name} 的薪资标准已保存`)
    cancelEdit(row)
    await load()
  }
  catch (error) {
    const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
    toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '保存薪资标准失败')
  }
  finally { savingId.value = '' }
}

function blankBatchDraft(): Record<StandardKey, string> {
  return Object.fromEntries(allFields.map(([key]) => [key, ''])) as Record<StandardKey, string>
}

function toggleRow(employeeId: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(employeeId)
  else next.delete(employeeId)
  selected.value = next
}

function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(rows.value.map(row => row.employeeId)) : new Set()
}

function clearSelection() { selected.value = new Set() }

/** 常见的批量场景是先给还没设过标准的人建立一份基础标准。 */
function selectUnset() {
  selected.value = new Set(rows.value.filter(row => !row.standard).map(row => row.employeeId))
}

function openBatch() {
  if (!props.canEdit || loading.value || savingId.value || schemeSaving.value || batchSaving.value) return
  if (schemeEditing.value) { toast.error('请先保存或取消五险一金方案修改'); return }
  if (editingId.value) { toast.error('请先保存当前修改'); return }
  if (!selectedRows.value.length) { toast.error('请先勾选要批量设置的员工'); return }
  batchDraft.value = blankBatchDraft()
  batchFailures.value = []
  batchOpen.value = true
}

/** 留空的项不改：用每位员工原有标准补齐，未设置的员工按 0 建立。 */
function mergedStandard(row: PayrollStandardRow, patch: Partial<Record<StandardKey, number>>) {
  const base = row.standard ?? zeroStandard()
  return Object.fromEntries(allFields.map(([key]) => [key, patch[key] ?? base[key] ?? 0])) as PayrollStandardInput
}

async function applyBatch() {
  if (batchSaving.value) return
  const targets = selectedRows.value
  const patch: Partial<Record<StandardKey, number>> = {}
  for (const [key, label] of allFields) {
    const raw = batchDraft.value[key]
    if (raw === '' || raw === null || raw === undefined) continue
    const value = parseYuanToCents(raw)
    if (value === null) {
      toast.error(`${label}请输入有效金额，最多两位小数`)
      return
    }
    patch[key] = value
  }
  if (!Object.keys(patch).length) { toast.error('请至少填写一项要批量设置的内容'); return }

  batchSaving.value = true
  batchProgress.value = { done: 0, total: targets.length }
  const failures: string[] = []
  try {
    // 串行保存：沿用单人接口的乐观锁，逐人报错比并发更容易看清是哪个人失败
    for (const [index, row] of targets.entries()) {
      batchProgress.value = { done: index, total: targets.length }
      try {
        const response = await savePayrollStandard(row.employeeId, mergedStandard(row, patch), row.standard?.version ?? 0)
        if (response.ok === false) throw new Error(String(response.error || '保存薪资标准失败'))
      }
      catch (error) {
        const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
        failures.push(`${row.displayName || row.name}：${value?.response?.data?.message || value?.response?.data?.error || value?.message || '保存失败'}`)
      }
      batchProgress.value = { done: index + 1, total: targets.length }
    }
  }
  finally {
    batchSaving.value = false
    batchOpen.value = false
    batchFailures.value = failures
    if (failures.length) toast.error(`批量设置完成：成功 ${targets.length - failures.length} 人，失败 ${failures.length} 人`)
    else toast.success(`已批量设置 ${targets.length} 人`)
    clearSelection()
    await load()
  }
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <Drawer v-model:open="schemeOpen" direction="left" :should-scale-background="false">
  <section class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold">薪资标准设置</h1>
        <p class="mt-1 text-xs text-muted-foreground">固定工资项与缴费基数；社保与公积金的费率由「五险一金方案」统一维护，录入工资条时会自动带出这些值。已设置 {{ configuredCount }} / {{ rows.length }} 人。</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="canEdit">
          <!-- 禁用原因直接写在按钮旁（原先只在 title 悬浮提示里，屏幕上没有任何说明） -->
          <span v-if="editingId" class="text-xs text-muted-foreground">请先保存当前修改</span>
          <span v-else-if="selectedRows.length" class="text-xs text-muted-foreground">已选 {{ selectedRows.length }} 人</span>
          <span v-else class="text-xs text-muted-foreground">请先勾选员工</span>
          <Button v-if="selectedRows.length" size="sm" variant="ghost" :disabled="batchSaving" @click="clearSelection">清除选择</Button>
          <Button v-else-if="unsetCount" size="sm" variant="ghost" :disabled="loading || batchSaving" @click="selectUnset">选择未设置的 {{ unsetCount }} 人</Button>
          <Button size="sm" :disabled="!selectedRows.length || loading || batchSaving || !!editingId" @click="openBatch"><SlidersHorizontal class="mr-1.5 size-4" />批量设置</Button>
        </template>
        <DrawerTrigger as-child>
          <Button size="sm" variant="outline" :disabled="loading"><Settings2 class="mr-1.5 size-4" />五险一金方案</Button>
        </DrawerTrigger>
        <Button size="sm" variant="outline" :disabled="refreshDisabled" :title="hasUnsavedChanges ? '请先保存或取消当前修改' : undefined" @click="load"><RefreshCw class="mr-1.5 size-4" />刷新</Button>
      </div>
    </div>

    <!-- 五险一金方案：全公司统一，员工只填各自的缴费基数 -->
    <!-- 宽度要用与组件同名修饰符覆盖，否则会被 DrawerContent 自带的 sm:max-w-sm 压住 -->
    <DrawerContent class="overflow-y-auto data-[vaul-drawer-direction=left]:sm:max-w-xl">
      <DrawerHeader>
        <DrawerTitle>五险一金方案</DrawerTitle>
        <DrawerDescription>全公司统一：单位社保 = 公司基数 × 五险单位合计，个人社保 = 个人基数 × 五险个人合计 + 大额医疗固定额；公积金按下面的比例计算。</DrawerDescription>
      </DrawerHeader>
      <div class="flex flex-wrap items-center justify-between gap-2 px-4">
        <span class="text-xs text-muted-foreground">改动会影响所有未录入月份的社保与公积金金额</span>
        <div v-if="canEdit" class="flex items-center gap-1">
          <template v-if="schemeEditing">
            <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="schemeSaving" aria-label="取消编辑五险一金方案" @click="cancelSchemeEdit"><X class="size-4" /></Button>
            <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="schemeSaving" aria-label="保存五险一金方案" @click="confirmSchemeEdit"><Check class="size-4" /></Button>
          </template>
          <Button
            v-else
            size="sm"
            variant="ghost"
            class="h-8 w-7 px-0"
            :disabled="schemeSaving || loading || !!editingId"
            :title="editingId ? '请先保存当前修改' : '编辑五险一金方案'"
            aria-label="编辑五险一金方案"
            @click="startSchemeEdit"
          >
            <Pencil class="size-4" />
          </Button>
        </div>
      </div>

      <div v-if="schemeLoadError" class="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
        <span class="text-destructive">五险一金方案读取失败；员工只读金额仍按服务端口径显示，编辑态预览可能不准。</span>
        <Button size="sm" variant="outline" :disabled="refreshDisabled" @click="load">重试</Button>
      </div>

      <div v-else class="mx-4 mt-3 rounded-md border">
        <Table class="text-xs [&_td:last-child]:pr-3 [&_th:last-child]:pr-3">
          <TableHeader>
            <TableRow>
              <TableHead class="pl-3">项目</TableHead>
              <TableHead class="text-right">单位</TableHead>
              <TableHead class="text-right">个人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <!-- 社保：五险与个人固定额为子级 -->
            <TableRow class="hover:bg-transparent">
              <TableCell colspan="3" class="bg-muted/50 pl-3 font-medium">社保</TableCell>
            </TableRow>
            <TableRow v-for="item in socialInsuranceItems" :key="item.key">
              <TableCell class="pl-6">{{ item.label }}</TableCell>
              <TableCell class="text-right tabular-nums">
                <Input
                  v-if="schemeEditing"
                  v-model="schemeDraft[item.employerKey]"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  class="ml-auto h-7 w-24 text-right tabular-nums"
                  :aria-label="`${item.label}单位比例（%）`"
                />
                <span v-else>{{ scheme[item.employerKey] }}%</span>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <template v-if="item.employeeKey">
                  <Input
                    v-if="schemeEditing"
                    v-model="schemeDraft[item.employeeKey]"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    class="ml-auto h-7 w-24 text-right tabular-nums"
                    :aria-label="`${item.label}个人比例（%）`"
                  />
                  <span v-else>{{ scheme[item.employeeKey] }}%</span>
                </template>
                <span v-else class="text-muted-foreground">不缴</span>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell class="pl-6">大额医疗（个人固定额）</TableCell>
              <TableCell class="text-right text-muted-foreground">—</TableCell>
              <TableCell class="text-right tabular-nums">
                <Input
                  v-if="schemeEditing"
                  v-model="schemeDraft.medicalEmployeeFlatCents"
                  type="number"
                  min="0"
                  step="0.01"
                  class="ml-auto h-7 w-24 text-right tabular-nums"
                  aria-label="个人大额医疗固定额（元）"
                />
                <span v-else>{{ formatCents(scheme.medicalEmployeeFlatCents) }}</span>
              </TableCell>
            </TableRow>
            <TableRow class="border-t font-medium">
              <TableCell class="pl-6 text-muted-foreground">五险小计</TableCell>
              <TableCell class="text-right tabular-nums">{{ schemeDisplayTotals.employerRatePercent }}%</TableCell>
              <TableCell class="text-right tabular-nums">
                {{ schemeDisplayTotals.employeeRatePercent }}%<span class="font-normal text-muted-foreground"> + {{ formatCents(schemeDisplayTotals.employeeFlatCents) }}</span>
              </TableCell>
            </TableRow>

            <!-- 公积金 -->
            <TableRow class="hover:bg-transparent">
              <TableCell colspan="3" class="bg-muted/50 pl-3 font-medium">公积金</TableCell>
            </TableRow>
            <TableRow>
              <TableCell class="pl-6">住房公积金</TableCell>
              <TableCell class="text-right tabular-nums">
                <Input
                  v-if="schemeEditing"
                  v-model="schemeDraft.housingFundEmployerPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  class="ml-auto h-7 w-24 text-right tabular-nums"
                  aria-label="住房公积金单位比例（%）"
                />
                <span v-else>{{ scheme.housingFundEmployerPercent }}%</span>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <Input
                  v-if="schemeEditing"
                  v-model="schemeDraft.housingFundEmployeePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  class="ml-auto h-7 w-24 text-right tabular-nums"
                  aria-label="住房公积金个人比例（%）"
                />
                <span v-else>{{ scheme.housingFundEmployeePercent }}%</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <DrawerFooter>
        <DrawerClose as-child><Button variant="outline">关闭</Button></DrawerClose>
      </DrawerFooter>
    </DrawerContent>

    <div v-if="batchFailures.length" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
      <div class="font-medium text-destructive">以下员工未能保存，请刷新后重试（共 {{ batchFailures.length }} 人）：</div>
      <ul class="mt-1 list-disc pl-4 text-muted-foreground"><li v-for="item in batchFailures" :key="item">{{ item }}</li></ul>
    </div>

    <div v-if="loadError && !loading" class="rounded-md border py-10 text-center"><p class="text-sm text-destructive">薪资标准读取失败，请稍后重试。</p><Button class="mt-3" size="sm" variant="outline" @click="load">重试</Button></div>

    <div v-else class="overflow-x-auto rounded-md border bg-background">
      <Table class="min-w-[1100px]">
        <TableHeader>
          <TableRow>
            <TableHead class="sticky left-0 z-10 w-52 bg-muted">
              <div class="flex items-center gap-2">
                <Checkbox v-if="canEdit" :model-value="allSelected" :disabled="loading || !rows.length || batchSaving" :aria-label="allSelected ? '取消全选员工' : '全选员工'" @update:model-value="checked => toggleAll(checked === true)" />
                <span>员工</span>
              </div>
            </TableHead>
            <TableHead class="w-56">固定工资项</TableHead>
            <TableHead class="w-64">社保（公司 / 个人）</TableHead>
            <TableHead class="w-64">公积金（公司 / 个人）</TableHead>
            <TableHead v-if="canEdit" class="w-24 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading"><TableCell :colspan="canEdit ? 5 : 4" class="h-20 text-center text-muted-foreground">加载中…</TableCell></TableRow>
          <TableRow v-else-if="!rows.length"><TableCell :colspan="canEdit ? 5 : 4" class="h-20 text-center text-muted-foreground">暂无可设置薪资标准的员工</TableCell></TableRow>
          <template v-else>
          <TableRow v-for="row in rows" :key="row.employeeId" :class="!row.standard && editingId !== row.employeeId ? 'text-muted-foreground' : ''">
            <TableCell class="sticky left-0 z-[1] bg-background align-top">
              <div class="flex items-start gap-2">
                <Checkbox v-if="canEdit" class="mt-0.5" :model-value="selected.has(row.employeeId)" :disabled="batchSaving" :aria-label="`选择${row.name}`" @update:model-value="checked => toggleRow(row.employeeId, checked === true)" />
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">{{ row.name }}</span>
                    <Badge v-if="!row.standard" variant="outline">未设置</Badge>
                  </div>
                  <div class="mt-0.5 text-xs text-muted-foreground">{{ [row.employeeNo, row.phone, row.department].filter(Boolean).join(' · ') || '—' }}</div>
                </div>
              </div>
            </TableCell>

            <!-- 编辑态：直接改输入框；只读态：紧凑列出已保存的值 -->
            <template v-if="editingId === row.employeeId">
              <TableCell class="align-top">
                <div class="space-y-1.5">
                  <label v-for="[key, label] in moneyFields" :key="key" class="flex items-center gap-3 text-xs">
                    <span class="w-12 shrink-0 text-muted-foreground">{{ label }}</span>
                    <Input v-model="drafts[row.employeeId][key]" type="number" min="0" step="0.01" class="h-7 w-28 text-right tabular-nums" :aria-label="`${row.name} ${label}（元）`" />
                  </label>
                </div>
              </TableCell>
              <TableCell class="align-top">
                <div class="space-y-1.5">
                  <label v-for="[key, label] in socialFields" :key="key" class="flex items-center justify-between gap-2 text-xs">
                    <span class="text-muted-foreground">{{ label }}</span>
                    <Input v-model="drafts[row.employeeId][key]" type="number" min="0" step="0.01" class="h-7 w-28 text-right tabular-nums" :aria-label="`${row.name} 社保${label}`" />
                  </label>
                  <div class="space-y-0.5 border-t pt-1 text-xs text-muted-foreground">
                    <div class="flex items-center justify-between gap-2">
                      <span>单位 {{ schemeDisplayTotals.employerRatePercent }}%</span>
                      <span class="tabular-nums">{{ formatCents(draftContributions(drafts[row.employeeId]).employerSocialInsuranceCents) }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span>个人 {{ schemeDisplayTotals.employeeRatePercent }}%＋{{ formatCents(schemeDisplayTotals.employeeFlatCents) }}</span>
                      <span class="tabular-nums">{{ formatCents(draftContributions(drafts[row.employeeId]).employeeSocialInsuranceCents) }}</span>
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell class="align-top">
                <div class="space-y-1.5">
                  <label v-for="[key, label] in fundFields" :key="key" class="flex items-center justify-between gap-2 text-xs">
                    <span class="text-muted-foreground">{{ label }}</span>
                    <Input v-model="drafts[row.employeeId][key]" type="number" min="0" step="0.01" class="h-7 w-28 text-right tabular-nums" :aria-label="`${row.name} 公积金${label}`" />
                  </label>
                  <div class="flex items-center justify-between gap-2 border-t pt-1 text-xs">
                    <span class="text-muted-foreground">算出金额</span>
                    <span class="tabular-nums">公司 {{ formatCents(draftContributions(drafts[row.employeeId]).employerHousingFundCents) }} / 个人 {{ formatCents(draftContributions(drafts[row.employeeId]).employeeHousingFundCents) }}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell v-if="canEdit" class="align-top text-right">
                <div class="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingId === row.employeeId" :aria-label="`取消编辑${row.name}的薪资标准`" @click="cancelEdit(row)"><X class="size-4" /></Button>
                  <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :disabled="savingId === row.employeeId" :aria-label="`保存${row.name}的薪资标准`" @click="confirmEdit(row)"><Check class="size-4" /></Button>
                </div>
              </TableCell>
            </template>

            <template v-else>
              <TableCell class="align-top">
                <div v-if="row.standard" class="space-y-0.5 text-xs">
                  <div v-for="[key, label] in moneyFields" :key="key" class="flex items-center gap-3">
                    <span class="w-12 shrink-0 text-muted-foreground">{{ label }}</span><span class="tabular-nums">{{ formatCents(row.standard[key]) }}</span>
                  </div>
                </div>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </TableCell>
              <TableCell class="align-top">
                <div v-if="row.standard" class="space-y-1 text-xs">
                  <div class="space-y-0.5">
                    <div class="text-muted-foreground">公司</div>
                    <div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">基数 × {{ schemeDisplayTotals.employerRatePercent }}%</span><span class="tabular-nums">{{ formatCents(row.standard.companySocialInsuranceBaseCents) }}</span></div>
                    <div class="flex items-center justify-between gap-3 font-medium"><span class="text-muted-foreground">金额</span><span class="tabular-nums">{{ formatCents(contributionsOf(row).employerSocialInsuranceCents) }}</span></div>
                  </div>
                  <div class="space-y-0.5 border-t pt-1">
                    <div class="text-muted-foreground">个人</div>
                    <div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">基数 × {{ schemeDisplayTotals.employeeRatePercent }}%＋{{ formatCents(schemeDisplayTotals.employeeFlatCents) }}</span><span class="tabular-nums">{{ formatCents(row.standard.personalSocialInsuranceBaseCents) }}</span></div>
                    <div class="flex items-center justify-between gap-3 font-medium"><span class="text-muted-foreground">金额</span><span class="tabular-nums">{{ formatCents(contributionsOf(row).employeeSocialInsuranceCents) }}</span></div>
                  </div>
                </div>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </TableCell>
              <TableCell class="align-top">
                <div v-if="row.standard" class="space-y-1 text-xs">
                  <div class="space-y-0.5">
                    <div class="text-muted-foreground">公司</div>
                    <div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">基数 × {{ schemeDisplayTotals.housingFundEmployerPercent }}%</span><span class="tabular-nums">{{ formatCents(row.standard.companyHousingFundBaseCents) }}</span></div>
                    <div class="flex items-center justify-between gap-3 font-medium"><span class="text-muted-foreground">金额</span><span class="tabular-nums">{{ formatCents(contributionsOf(row).employerHousingFundCents) }}</span></div>
                  </div>
                  <div class="space-y-0.5 border-t pt-1">
                    <div class="text-muted-foreground">个人</div>
                    <div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">基数 × {{ schemeDisplayTotals.housingFundEmployeePercent }}%</span><span class="tabular-nums">{{ formatCents(row.standard.personalHousingFundBaseCents) }}</span></div>
                    <div class="flex items-center justify-between gap-3 font-medium"><span class="text-muted-foreground">金额</span><span class="tabular-nums">{{ formatCents(contributionsOf(row).employeeHousingFundCents) }}</span></div>
                  </div>
                </div>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </TableCell>
              <TableCell v-if="canEdit" class="align-top text-right">
                <Button size="sm" variant="ghost" class="h-8 w-7 px-0" :aria-label="`编辑${row.name}的薪资标准`" @click="startEdit(row)"><Pencil class="size-4" /></Button>
              </TableCell>
            </template>
          </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>
    <p v-if="!canEdit" class="text-xs text-muted-foreground">只有财务人员可以维护薪资标准。</p>

    <Dialog :open="batchOpen" @update:open="value => { if (!value && batchSaving) return; batchOpen = value }">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>批量设置薪资标准 · 已选 {{ selectedRows.length }} 人</DialogTitle>
          <p class="text-xs text-muted-foreground">只填需要统一的项，<span class="font-medium text-foreground">留空的项保持每位员工原有值不变</span>；没有标准的人按 0 建立。社保比例取自上方方案，这里只设基数；公积金按各自基数 × 比例计算。</p>
        </DialogHeader>
        <div class="space-y-4">
          <section class="space-y-2">
            <h2 class="text-xs font-semibold">固定工资项（元）</h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label v-for="[key, label] in moneyFields" :key="key" class="space-y-1 text-xs text-muted-foreground">{{ label }}（元）<Input v-model="batchDraft[key]" type="number" min="0" step="0.01" placeholder="不改" class="h-8 text-right tabular-nums text-foreground" :aria-label="`批量 ${label}（元）`" /></label>
            </div>
          </section>
          <section class="space-y-2">
            <h2 class="text-xs font-semibold">社保</h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label v-for="[key, label] in socialFields" :key="key" class="space-y-1 text-xs text-muted-foreground">{{ label }}（元）<Input v-model="batchDraft[key]" type="number" min="0" step="0.01" placeholder="不改" class="h-8 text-right tabular-nums text-foreground" :aria-label="`批量 社保${label}`" /></label>
            </div>
          </section>
          <section class="space-y-2">
            <h2 class="text-xs font-semibold">公积金</h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label v-for="[key, label] in fundFields" :key="key" class="space-y-1 text-xs text-muted-foreground">{{ label }}（元）<Input v-model="batchDraft[key]" type="number" min="0" step="0.01" placeholder="不改" class="h-8 text-right tabular-nums text-foreground" :aria-label="`批量 公积金${label}`" /></label>
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="batchSaving" @click="batchOpen = false">取消</Button>
          <Button :disabled="batchSaving" @click="applyBatch">{{ batchSaving ? `保存中 ${batchProgress.done}/${batchProgress.total}…` : `应用到所选 ${selectedRows.length} 人` }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
  </Drawer>
</template>
