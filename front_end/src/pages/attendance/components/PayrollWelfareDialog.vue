<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Gift } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { getPayrollWelfareHolidays, batchPayrollWelfare, type PayrollStatementRow, type PayrollWelfareHoliday, type PayrollWelfareSummary } from '@/services/api/payroll.api'
import { formatCents, parseYuanToCents } from '@/utils/payroll'

const props = defineProps<{ month: string, rows: PayrollStatementRow[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

/** 选「其他」时的 key；实际可用节日由后端下发，不在前端写死一份。 */
const OTHER_KEY = 'other'

const holidays = ref<PayrollWelfareHoliday[]>([])
const holidaysError = ref(false)
const loadingHolidays = ref(false)
const holiday = ref('')
const customLabel = ref('')
const amountYuan = ref('')
const saving = ref(false)
const result = ref<PayrollWelfareSummary | null>(null)

const needsCustomLabel = computed(() => holiday.value === OTHER_KEY)

/** 当月已有工资数据的人数：批量福利只动这些人的草稿，缺数据的按 0 起底新建。 */
const existingCount = computed(() => props.rows.filter(row => row.statementStatus !== 'missing').length)

/** 各员工本月已录的节日福利，用来提示「这次会覆盖哪个节日」。 */
const existingByHoliday = computed(() => {
  const map = new Map<string, { amountCents: number, count: number }>()
  for (const row of props.rows) {
    for (const item of row.welfareItems || []) {
      const key = item.holiday === OTHER_KEY ? item.holidayLabel : item.holiday
      const current = map.get(key) || { amountCents: 0, count: 0 }
      current.amountCents += item.amountCents
      current.count += 1
      map.set(key, current)
    }
  }
  return map
})

const currentEntry = computed(() => existingByHoliday.value.get(holiday.value === OTHER_KEY ? customLabel.value.trim() : holiday.value))
/** 本次是覆盖该节日已有的金额（而不是新增一笔），提示财务改口时不会变成累加。 */
const willReplace = computed(() => Boolean(currentEntry.value && currentEntry.value.count > 0))

const amountCents = computed(() => parseYuanToCents(amountYuan.value))
const amountInvalid = computed(() => amountYuan.value.trim() !== '' && amountCents.value === null)

const canSubmit = computed(() => Boolean(holiday.value) && amountCents.value !== null && amountCents.value >= 0 && !saving.value && (!needsCustomLabel.value || customLabel.value.trim().length > 0))

async function loadHolidays() {
  if (holidays.value.length || loadingHolidays.value) return
  loadingHolidays.value = true
  holidaysError.value = false
  try {
    const response = await getPayrollWelfareHolidays()
    holidays.value = response.data?.holidays || []
    if (!holiday.value && holidays.value.length) holiday.value = holidays.value[0]!.key
    if (!holidays.value.length) holidaysError.value = true
  }
  catch {
    holidaysError.value = true
  }
  finally { loadingHolidays.value = false }
}

function reset() {
  holiday.value = holidays.value[0]?.key || ''
  customLabel.value = ''
  amountYuan.value = ''
  result.value = null
}

function showError(error: unknown, fallback: string) {
  const value = error as { response?: { data?: { message?: string, error?: string } }, message?: string }
  toast.error(value?.response?.data?.message || value?.response?.data?.error || value?.message || fallback)
}

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    const response = await batchPayrollWelfare(props.month, {
      holiday: holiday.value,
      ...(needsCustomLabel.value ? { holidayLabel: customLabel.value.trim() } : {}),
      amountCents: amountCents.value!,
    })
    if (response.ok === false || !response.data) throw new Error(String(response.error || '批量录入福利失败'))
    result.value = response.data
    if (response.data.failed) toast.error(`录入完成：成功 ${response.data.succeeded} 人，失败 ${response.data.failed} 人`)
    else toast.success(`已给 ${response.data.succeeded} 人记入${response.data.holidayLabel}福利 ${formatCents(response.data.amountCents)}`)
    emit('saved')
  }
  catch (error) { showError(error, '批量录入福利失败') }
  finally { saving.value = false }
}

