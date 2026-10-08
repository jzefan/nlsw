<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, ChevronUp, FileEdit, Gift, RotateCcw, Send, SlidersHorizontal, Upload, Wallet } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateTimePicker, MonthPicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import PayslipReceipt from '@/components/payslip-receipt.vue'
import PayslipTable from '@/components/payslip-table.vue'
import PayrollImportDialog from '@/pages/attendance/components/PayrollImportDialog.vue'
import PayrollPublishDialog from '@/pages/attendance/components/PayrollPublishDialog.vue'
import PayrollTaxHint from '@/pages/attendance/components/PayrollTaxHint.vue'
import PayrollWelfareDialog from '@/pages/attendance/components/PayrollWelfareDialog.vue'
import {
  addPayrollPayment,
  getPayrollStatements,
  getPayrollTaxBasis,
  publishPayrollStatement,
  savePayrollDraft,
  withdrawPayrollStatement,
  type PayrollComponents,
  type PayrollLedgerStatus,
  type PayrollStatements,
  type PayrollStatementRow,
  type PayrollTaxBasis,
  type PayrollTotals,
} from '@/services/api/payroll.api'
import { payrollComponentFields } from '@/services/api/attendance.api'
import { useAuthStore } from '@/stores/auth'
import { useDevice } from '@/composables/use-device'
import { leaveLabel } from '@/constants/attendance-labels'
import {
  payrollAttendanceDeductionKeys,
  payrollEmployeeDeductionKeys,
  payrollIncomeKeys,
  payrollTotalsLabels,
  showPayrollPayments,
} from '@/constants/payroll-fields'
import { computeCumulativeIncomeTax, type CumulativeTaxBreakdown } from '@/utils/income-tax'
import {
  centsToYuanInput,
  canEditPayroll,
  canViewCompanyPayroll,
  computeStandardContributions,
  formatBeijingDate,
  formatCents,
  formatMinutes,
  formatPayrollMonthLabel,
  getBeijingMonth,
  parseYuanToCents,
  wallClockToIso,
} from '@/utils/payroll'

const authStore = useAuthStore()
const router = useRouter()
const { isMobile } = useDevice()
type PayrollComponentKey = keyof PayrollComponents
const canEdit = computed(() => canEditPayroll(authStore.user))
/** 财务可编辑；总经理、董事长只读查看全员工资。 */
const canViewCompany = computed(() => canViewCompanyPayroll(authStore.user))
const importOpen = ref(false)
const publishOpen = ref(false)
const welfareOpen = ref(false)
/** 移动端把导入 / 批量发布收进底部抽屉，避免顶栏塞不下。 */
const mobileActionsOpen = ref(false)
const route = useRoute()
/** 工资表、薪资统计、薪资设置已拆成左侧菜单的三个入口；旧地址写成 ?tab= 的在这里转过去，别让老书签落到空页。 */
const legacyTabRoutes: Record<string, string> = {
  statistics: '/attendance/payroll/statistics',
  settings: '/attendance/payroll/settings',
}
const month = ref(getBeijingMonth())
const rows = ref<PayrollStatementRow[]>([])
const totals = ref<PayrollStatements['totals'] | null>(null)
/** 当月考勤台账状态：整月一个口径，用于「考勤」列与发布前置条件。 */
const ledgerStatus = ref<PayrollLedgerStatus>('missing')
const ledgerSettled = computed(() => ledgerStatus.value === 'closed')
/** 未结账时发布工资条属于「强制发布」，按钮与提示文案都跟着这个开关变。 */
const forcePublish = computed(() => !ledgerSettled.value)
/** 当月还没有建台账与「建了但没结账」是两个不同的原因，提示里要分开说。 */
const ledgerMissing = computed(() => ledgerStatus.value === 'missing')
/**
 * 已发布的工资条能不能直接改：未结账月份可以（那时的发布本来就是过渡版本，改完直接出下一版），
 * 结账后必须先「撤回」——撤回会把旧版留在版本记录里，直接覆盖会丢掉这条痕迹。
 */
const canRevisePublished = computed(() => !ledgerSettled.value)
function canEditStatement(row: PayrollStatementRow) {
  return canEdit.value && (row.statementStatus !== 'published' || canRevisePublished.value)
}
const loading = ref(false)
const loadError = ref(false)
/** 待发布人数：存了草稿还没发布的人，用于「批量发布」按钮上的提示。 */
const publishableCount = computed(() => rows.value.filter((row) => row.statementStatus === 'draft').length)
const editingRow = ref<PayrollStatementRow | null>(null)
/** 输入框可能被 <input type="number"> 转成数字，所以草稿允许 string | number。 */
const componentsDraft = ref<Record<PayrollComponentKey, string | number>>(
  {} as Record<PayrollComponentKey, string | number>,
)
const savingDraft = ref(false)
/** 个税「累计预扣预缴」要用的本年度往月累计数据；没取到就不自动算个税，避免填进错的值。 */
const taxBasis = ref<PayrollTaxBasis | null>(null)
const taxBasisState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
/** 财务手工改过个税后不再自动覆盖，点「按规则重算」还原。 */
const taxOverridden = ref(false)
let taxBasisRequestId = 0
const expandedId = ref('')
const actionType = ref<'' | 'publish' | 'withdraw'>('')
const actionRow = ref<PayrollStatementRow | null>(null)
const actionReason = ref('')
const actionBusy = ref(false)
const paymentRow = ref<PayrollStatementRow | null>(null)
const paymentDialogOpen = ref(false)
const paymentBusy = ref(false)
const paymentForm = ref({
  direction: 'payment' as 'payment' | 'refund',
  amountYuan: '',
  paidAt: '',
  proofUrl: '',
  note: '',
})
let requestId = 0

/**
 * 录入弹窗的三组字段。**按 key 显式列出，不要用 slice 切**：
 * payrollComponentFields 增减项时 slice 会静默错位（曾把社保个人承担归进「公司承担」）。
 */
const componentGroups: { title: string, fields: readonly (readonly [PayrollComponentKey, string])[] }[] = [
  { title: '收入项目', fields: payrollComponentFields.filter(([key]) => payrollIncomeKeys.includes(key)) },
  { title: '公司承担', fields: payrollComponentFields.filter(([key]) => key === 'employerSocialInsuranceCents' || key === 'employerHousingFundCents') },
  { title: '个人扣款', fields: payrollComponentFields.filter(([key]) => payrollEmployeeDeductionKeys.includes(key) || payrollAttendanceDeductionKeys.includes(key)) },
]
const totalFields = (
  [
    'incomeSubtotalCents',
    'employerContributionCents',
    'totalCompensationCents',
    'attendanceDeductionCents',
    'payableBeforePersonalDeductionsCents',
    'netPayCents',
  ] as const
).map((key) => [key, payrollTotalsLabels[key]] as const)
const statementLabels: Record<string, string> = {
  missing: '未录入',
  draft: '草稿',
  published: '已发布',
  withdrawn: '已撤回',
}
/** 未录入工资条的月份：金额按薪资标准预估，只提示不落库 */
const estimatedCount = computed(() => rows.value.filter((row) => row.standardDraft).length)
/** 隐藏发放相关列时，加载/空态/展开行的合并列数 */
const visibleColumnCount = showPayrollPayments ? 9 : 6

/** 工资表「考勤」列：整月一个口径，逐行显示同一个值（是否结账）。 */
const ledgerBadgeLabel = computed(() => (ledgerSettled.value ? '已结账' : '未结账'))
function ledgerHint() {
  if (ledgerStatus.value === 'closed') return '当月考勤台账已结账，工资表用的考勤口径已锁定。'
  if (ledgerStatus.value === 'open')
    return '当月考勤台账已建立但还没有结账。正常流程是先由考勤管理员结账，再发布工资条；有特殊情况可以在发布时选「强制发布」。'
  return '当月还没有建立考勤台账。正常流程是先完成考勤结账再发布工资条；确有需要在发布时可以选「强制发布」。'
}

/** 「未结账发布」标记说明：说清是哪一版、什么时候、当时台账是什么状态。 */
function forcedPublishHint(row: PayrollStatementRow) {
  const forced = row.forcedPublish
  if (!forced) return ''
  const reason = forced.ledgerStatus === 'missing' ? '当月还没有建立考勤台账' : '当月考勤尚未结账'
  return `第 ${forced.revision} 版发布于 ${formatBeijingDate(forced.at)}，当时${reason}，属于强制发布。`
}

/** 「考勤」列的悬停说明：常态讲当月结账口径，这一版是强发出来的再补一句留痕说明。 */
function ledgerCellHint(row: PayrollStatementRow) {
  return [ledgerHint(), forcedPublishHint(row)].filter(Boolean).join(' ')
}

/** 工资条状态说明：含义 + 员工可见性 + 下一步该做什么。 */
function statementStatusHint(row: PayrollStatementRow) {
  if (row.statementStatus === 'draft' && row.publishedTotals) {
    return `已发布第 ${row.revision} 版，员工现在看到的是这一版；另有一份修订草稿（实发 ${formatCents(row.totals?.netPayCents)}）尚未发布，发布后员工才会看到修订内容。`
  }
  if (row.statementStatus === 'draft') {
    return '工资条还是草稿：只有财务和总经理能看到，员工在「我的工资条」看不到。补全绩效、补贴、考勤扣款、个税后点「发布」，员工才能查看。'
  }
  if (row.statementStatus === 'published') {
    if (ledgerSettled.value) {
      return `第 ${row.revision} 版已发布，员工可以在「我的工资条」查看；已发布数据计入薪资统计与发薪口径。当月考勤已结账，要更正金额请先「撤回」（保留旧版记录）再重新发布。`
    }
    return `第 ${row.revision} 版已发布，员工可以在「我的工资条」查看。当月考勤还没结账，这份是过渡版本：点「编辑」改完保存草稿再发布，就会生成第 ${row.revision + 1} 版，不必先撤回。`
  }
  if (row.statementStatus === 'withdrawn') {
    return '这一版已撤回，员工看不到；补充修改后重新发布即可恢复。'
  }
  return row.standardDraft
    ? '本月还没有录入工资条：表格金额是按「薪资设置」里的薪资标准预估的底稿（绩效、补贴、考勤扣款、个税按 0 计）。点「录入」确认并保存草稿后才会成为正式记录，草稿员工看不到。'
    : '本月还没有录入工资条：点「录入」填写并保存草稿；发布之前员工看不到。'
}

/** 「编辑」按钮的悬停说明：按行当前状态说清改完会发生什么。 */
function editHint(row: PayrollStatementRow) {
  if (row.statementStatus === 'missing') return '按薪资标准录入本月工资条'
  if (row.statementStatus === 'published')
    return '当月考勤还没结账，可以直接修改这份已发布的工资条；保存草稿后发布就会生成新版本，员工看到的是最新一版'
  return '修改本月工资条草稿'
}

/** 「发布」按钮的悬停说明：修订草稿是「再发布」，和首次发布要分开说。 */
function publishHint(row: PayrollStatementRow) {
  return row.publishedTotals
    ? '发布这份修订草稿：版本号接着往下排，员工看到的是新版本'
    : '发布后员工可以查看本人这份工资条'
}

/** 发布对话框的副标题：区分「首次发布」与「订正后再发布」。 */
function publishDialogNote(row: PayrollStatementRow | null) {
  if (!row) return ''
  return row.publishedTotals
    ? `订正第 ${row.revision} 版，发布后生成第 ${row.revision + 1} 版`
    : '首次发布'
}

/** 录入弹窗标题：改的是一份已发布工资条时要说清（未结账月份允许这么改）。 */
function editorTitle(row: PayrollStatementRow | null) {
  if (!row) return '录入工资条'
  return row.statementStatus === 'published' ? '修改已发布工资条' : '录入工资条'
}

/** 发放状态说明：按已发布版的实发与累计净支付（付款 − 退款）给出金额与差额。 */
function paymentStatusHint(row: PayrollStatementRow) {
  const netPayCents = row.publishedTotals?.netPayCents ?? row.totals?.netPayCents
  if (row.paymentStatus === 'not_publish') return '工资条还没发布，不存在发放口径；发布之后才能登记付款。'
  if (row.paymentStatus === 'unpaid')
    return `已发布但尚未登记任何付款。应发 ${formatCents(netPayCents)}；登记付款后这里会显示已付与剩余。`
  if (row.paymentStatus === 'partial')
    return `已登记付款但还没付清：净支付（付款 − 退款）${formatCents(row.paidCents)} / 应发 ${formatCents(netPayCents)}，还差 ${formatCents(row.remainingCents)}。`
  return `已付清：净支付（付款 − 退款）${formatCents(row.paidCents)}，应发 ${formatCents(netPayCents)}。多发或退回可在本行登记退款。`
}
const paymentLabels: Record<string, string> = {
  unpaid: '未发放',
  partial: '部分发放',
  paid: '已发放',
  not_publish: '未发布',
}

function rowIndex(row: PayrollStatementRow) {
  return rows.value.findIndex((item) => item.employeeId === row.employeeId)
}

/** 整行单击即可展开/收缩明细；操作列单独 stop，避免点按钮时误切换。 */
function toggleRow(employeeId: string) {
  expandedId.value = expandedId.value === employeeId ? '' : employeeId
}

function showError(error: unknown) {
  const value = error as { response?: { data?: { message?: string; error?: string } }; message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || '操作失败')
}
function assertOk(response: { ok?: boolean; error?: unknown }, message: string) {
  if (response.ok === false) throw new Error(typeof response.error === 'string' ? response.error : message)
}
function employeeKey(row: PayrollStatementRow) {
  return row.employeeId
}

/** 员工工资条的现行版本口径：优先已发布版，其次正式草稿，最后是薪资标准预估底稿。 */
function statementComponents(row: PayrollStatementRow) {
  return row.publishedComponents ?? row.components ?? row.standardDraft?.components
}
function statementTotals(row: PayrollStatementRow) {
  return row.publishedTotals ?? row.totals ?? row.standardDraft?.totals
}