watch(open, value => { if (value) { reset(); void loadHolidays() } })
onMounted(() => { if (open.value) void loadHolidays() })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>批量福利 · {{ month }}</DialogTitle>
        <DialogDescription>给当月全体员工记一笔节日福利，金额相同。录完是草稿，核对后再发布。</DialogDescription>
      </DialogHeader>

      <div v-if="holidaysError" class="rounded-md border border-destructive/40 px-3 py-4 text-center text-sm text-destructive">
        节日清单读取失败。<Button class="mt-2" size="sm" variant="outline" @click="holidays = []; loadHolidays()">重试</Button>
      </div>

      <div v-else class="space-y-3">
        <!--
          标签右对齐 + 控件同宽同行：
          - Label 组件自身是 flex，text-align 对 flex 内容无效，必须用 justify-end；
          - 标签列取 max-content：固定宽度装不下「每人金额（元）」的 7 个全角字，会换行导致看起来没对齐；
            列宽跟着最长的标签走，各行右边缘自然齐平。
        -->
        <div class="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <Label for="welfare-holiday" class="justify-end">节日</Label>
          <!-- NativeSelect 的 class 加在内层 select 上，外层 wrapper 是 w-fit，要从父级把它拉满才能与输入框同宽 -->
          <div class="[&>[data-slot=native-select-wrapper]]:w-full">
            <NativeSelect id="welfare-holiday" v-model="holiday" class="h-9" :disabled="loadingHolidays || saving">
              <NativeSelectOption v-for="item in holidays" :key="item.key" :value="item.key">{{ item.label }}</NativeSelectOption>
            </NativeSelect>
          </div>

          <template v-if="needsCustomLabel">
            <Label for="welfare-custom" class="justify-end">节日名称</Label>
            <Input id="welfare-custom" v-model="customLabel" maxlength="20" placeholder="如：开业纪念日" class="h-9" />
          </template>

          <Label for="welfare-amount" class="justify-end">每人金额（元）</Label>
          <Input id="welfare-amount" v-model="amountYuan" inputmode="decimal" placeholder="0.00" class="h-9 tabular-nums" :aria-invalid="amountInvalid" />
        </div>
        <p v-if="amountInvalid" class="text-xs text-destructive">金额最多两位小数，且不能为负</p>

        <p v-if="willReplace" class="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          本月已有 {{ currentEntry?.count }} 人记了「{{ holidays.find(item => item.key === holiday)?.label || customLabel }}」福利
          （原每人 {{ formatCents(currentEntry?.amountCents) }}）。这次会覆盖原金额，不会累加。
        </p>

        <p class="text-xs text-muted-foreground">
          范围：{{ month }} 全体在职员工（{{ existingCount }} 人已有工资数据）。福利计入收入合计与实发金额。
        </p>

        <div v-if="result" class="space-y-1 rounded-md border px-3 py-2 text-xs">
          <div class="font-medium">
            录入结果：成功 {{ result.succeeded }} 人，失败 {{ result.failed }} 人
            <span v-if="result.overwrittenPublished" class="ml-1 font-normal text-amber-700 dark:text-amber-400">（{{ result.overwrittenPublished }} 人需重新发布）</span>
            <span v-if="result.created" class="ml-1 font-normal text-muted-foreground">（新建 {{ result.created }} 条工资草稿）</span>
          </div>
          <ul v-if="result.results.some(item => item.status === 'failed')" class="list-disc pl-4 text-muted-foreground">
            <li v-for="item in result.results.filter(row => row.status === 'failed')" :key="item.employeeId">{{ item.name || item.employeeId }}：{{ item.error }}</li>
          </ul>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="saving" @click="open = false">关闭</Button>
        <Button :disabled="!canSubmit || holidaysError" @click="submit"><Gift class="mr-1.5 size-4" />{{ saving ? '录入中…' : '录入' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