async function loadStatements() {
  if (!/^\d{4}-\d{2}$/.test(month.value)) return
  const currentRequest = ++requestId
  loading.value = true
  loadError.value = false
  rows.value = []
  totals.value = null
  // 换月份时先回到「未结账」，避免上一月的结论停留在发布对话框里。
  ledgerStatus.value = 'missing'
  try {
    const response = await getPayrollStatements(month.value)
    assertOk(response, '读取工资表失败')
    if (currentRequest !== requestId) return
    rows.value = response.data?.rows ?? []
    totals.value = response.data?.totals ?? null
    ledgerStatus.value = response.data?.ledgerStatus ?? 'missing'
  } catch (error) {
    if (currentRequest === requestId) {
      loadError.value = true
      showError(error)
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

/** 薪资标准里能自动带入录入表单的项目：固定工资项 + 基数×比例算出的社保公积金。 */
function standardComponents(row: PayrollStatementRow): Partial<Record<PayrollComponentKey, number>> | null {
  const standard = row.standard
  if (!standard) return null
  const contributions = standard.contributions ?? computeStandardContributions(standard)
  return {
    basicPayCents: standard.basicPayCents,
    positionPayCents: standard.positionPayCents,
    seniorityPayCents: standard.seniorityPayCents,
    attendanceBonusCents: standard.attendanceBonusCents,
    employerSocialInsuranceCents: contributions.employerSocialInsuranceCents,
    employeeSocialInsuranceCents: contributions.employeeSocialInsuranceCents,
    employerHousingFundCents: contributions.employerHousingFundCents,
    employeeHousingFundCents: contributions.employeeHousingFundCents,
  }
}

/** 录入表单当前各项金额（分）；有任一项填不完整就返回 null，此时不给个税估值。 */
const draftCents = computed<Record<PayrollComponentKey, number> | null>(() => {
  const result = {} as Record<PayrollComponentKey, number>
  for (const [key] of payrollComponentFields) {
    const cents = parseYuanToCents(componentsDraft.value[key])
    if (cents === null) return null
    result[key] = cents
  }
  return result
})

/**
 * 该项是否已经有值（非 0）：有值的用蓝色、仍是 0 的用灰色，
 * 让财务一眼看出哪些是「已带出/已填」的、哪些还是空的，不用逐格去读数字。
 */
function hasAmount(key: PayrollComponentKey) {
  const cents = parseYuanToCents(componentsDraft.value[key])
  return cents !== null && cents !== 0
}

/**
 * 按「累计预扣预缴法」算出的个税过程：往月取后端的累计数，本月取弹窗里当前输入的收入与个人社保公积金。
 * 往月数据没取到（loading / error）时返回 null —— 宁可不填，也不能把只算本月的错值填进去。
 * 税额规则见 utils/income-tax.ts。
 */
const taxBreakdown = computed<CumulativeTaxBreakdown | null>(() => {
  const basis = taxBasis.value
  const cents = draftCents.value
  if (taxBasisState.value !== 'ready' || !basis || !cents) return null
  const currentIncomeCents =
    payrollIncomeKeys.reduce((sum, key) => sum + cents[key], 0) -
    payrollAttendanceDeductionKeys.reduce((sum, key) => sum + cents[key], 0)
  return computeCumulativeIncomeTax({
    month: month.value,
    serviceMonths: basis.serviceMonths,
    cumulativeIncomeCents: basis.cumulativeIncomeCents + currentIncomeCents,
    cumulativeSpecialDeductionCents:
      basis.cumulativeSpecialDeductionCents + cents.employeeSocialInsuranceCents + cents.employeeHousingFundCents,
    cumulativeWithheldTaxCents: basis.cumulativeWithheldTaxCents,
  })
})

/**
 * 个税输入框里「还没有被人工改动过」的基准值。
 *
 * 不能只看 @input 事件：同一个输入事件里，watch(taxBreakdown) 的执行早于 Input 组件抛上来的
 * @input 回调，于是自动填值会在 taxOverridden 还没置位时把刚手写的金额覆盖回规则值
 * —— 输入框看着是手填的数，组件状态里却留着规则值，保存草稿就把错的金额存进去了。
 * 所以这里用「当前值是否还等于基准值」来判断有没有人工改动，与回调顺序无关。
 */
let taxBaseline = ''

/** 认下输入框里当前的值作为基准（打开弹窗、点「按规则重算 / 按薪资标准填入」时用）。 */
function adoptCurrentTax() {
  taxBaseline = String(componentsDraft.value.incomeTaxCents ?? '')
  taxOverridden.value = false
}

/** 把算出的个税写进输入框；财务手工改过（当前值已不等于基准值）就不再覆盖。 */
function applyComputedTax() {
  const current = String(componentsDraft.value.incomeTaxCents ?? '')
  if (current !== taxBaseline) {
    taxOverridden.value = true
    return
  }
  const breakdown = taxBreakdown.value
  if (!breakdown) return
  const next = centsToYuanInput(breakdown.payableTaxCents)
  // 值没变就不写，避免「写入 → 重算 → 再写入」的空转
  if (current === next) return
  taxBaseline = next
  componentsDraft.value.incomeTaxCents = next
}

/** 手工改过个税后想回到规则值时用：先把当前手填值认成基准，再按规则重算一次。 */
function recalculateTax() {
  adoptCurrentTax()
  applyComputedTax()
}

/** 取该员工本年度的累计计税基数；失败时不自动算个税，由财务手工填。 */
async function loadTaxBasis(employeeId: string) {
  const currentRequest = ++taxBasisRequestId
  taxBasisState.value = 'loading'
  taxBasis.value = null
  try {
    const response = await getPayrollTaxBasis(employeeId, month.value)
    assertOk(response, '读取个税累计数据失败')
    if (currentRequest !== taxBasisRequestId) return
    taxBasis.value = response.data ?? null
    taxBasisState.value = taxBasis.value ? 'ready' : 'error'
  } catch (error) {
    if (currentRequest !== taxBasisRequestId) return
    taxBasisState.value = 'error'
    showError(error)
  }
}

/** 打开录入弹窗：已保存的草稿优先，没有的项用薪资标准带出来；个税按累计预扣预缴法自动算。 */
function openEditor(row: PayrollStatementRow) {
  editingRow.value = row
  const standard = standardComponents(row)
  componentsDraft.value = Object.fromEntries(
    payrollComponentFields.map(([key]) => {
      const saved = row.components?.[key]
      return [key, centsToYuanInput(typeof saved === 'number' ? saved : standard?.[key])]
    }),
  ) as Record<PayrollComponentKey, string>
  adoptCurrentTax()
  taxBasisState.value = 'idle'
  taxBasis.value = null
  void loadTaxBasis(row.employeeId)
}

/** 用薪资标准覆盖固定项与社保公积金，其余项目（绩效、补贴、考勤扣款、个税）保持手填。 */
function applyStandard() {
  const row = editingRow.value
  const standard = row ? standardComponents(row) : null
  if (!row || !standard) {
    toast.error('该员工还没有薪资标准，请先到「薪资设置」里维护')
    return
  }
  const next = { ...componentsDraft.value }
  for (const [key, value] of Object.entries(standard)) next[key as PayrollComponentKey] = centsToYuanInput(value)
  componentsDraft.value = next
  // 重算固定项与社保公积金会改变计税基数，个税跟着回到规则值（手工改过的以「按规则重算」为准）
  adoptCurrentTax()
  toast.success('已按薪资标准填入固定项与社保公积金')
}

/** 展开明细里的请假时长：只列有时长的类型。 */
function leaveEntries(row: PayrollStatementRow) {
  return Object.entries(row.attendance?.leaveMinutesByType ?? {}).filter(([, minutes]) => (minutes ?? 0) > 0)
}

function saveDraft() {
  const row = editingRow.value
  if (!row) return
  const components = {} as PayrollComponents
  for (const [key, label] of payrollComponentFields) {
    const cents = parseYuanToCents(componentsDraft.value[key])
    if (cents === null) {
      toast.error(`${label}请输入有效金额，最多两位小数`)
      return
    }
    components[key] = cents
  }
  savingDraft.value = true
  void (async () => {
    try {
      const response = await savePayrollDraft(row.employeeId, month.value, components, row.version)
      assertOk(response, '保存工资草稿失败')
      toast.success('工资草稿已保存')
      editingRow.value = null
      await loadStatements()
    } catch (error) {
      showError(error)
    } finally {
      savingDraft.value = false
    }
  })()
}

function openAction(type: 'publish' | 'withdraw', row: PayrollStatementRow) {
  actionType.value = type
  actionRow.value = row
  actionReason.value = ''
}

async function submitAction() {
  const row = actionRow.value
  if (!row || !actionType.value) return
  if (actionType.value === 'withdraw' && !actionReason.value.trim()) {
    toast.error('请填写撤回原因')
    return
  }
  actionBusy.value = true
  try {
    const response =
      actionType.value === 'publish'
        ? await publishPayrollStatement(row.employeeId, month.value, row.version, forcePublish.value)
        : await withdrawPayrollStatement(row.employeeId, month.value, row.version, actionReason.value.trim())
    assertOk(response, actionType.value === 'publish' ? '发布工资条失败' : '撤回工资条失败')
    toast.success(
      actionType.value === 'publish'
        ? forcePublish.value
          ? '已强制发布：当月考勤未结账，发布记录已留痕'
          : '工资条已发布'
        : '工资条已撤回',
    )
    actionType.value = ''
    actionRow.value = null
    await loadStatements()
  } catch (error) {
    showError(error)
  } finally {
    actionBusy.value = false
  }
}

function openPayment(row: PayrollStatementRow, direction: 'payment' | 'refund') {
  paymentRow.value = row
  paymentForm.value = { direction, amountYuan: '', paidAt: '', proofUrl: '', note: '' }
  paymentDialogOpen.value = true
}

async function submitPayment() {
  const row = paymentRow.value
  const cents = parseYuanToCents(paymentForm.value.amountYuan)
  if (!row || cents === null || cents <= 0 || !paymentForm.value.paidAt) {
    toast.error('请填写有效金额和时间')
    return
  }
  if (paymentForm.value.direction === 'payment' && cents > row.remainingCents) {
    toast.error('本次付款不能超过剩余应付金额')
    return
  }
  if (paymentForm.value.direction === 'refund' && cents > row.paidCents) {
    toast.error('退款金额不能超过累计已付金额')
    return
  }
  const paidAt = wallClockToIso(paymentForm.value.paidAt)
  if (!paidAt) {
    toast.error('付款时间无效')
    return
  }
  paymentBusy.value = true
  try {
    const response = await addPayrollPayment(row.employeeId, month.value, {
      version: row.version,
      direction: paymentForm.value.direction,
      amountCents: cents,
      paidAt,
      proofUrl: paymentForm.value.proofUrl.trim(),
      note: paymentForm.value.note.trim(),
      statementRevision: row.revision,
    })
    assertOk(response, paymentForm.value.direction === 'payment' ? '登记付款失败' : '登记退款失败')
    toast.success(paymentForm.value.direction === 'payment' ? '付款记录已登记' : '退款记录已登记')
    paymentDialogOpen.value = false
    await loadStatements()
  } catch (error) {
    showError(error)
  } finally {
    paymentBusy.value = false
  }
}

// 收入、绩效、社保公积金等任何一项变化都会让 taxBreakdown 重算，这里把结果同步进个税输入框。
// taxBreakdown 不依赖 incomeTaxCents，所以自动填值不会反过来触发本监听，不存在循环。
watch(taxBreakdown, applyComputedTax)
watch(month, () => {
  void loadStatements()
})
onMounted(() => {
  if (!canViewCompany.value) {
    void router.replace('/attendance/payroll/my')
    return
  }
  const legacyTab = legacyTabRoutes[String(route.query.tab || '')]
  if (legacyTab) {
    void router.replace(legacyTab)
    return
  }
  void loadStatements()
})
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <!-- 移动端顶部 sticky：月份 + 操作入口（导入 / 批量发布收进底部抽屉） -->
    <div v-if="isMobile" class="sticky top-0 z-20 -mx-4 -mt-4 flex items-center gap-2 border-b bg-background px-4 py-2">
      <MonthPicker
        v-model="month"
        placeholder="选择工资月份"
        class="h-9 flex-1 text-foreground"
        :disabled="loading || !!editingRow || actionBusy || paymentBusy"
      />
      <Drawer v-if="canEdit" v-model:open="mobileActionsOpen" direction="bottom">
        <DrawerTrigger as-child>
          <Button size="sm" variant="outline" :disabled="loading || !!editingRow || actionBusy || paymentBusy"><SlidersHorizontal class="mr-1.5 size-4" />操作</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>工资表操作</DrawerTitle></DrawerHeader>
          <div class="grid gap-2 px-4 pb-6">
            <Button class="h-10" variant="outline" :disabled="loading || !!editingRow || actionBusy || paymentBusy" @click="mobileActionsOpen = false; importOpen = true"><Upload class="mr-1.5 size-4" />导入工资表</Button>
            <Button class="h-10" variant="outline" :disabled="loading || !!editingRow || actionBusy || paymentBusy" @click="mobileActionsOpen = false; welfareOpen = true"><Gift class="mr-1.5 size-4" />批量福利</Button>
            <Button class="h-10" :disabled="loading || !!editingRow || actionBusy || paymentBusy || !publishableCount" @click="mobileActionsOpen = false; publishOpen = true"><Send class="mr-1.5 size-4" />批量发布<template v-if="publishableCount">（{{ publishableCount }}）</template></Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>

    <div v-if="!isMobile" class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold">工资表</h1>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="canEdit">
          <Button
            size="sm"
            variant="outline"
            :disabled="loading || !!editingRow || actionBusy || paymentBusy"
            @click="importOpen = true"
            ><Upload class="mr-1.5 size-4" />导入</Button
          >
          <Button
            size="sm"
            variant="outline"
            :disabled="loading || !!editingRow || actionBusy || paymentBusy"
            @click="welfareOpen = true"
            ><Gift class="mr-1.5 size-4" />批量福利</Button
          >
          <Button
            size="sm"
            variant="outline"
            :disabled="loading || !!editingRow || actionBusy || paymentBusy || !publishableCount"
            @click="publishOpen = true"
            ><Send class="mr-1.5 size-4" />批量发布<template v-if="publishableCount"
              >（{{ publishableCount }}）</template
            ></Button
          >
        </template>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="whitespace-nowrap">月份</span
          ><MonthPicker
            v-model="month"
            placeholder="选择工资月份"
            class="h-9 w-40 text-foreground"
            :disabled="loading || !!editingRow || actionBusy || paymentBusy"
          />
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <section class="grid grid-cols-2 gap-x-5 gap-y-3 border-y py-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="[key, label] in totalFields" :key="key">
          <div class="text-xs text-muted-foreground">{{ label }}</div>
          <div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(totals?.[key]) }}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">已发布</div>
          <div class="mt-1 text-sm font-medium tabular-nums">{{ totals?.publishedCount ?? 0 }}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">草稿</div>
          <div class="mt-1 text-sm font-medium tabular-nums">{{ totals?.draftCount ?? 0 }}</div>
        </div>
        <div v-if="showPayrollPayments">
          <div class="text-xs text-muted-foreground">已发放</div>
          <div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(totals?.paidCents) }}</div>
        </div>
        <div v-if="showPayrollPayments">
          <div class="text-xs text-muted-foreground">待发放</div>
          <div class="mt-1 text-sm font-medium tabular-nums">{{ formatCents(totals?.remainingCents) }}</div>
        </div>
      </section>

      <!-- 移动端：每人一张卡，展开为 2 列键值明细；读取失败不落成空状态 -->
      <div v-if="isMobile" class="space-y-2">
        <p v-if="loading" class="rounded-xl border bg-background py-10 text-center text-sm text-muted-foreground">加载中…</p>
        <div v-else-if="loadError" class="rounded-md border py-10 text-center">
          <p class="text-sm text-destructive">工资表读取失败，请检查网络后重试。</p>
          <Button class="mt-3" size="sm" variant="outline" @click="loadStatements">重试</Button>
        </div>
        <p v-else-if="!rows.length" class="rounded-xl border bg-background py-10 text-center text-sm text-muted-foreground">本月暂无工资记录</p>
        <template v-else>
          <div v-for="row in rows" :key="employeeKey(row)" class="overflow-hidden rounded-xl border bg-background">
            <button type="button" class="w-full px-3 py-2.5 text-left" :aria-expanded="expandedId === row.employeeId" @click="toggleRow(row.employeeId)">
              <div class="flex items-center gap-2">
                <span class="min-w-0 truncate text-sm font-medium">{{ row.name }}</span>
                <span class="flex-1" />
                <Badge variant="outline" class="shrink-0" :class="ledgerSettled ? '' : 'text-amber-700 dark:text-amber-400'">{{ ledgerBadgeLabel }}</Badge>
                <Badge variant="outline" class="shrink-0">{{ row.statementStatus === 'draft' && row.publishedTotals ? '已发布' : (statementLabels[row.statementStatus] ?? row.statementStatus) }}</Badge>
              </div>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ [row.employeeNo, row.phone, row.department].filter(Boolean).join(' · ') || '—'
                }}<template v-if="row.revision > 0"> · 第{{ row.revision }}版</template>
              </p>
              <div class="mt-1.5 flex items-end justify-between gap-2">
                <span class="text-xs text-muted-foreground">实发金额</span>
                <span class="text-lg font-semibold tabular-nums" :class="row.standardDraft ? 'font-normal text-muted-foreground' : ''">{{ formatCents(statementTotals(row)?.netPayCents) }}</span>
              </div>
              <p v-if="row.standardDraft" class="mt-0.5 text-[10px] text-muted-foreground">按薪资标准预估</p>
              <p v-if="row.forcedPublish" class="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                未结账发布 · 第{{ row.forcedPublish.revision }}版 · {{ formatBeijingDate(row.forcedPublish.at) }}
              </p>
              <p v-if="row.statementStatus === 'draft' && row.publishedTotals" class="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                修订草稿待发布 · 草稿实发 {{ formatCents(row.totals?.netPayCents) }}
              </p>
            </button>
            <div class="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
              <Button variant="ghost" size="sm" class="h-9 text-muted-foreground" :aria-expanded="expandedId === row.employeeId" @click="toggleRow(row.employeeId)">{{ expandedId === row.employeeId ? '收起' : '明细' }}</Button>
              <Button v-if="canEditStatement(row)" variant="outline" size="sm" class="h-9" :aria-label="`编辑工资条：${row.name}`" @click="openEditor(row)"><FileEdit class="size-4" />{{ row.statementStatus === 'missing' ? '录入' : '编辑' }}</Button>
              <Button v-if="canEdit && row.statementStatus === 'draft'" variant="outline" size="sm" class="h-9" :aria-label="`发布工资条：${row.name}`" @click="openAction('publish', row)"><Send class="size-4" />发布</Button>
              <Button v-if="canEdit && row.publishedTotals" variant="ghost" size="sm" class="h-9 text-muted-foreground" :aria-label="`撤回工资条：${row.name}`" @click="openAction('withdraw', row)"><RotateCcw class="size-4" />撤回</Button>
            </div>
            <div v-if="expandedId === row.employeeId" class="space-y-3 border-t bg-muted/30 px-3 py-2">
              <div>
                <PayslipReceipt
                  :title="row.publishedTotals || !row.standardDraft ? '工资条' : '工资条（预估）'"
                  :period="formatPayrollMonthLabel(month)"
                  :name="row.name || row.displayName || ''"
                  :employee-no="row.employeeNo"
                  :department="row.department"
                  :components="statementComponents(row)"
                  :totals="statementTotals(row)"
                />
                <div v-if="row.statementStatus === 'draft' && row.publishedTotals" class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">未发布修订草稿实发</span><span class="tabular-nums">{{ formatCents(row.totals?.netPayCents) }}</span>
                  </div>
                </div>
              </div>
              <div>
                <h2 class="mb-2 text-xs font-semibold">当月考勤时长 · {{ month }}</h2>
                <template v-if="row.attendance">
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <div class="text-muted-foreground">应出勤</div>
                      <div class="mt-0.5 font-medium tabular-nums">{{ formatMinutes(row.attendance.expectedMinutes) }}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">已确认实到</div>
                      <div class="mt-0.5 font-medium tabular-nums">{{ formatMinutes(row.attendance.actualMinutes) }}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">已批加班</div>
                      <div class="mt-0.5 font-medium tabular-nums">{{ formatMinutes(row.attendance.overtimeApprovedMinutes) }}</div>
                      <div class="text-muted-foreground">调休 {{ formatMinutes(row.attendance.overtimeCompTimeMinutes) }} · 加班费 {{ formatMinutes(row.attendance.overtimePayMinutes) }}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">已批出差</div>
                      <div class="mt-0.5 font-medium tabular-nums">{{ formatMinutes(row.attendance.fieldworkApprovedMinutes) }}</div>
                    </div>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-xs">
                    <span class="text-muted-foreground">请假</span>
                    <span v-if="!leaveEntries(row).length" class="text-muted-foreground">无</span>
                    <span v-for="[type, minutes] in leaveEntries(row)" :key="type">{{ leaveLabel(type) }} {{ formatMinutes(minutes) }}</span>
                    <span v-if="row.attendance.requiresLeaveReconciliation" class="text-amber-700 dark:text-amber-400">有请假单的分摊明细需要复核，未计入</span>
                  </div>
                </template>
                <div v-else class="py-2 text-xs text-muted-foreground">当月考勤台账未建立，暂无出差/加班/请假时长</div>
              </div>
              <div v-if="showPayrollPayments">
                <h2 class="mb-2 text-xs font-semibold">收退款记录</h2>
                <div v-if="!row.paymentHistory?.length" class="py-2 text-xs text-muted-foreground">暂无记录</div>
                <div v-for="(payment, index) in row.paymentHistory ?? []" :key="`${payment.createdAt}-${index}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-1.5 text-xs">
                  <Badge variant="outline">{{ payment.direction === 'payment' ? '付款' : '退款' }}</Badge><span class="font-medium tabular-nums">{{ formatCents(payment.amountCents) }}</span><span class="text-muted-foreground">{{ payment.paidAt ? formatBeijingDate(payment.paidAt) : '—' }}</span><a v-if="payment.proofUrl" :href="payment.proofUrl" target="_blank" rel="noreferrer" class="underline">凭证</a><span>{{ payment.note }}</span><span class="text-muted-foreground">{{ payment.createdBy?.name }} · 第{{ payment.statementRevision }}版</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="overflow-x-auto rounded-md border bg-background">
        <TooltipProvider :delay-duration="300">
          <Table :class="showPayrollPayments ? 'min-w-[1280px]' : 'min-w-[1000px]'">
            <TableHeader
              ><TableRow
                ><TableHead class="sticky left-0 z-10 w-48 bg-muted">员工</TableHead
                ><TableHead class="w-24">工资条</TableHead
                ><TableHead class="w-24">考勤</TableHead
                ><TableHead v-if="showPayrollPayments" class="w-24">发放</TableHead
                ><TableHead class="w-24 text-right">收入</TableHead><TableHead class="w-24 text-right">实发</TableHead
                ><TableHead v-if="showPayrollPayments" class="w-24 text-right">已付</TableHead
                ><TableHead v-if="showPayrollPayments" class="w-24 text-right">剩余</TableHead
                ><TableHead class="w-72 text-right">操作</TableHead></TableRow
              ></TableHeader
            >
            <TableBody>
              <TableRow v-if="loading"
                ><TableCell :colspan="visibleColumnCount" class="h-20 text-center text-muted-foreground"
                  >加载中…</TableCell
                ></TableRow
              >
              <TableRow v-else-if="loadError"
                ><TableCell :colspan="visibleColumnCount" class="h-20 text-center"
                  ><div class="text-sm text-destructive">工资表读取失败，请检查网络后重试。</div>
                  <Button class="mt-2" size="sm" variant="outline" @click="loadStatements">重试</Button></TableCell
                ></TableRow
              >
              <TableRow v-else-if="!rows.length"
                ><TableCell :colspan="visibleColumnCount" class="h-20 text-center text-muted-foreground"
                  >本月暂无工资记录</TableCell
                ></TableRow
              >
              <template v-for="row in rows" :key="employeeKey(row)">
                <TableRow class="cursor-pointer" @click="toggleRow(row.employeeId)">
                  <TableCell class="sticky left-0 z-[1] bg-background"
                    ><div class="font-medium">{{ row.name }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ [row.employeeNo, row.phone, row.department].filter(Boolean).join(' · ')
                      }}<template v-if="row.revision > 0"> · 第{{ row.revision }}版</template>
                    </div></TableCell
                  >
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="inline-flex cursor-help flex-col items-start">
                          <Badge variant="outline">{{
                            row.statementStatus === 'draft' && row.publishedTotals
                              ? '已发布'
                              : (statementLabels[row.statementStatus] ?? row.statementStatus)
                          }}</Badge>
                          <span
                            v-if="row.statementStatus === 'draft' && row.publishedTotals"
                            class="mt-1 text-[10px] text-amber-700 dark:text-amber-400"
                            >修订草稿待发布</span
                          >
                        </span>
                      </TooltipTrigger>
                      <TooltipContent class="max-w-72">{{ statementStatusHint(row) }}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="inline-flex cursor-help flex-col items-start">
                          <Badge
                            variant="outline"
                            :class="ledgerSettled ? '' : 'text-amber-700 dark:text-amber-400'"
                            >{{ ledgerBadgeLabel }}</Badge
                          >
                          <span
                            v-if="row.forcedPublish"
                            class="mt-1 text-[10px] text-amber-700 dark:text-amber-400"
                            >未结账发布</span
                          >
                        </span>
                      </TooltipTrigger>
                      <TooltipContent class="max-w-72">{{ ledgerCellHint(row) }}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell v-if="showPayrollPayments">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Badge
                          variant="outline"
                          class="cursor-help"
                          :class="row.paymentStatus === 'unpaid' ? 'text-amber-700 dark:text-amber-400' : ''"
                          >{{ paymentLabels[row.paymentStatus] ?? row.paymentStatus }}</Badge
                        >
                      </TooltipTrigger>
                      <TooltipContent class="max-w-72">{{ paymentStatusHint(row) }}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell class="text-right tabular-nums" :class="row.standardDraft ? 'text-muted-foreground' : ''">
                    {{
                      formatCents(
                        (row.publishedTotals ?? row.totals)?.incomeSubtotalCents ??
                          row.standardDraft?.totals.incomeSubtotalCents,
                      )
                    }}
                    <div v-if="row.standardDraft" class="text-[10px]" title="按薪资标准预估，尚未录入工资条">
                      按标准预估
                    </div>
                    <div
                      v-if="row.statementStatus === 'draft' && row.publishedTotals"
                      class="text-[10px] text-amber-700 dark:text-amber-400"
                    >
                      草稿 {{ formatCents(row.totals?.incomeSubtotalCents) }}
                    </div>
                  </TableCell>
                  <TableCell
                    class="text-right font-medium tabular-nums"
                    :class="row.standardDraft ? 'font-normal text-muted-foreground' : ''"
                  >
                    <span :title="row.standardDraft ? '按薪资标准预估，尚未录入工资条' : undefined">{{
                      formatCents(
                        (row.publishedTotals ?? row.totals)?.netPayCents ?? row.standardDraft?.totals.netPayCents,
                      )
                    }}</span>
                    <div
                      v-if="row.statementStatus === 'draft' && row.publishedTotals"
                      class="text-[10px] font-normal text-amber-700 dark:text-amber-400"
                    >
                      草稿 {{ formatCents(row.totals?.netPayCents) }}
                    </div>
                  </TableCell>
                  <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{
                    formatCents(row.paidCents)
                  }}</TableCell>
                  <TableCell v-if="showPayrollPayments" class="text-right tabular-nums">{{
                    formatCents(row.remainingCents)
                  }}</TableCell>
                  <TableCell class="text-right"
                    ><div class="flex items-center justify-end gap-0.5" @click.stop>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`${expandedId === row.employeeId ? '收起' : '展开'}工资条详情：${row.name}`"
                            :aria-expanded="expandedId === row.employeeId"
                            @click="toggleRow(row.employeeId)"
                            ><ChevronUp v-if="expandedId === row.employeeId" class="size-4" /><ChevronDown
                              v-else
                              class="size-4"
                            />{{ expandedId === row.employeeId ? '收起' : '展开' }}</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>{{
                          expandedId === row.employeeId
                            ? '收起工资条明细'
                            : showPayrollPayments
                              ? '展开工资条明细与收退款记录'
                              : '展开工资条明细'
                        }}</TooltipContent>
                      </Tooltip>
                      <Tooltip v-if="canEditStatement(row)">
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`编辑工资条：${row.name}`"
                            @click="openEditor(row)"
                            ><FileEdit class="size-4" />{{
                              row.statementStatus === 'missing' ? '录入' : '编辑'
                            }}</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>{{ editHint(row) }}</TooltipContent>
                      </Tooltip>
                      <Tooltip v-if="canEdit && row.statementStatus === 'draft'">
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`发布工资条：${row.name}`"
                            @click="openAction('publish', row)"
                            ><Send class="size-4" />发布</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>{{ publishHint(row) }}</TooltipContent>
                      </Tooltip>
                      <Tooltip v-if="canEdit && row.publishedTotals">
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`撤回工资条：${row.name}`"
                            @click="openAction('withdraw', row)"
                            ><RotateCcw class="size-4" />撤回</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>撤回已发布工资条：员工看不到，改完可重新发布；需要填写原因</TooltipContent>
                      </Tooltip>
                      <Tooltip v-if="showPayrollPayments && canEdit && row.publishedTotals && row.remainingCents > 0">
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`登记付款：${row.name}`"
                            @click="openPayment(row, 'payment')"
                            ><Wallet class="size-4" />付款</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>登记工资付款（实付日期、金额、凭证）</TooltipContent>
                      </Tooltip>
                      <Tooltip v-if="showPayrollPayments && canEdit && row.publishedTotals && row.paidCents > 0">
                        <TooltipTrigger as-child>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 px-2"
                            :aria-label="`登记退款：${row.name}`"
                            @click="openPayment(row, 'refund')"
                            ><RotateCcw class="size-4" />退款</Button
                          >
                        </TooltipTrigger>
                        <TooltipContent>登记工资退款（多发或退回）</TooltipContent>
                      </Tooltip>
                    </div></TableCell
                  >
                </TableRow>
                <TableRow v-if="expandedId === row.employeeId"
                  ><TableCell :colspan="visibleColumnCount" class="bg-muted/30">
                    <div class="space-y-3 py-1">
                      <div>
                        <h2 class="mb-2 text-xs font-semibold">
                          {{
                            row.publishedTotals
                              ? '有效发布版工资条'
                              : row.standardDraft
                                ? '按薪资标准预估（尚未录入）'
                                : '工资条'
                          }}
                        </h2>
                        <PayslipTable
                          :index="rowIndex(row) + 1"
                          :name="row.name || row.displayName || ''"
                          :month="month"
                          :components="row.publishedComponents ?? row.components ?? row.standardDraft?.components"
                          :totals="row.publishedTotals ?? row.totals ?? row.standardDraft?.totals"
                          :published-at="row.publishedAt"
                        />
                        <div
                          v-if="row.statementStatus === 'draft' && row.publishedTotals"
                          class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs"
                        >
                          <div class="font-medium">未发布修订草稿</div>
                          <div class="mt-1 flex justify-between">
                            <span class="text-muted-foreground">草稿实发金额</span
                            ><span class="tabular-nums">{{ formatCents(row.totals?.netPayCents) }}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h2 class="mb-2 text-xs font-semibold">当月考勤时长 · {{ month }}</h2>
                        <template v-if="row.attendance">
                          <div class="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <div class="text-muted-foreground">应出勤</div>
                              <div class="mt-0.5 font-medium tabular-nums">
                                {{ formatMinutes(row.attendance.expectedMinutes) }}
                              </div>
                            </div>
                            <div>
                              <div class="text-muted-foreground">已确认实到</div>
                              <div class="mt-0.5 font-medium tabular-nums">
                                {{ formatMinutes(row.attendance.actualMinutes) }}
                              </div>
                            </div>
                            <div>
                              <div class="text-muted-foreground">已批加班</div>
                              <div class="mt-0.5 font-medium tabular-nums">
                                {{ formatMinutes(row.attendance.overtimeApprovedMinutes) }}
                              </div>
                              <div class="text-muted-foreground">
                                调休 {{ formatMinutes(row.attendance.overtimeCompTimeMinutes) }} · 加班费
                                {{ formatMinutes(row.attendance.overtimePayMinutes) }}
                              </div>
                            </div>
                            <div>
                              <div class="text-muted-foreground">已批出差</div>
                              <div class="mt-0.5 font-medium tabular-nums">
                                {{ formatMinutes(row.attendance.fieldworkApprovedMinutes) }}
                              </div>
                            </div>
                          </div>
                          <div
                            class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-xs"
                          >
                            <span class="text-muted-foreground">请假</span>
                            <span v-if="!leaveEntries(row).length" class="text-muted-foreground">无</span>
                            <span v-for="[type, minutes] in leaveEntries(row)" :key="type"
                              >{{ leaveLabel(type) }} {{ formatMinutes(minutes) }}</span
                            >
                            <span
                              v-if="row.attendance.requiresLeaveReconciliation"
                              class="text-amber-700 dark:text-amber-400"
                              >有请假单的分摊明细需要复核，未计入</span
                            >
                          </div>
                        </template>
                        <div v-else class="py-2 text-xs text-muted-foreground">
                          当月考勤台账未建立，暂无出差/加班/请假时长
                        </div>
                      </div>
                      <div v-if="showPayrollPayments">
                        <h2 class="mb-2 text-xs font-semibold">收退款记录</h2>
                        <div v-if="!row.paymentHistory?.length" class="py-2 text-xs text-muted-foreground">
                          暂无记录
                        </div>
                        <div
                          v-for="(payment, index) in row.paymentHistory ?? []"
                          :key="`${payment.createdAt}-${index}`"
                          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-1.5 text-xs"
                        >
                          <Badge variant="outline">{{ payment.direction === 'payment' ? '付款' : '退款' }}</Badge
                          ><span class="font-medium tabular-nums">{{ formatCents(payment.amountCents) }}</span
                          ><span class="text-muted-foreground">{{
                            payment.paidAt ? formatBeijingDate(payment.paidAt) : '—'
                          }}</span
                          ><a
                            v-if="payment.proofUrl"
                            :href="payment.proofUrl"
                            target="_blank"
                            rel="noreferrer"
                            class="underline"
                            >凭证</a
                          ><span>{{ payment.note }}</span
                          ><span class="text-muted-foreground"
                            >{{ payment.createdBy?.name }} · 第{{ payment.statementRevision }}版</span
                          >
                        </div>
                      </div>
                    </div>
                  </TableCell></TableRow
                >
              </template>
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
      <p v-if="estimatedCount" class="text-xs text-muted-foreground">
        本月有 {{ estimatedCount }} 人尚未录入工资条，金额按「薪资设置」里的薪资标准预估（绩效、补贴、考勤扣款、个税按 0
        计）。点该行「录入」确认并保存草稿后，才能发布给员工。
      </p>
      <p v-if="!canEdit" class="text-xs text-muted-foreground">
        {{ showPayrollPayments ? '工资与付款信息仅供授权人员查看。' : '工资信息仅供授权人员查看。' }}
      </p>
    </div>

    <PayrollImportDialog v-model:open="importOpen" :month="month" :rows="rows" @imported="loadStatements" />

    <PayrollPublishDialog v-model:open="publishOpen" :month="month" :rows="rows" :ledger-status="ledgerStatus" @published="loadStatements" />
    <PayrollWelfareDialog v-model:open="welfareOpen" :month="month" :rows="rows" @saved="loadStatements" />

    <Dialog
      :open="!!editingRow"
      @update:open="
        (value) => {
          if (!value && !savingDraft) editingRow = null
        }
      "
    >
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{{ editorTitle(editingRow) }} · {{ editingRow?.name }}</DialogTitle>
          <p class="text-xs text-muted-foreground">
            <template v-if="editingRow?.standard"
              >固定项与社保公积金已按「薪资设置」里的薪资标准带出，可再手工调整。</template
            >
            <template v-else>该员工还没有薪资标准，可先到「薪资设置」里维护后自动带出。</template>
          </p>
          <p class="text-xs text-muted-foreground">
            「个人所得税扣款」按国家个税规则（累计预扣预缴法）自动计算，点字段旁的说明图标可查看是怎么算出来的；算出的金额也可以直接改。
          </p>
          <p v-if="taxBasisState === 'error'" class="text-xs text-destructive">
            本年度累计数据读取失败，个税没有自动计算，请手工填写「个人所得税扣款」。
          </p>
        </DialogHeader>
        <div class="space-y-5">
          <section v-for="group in componentGroups" :key="group.title" class="space-y-2.5">
            <h2 class="text-xs font-semibold">{{ group.title }}</h2>
            <p v-if="group.title === '收入项目' && (editingRow?.welfareItems?.length ?? 0) > 0" class="text-xs text-muted-foreground">
              本月已记节日福利：{{ editingRow?.welfareItems?.map(item => `${item.holidayLabel} ${formatCents(item.amountCents)}`).join('、') }}。改这一栏金额会清掉这层明细。
            </p>
            <div class="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <label v-for="[key, label] in group.fields" :key="key" class="space-y-1.5 text-xs text-muted-foreground">
                <span class="flex items-center gap-1">
                  {{ label }}（元）
                  <PayrollTaxHint
                    v-if="key === 'incomeTaxCents'"
                    :breakdown="taxBreakdown"
                    :months="taxBasis?.months ?? []"
                    :loading="taxBasisState === 'loading'"
                    :error="taxBasisState === 'error'"
                    :overridden="taxOverridden"
                    :applied-tax-cents="draftCents?.incomeTaxCents ?? null"
                    @recalculate="recalculateTax"
                    @retry="editingRow && loadTaxBasis(editingRow.employeeId)"
                  />
                </span>
                <Input
                  v-model="componentsDraft[key]"
                  type="number"
                  min="0"
                  step="0.01"
                  class="h-8 text-right tabular-nums"
                  :class="hasAmount(key) ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'"
                  :aria-label="`${label}金额（元）`"
                />
              </label>
            </div>
          </section>
        </div>
        <DialogFooter
          ><Button v-if="editingRow?.standard" variant="outline" :disabled="savingDraft" @click="applyStandard"
            >按薪资设置重算</Button
          ><Button variant="outline" :disabled="savingDraft" @click="editingRow = null">取消</Button
          ><Button :disabled="savingDraft" @click="saveDraft"
            ><Check class="mr-0.5" />{{ savingDraft ? '保存中…' : '保存' }}</Button
          ></DialogFooter
        >
      </DialogContent>
    </Dialog>

    <AlertDialog
      :open="!!actionType"
      @update:open="
        (value) => {
          if (!value && !actionBusy) actionType = ''
        }
      "
    >
      <AlertDialogContent>
        <AlertDialogHeader
          ><AlertDialogTitle>{{
            actionType === 'withdraw' ? '撤回已发布工资条' : forcePublish ? '强制发布工资条' : '发布工资条'
          }}</AlertDialogTitle
          ><AlertDialogDescription
            >{{ actionRow?.name }} · {{ month }} · {{
              actionType === 'withdraw' ? `第 ${actionRow?.revision} 版` : publishDialogNote(actionRow)
            }}</AlertDialogDescription
          ></AlertDialogHeader
        >
        <div
          v-if="actionType === 'publish' && forcePublish"
          class="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <p class="font-medium">当月考勤{{ ledgerMissing ? '还没有建立台账' : '尚未结账' }}，正常流程是先由考勤管理员完成结账。</p>
          <p class="mt-1">
            继续发布属于「强制发布」：工资条照常发给员工，不用填原因，但会在工资表这一行留下「未结账发布」标记，便于事后核对。
          </p>
          <p v-if="actionRow?.publishedTotals" class="mt-1">这次是订正后再发布：员工会看到新版本，「未结账发布」标记也跟着更新到新版。</p>
        </div>
        <label v-if="actionType === 'withdraw'" for="payroll-withdraw-reason" class="space-y-1.5 text-sm"
          ><span>撤回原因</span
          ><Textarea id="payroll-withdraw-reason" v-model="actionReason" rows="3" aria-label="工资条撤回原因" required
        /></label>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="actionBusy" @click="actionType = ''">取消</AlertDialogCancel
          ><Button
            :disabled="actionBusy || (actionType === 'withdraw' && !actionReason.trim())"
            @click="submitAction"
            >{{
              actionBusy ? '处理中…' : actionType === 'withdraw' ? '确认撤回' : forcePublish ? '强制发布' : '确认发布'
            }}</Button
          ></AlertDialogFooter
        >
      </AlertDialogContent>
    </AlertDialog>

    <Dialog v-model:open="paymentDialogOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader
          ><DialogTitle>{{
            paymentForm.direction === 'payment' ? '登记工资付款' : '登记工资退款'
          }}</DialogTitle></DialogHeader
        >
        <p class="text-xs text-muted-foreground">
          {{ paymentRow?.name }} · {{ month }} · 第{{ paymentRow?.revision }}版
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm"
            >金额（元）<Input
              v-model="paymentForm.amountYuan"
              type="number"
              min="0.01"
              step="0.01"
              aria-label="付款或退款金额（元）"
              required
          /></label>
          <div class="space-y-1 text-sm sm:col-span-2">
            时间<DateTimePicker v-model="paymentForm.paidAt" label="付款或退款时间" />
          </div>
          <label class="space-y-1 text-sm sm:col-span-2"
            >凭证链接（选填）<Input v-model="paymentForm.proofUrl" type="url" aria-label="付款凭证链接"
          /></label>
          <label class="space-y-1 text-sm sm:col-span-2"
            >备注（选填）<Textarea v-model="paymentForm.note" rows="2" aria-label="付款或退款备注"
          /></label>
        </div>
        <DialogFooter
          ><Button variant="outline" :disabled="paymentBusy" @click="paymentDialogOpen = false">取消</Button
          ><Button :disabled="paymentBusy" @click="submitPayment">{{
            paymentBusy ? '保存中…' : '确认登记'
          }}</Button></DialogFooter
        >
      </DialogContent>
    </Dialog>
  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
