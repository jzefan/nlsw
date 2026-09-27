<script setup lang="ts">
import type { PayrollTaxBasisMonth } from '@/services/api/payroll.api'
import type { CumulativeTaxBreakdown } from '@/utils/income-tax'
import { AlertCircle, ChevronDown, Info, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { withholdingBracketFor, withholdingBrackets } from '@/utils/income-tax'
import { formatCents } from '@/utils/payroll'

const props = defineProps<{
  /** 按累计预扣预缴法算出的过程；收入等项目没填完整时为 null。 */
  breakdown: CumulativeTaxBreakdown | null
  /** 本年度往月各月明细（不含本月）。 */
  months: PayrollTaxBasisMonth[]
  /** 往月累计数据读取中。 */
  loading: boolean
  /** 往月累计数据读取失败。 */
  error: boolean
  /** 财务已手工改过个税输入框，当前值不再等于规则值。 */
  overridden: boolean
  /** 个税输入框里当前的金额（分）；无法解析时为 null。 */
  appliedTaxCents: number | null
}>()

const emit = defineEmits<{ recalculate: [], retry: [] }>()

const detailOpen = ref(false)
const bracketOpen = ref(false)

/** 命中预扣率表的哪一级，用于在税率表里高亮。 */
const activeBracket = computed(() => props.breakdown ? withholdingBracketFor(props.breakdown.taxableIncomeCents) : null)

/** 税率表每一级的区间文案（元）。 */
const bracketRows = computed(() => withholdingBrackets.map((bracket, index) => {
  const lower = index === 0 ? null : withholdingBrackets[index - 1].upperCents
  const upper = bracket.upperCents
  const range = !Number.isFinite(upper)
    ? `超过 ${formatYuan(lower)} 元`
    : lower === null
      ? `不超过 ${formatYuan(upper)} 元`
      : `${formatYuan(lower)} 元 ~ ${formatYuan(upper)} 元`
  return { range, ratePercent: bracket.ratePercent, quickDeductionCents: bracket.quickDeductionCents, active: bracket === activeBracket.value }
}))

/**
 * 各月明细：往月取后端给的金额，本月用「累计 − 往月合计」倒算出当前输入值对应的贡献，
 * 末尾加一行本月，方便逐月核对累计数是怎么来的。
 */
const detailRows = computed(() => {
  const rows = props.months.map(item => ({ ...item, current: false }))
  const breakdown = props.breakdown
  if (!breakdown) return rows
  const historyIncome = rows.reduce((sum, row) => sum + row.incomeCents, 0)
  const historySpecial = rows.reduce((sum, row) => sum + row.specialDeductionCents, 0)
  rows.push({
    month: breakdown.month,
    source: 'draft' as const,
    incomeCents: breakdown.cumulativeIncomeCents - historyIncome,
    specialDeductionCents: breakdown.cumulativeSpecialDeductionCents - historySpecial,
    incomeTaxCents: breakdown.payableTaxCents,
    current: true,
  })
  return rows
})

const historyRange = computed(() => {
  const breakdown = props.breakdown
  if (!breakdown) return ''
  const months = props.months.map(item => item.month)
  return months.length ? `${months[0]} ~ ${months[months.length - 1]}` : ''
})

function formatYuan(cents: number | null) {
  if (cents === null) return '—'
  return (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="个人所得税是怎么算的"
        @click.stop
      >
        <Info class="size-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="max-h-[70vh] w-[23rem] overflow-y-auto p-3 text-xs leading-relaxed" align="start" :side-offset="6">
      <div class="space-y-3">
        <div>
          <h3 class="text-sm font-semibold">个人所得税 · 累计预扣预缴法</h3>
          <p class="mt-0.5 text-muted-foreground">
            工资、薪金所得按累计预扣预缴法计算：把本年 1 月起到本月的收入、减除费用、个人社保公积金全部累计起来算应纳多少，
            再减去前几个月已经扣过的，差额就是本月要扣的金额。所以同样月薪跨过税率档后，后面月份的个税会比前面高。
          </p>
        </div>

        <div v-if="loading" class="rounded-md border border-dashed py-3 text-center text-muted-foreground">
          正在读取本年度累计数据…
        </div>

        <div v-else-if="error" class="rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <div class="flex items-start gap-1.5 text-destructive">
            <AlertCircle class="mt-px size-3.5 shrink-0" />
            <span>本年度累计数据读取失败，个税没有自动计算，请手工填写或重试。</span>
          </div>
          <Button class="mt-2 h-7 px-2" size="sm" variant="outline" @click="emit('retry')">
            重新读取
          </Button>
        </div>

        <div v-else-if="!breakdown" class="rounded-md border border-dashed py-3 text-center text-muted-foreground">
          收入、社保公积金等项目填写完整后即可算出个税。
        </div>

        <template v-else>
          <div class="space-y-1.5">
            <div class="text-muted-foreground">计算过程（{{ breakdown.month }}）</div>
            <div class="space-y-1 rounded-md border bg-muted/30 p-2 tabular-nums">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">累计收入</span><span>{{ formatCents(breakdown.cumulativeIncomeCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">减：累计减除费用（5000 × {{ breakdown.serviceMonths }} 个月）</span><span>−{{ formatCents(breakdown.cumulativeBasicDeductionCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">减：累计专项扣除（个人社保、公积金）</span><span>−{{ formatCents(breakdown.cumulativeSpecialDeductionCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">减：累计专项附加扣除</span><span>−{{ formatCents(breakdown.cumulativeAdditionalDeductionCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2 border-t pt-1 font-medium">
                <span>累计应纳税所得额</span><span>{{ formatCents(breakdown.taxableIncomeCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">适用预扣率 / 速算扣除数</span><span>{{ breakdown.ratePercent }}% / {{ formatCents(breakdown.quickDeductionCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">累计应纳税额</span><span>{{ formatCents(breakdown.cumulativeTaxCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-muted-foreground">减：本年已预扣预缴<template v-if="historyRange">（{{ historyRange }}）</template></span><span>−{{ formatCents(breakdown.cumulativeWithheldTaxCents) }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-2 border-t pt-1 font-medium">
                <span>本月应预扣预缴</span><span>{{ formatCents(breakdown.payableTaxCents) }}</span>
              </div>
            </div>
          </div>

          <div v-if="overridden" class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
            <div class="flex items-start gap-1.5">
              <AlertCircle class="mt-px size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>个税已手工改为 {{ formatCents(appliedTaxCents) }}，与按规则算出的 {{ formatCents(breakdown.payableTaxCents) }} 不一致。</span>
            </div>
            <Button class="h-7 px-2" size="sm" variant="outline" @click="emit('recalculate')">
              <RotateCcw class="mr-1 size-3.5" />按规则重算
            </Button>
          </div>

          <Collapsible v-model:open="detailOpen" class="rounded-md border">
            <CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 font-medium">
              <span>各月明细（{{ detailRows.length }} 个月）</span>
              <ChevronDown class="size-3.5 shrink-0 transition-transform" :class="detailOpen ? 'rotate-180' : ''" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="overflow-x-auto px-2 pb-2">
                <table class="w-full tabular-nums">
                  <thead>
                    <tr class="text-left text-muted-foreground">
                      <th class="py-1 pr-1 font-normal">月份</th>
                      <th class="py-1 pr-1 text-right font-normal">收入</th>
                      <th class="py-1 pr-1 text-right font-normal">个人社保公积金</th>
                      <th class="py-1 text-right font-normal">已扣个税</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in detailRows" :key="row.month" class="border-t border-border/50">
                      <td class="py-1 pr-1 whitespace-nowrap">
                        {{ row.month }}
                        <span v-if="row.current" class="text-muted-foreground">（录入中）</span>
                        <span v-else-if="row.source === 'draft'" class="text-muted-foreground">（草稿）</span>
                      </td>
                      <td class="py-1 pr-1 text-right whitespace-nowrap">{{ formatCents(row.incomeCents) }}</td>
                      <td class="py-1 pr-1 text-right whitespace-nowrap">{{ formatCents(row.specialDeductionCents) }}</td>
                      <td class="py-1 text-right whitespace-nowrap">{{ formatCents(row.incomeTaxCents) }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="detailRows.some(row => row.source === 'draft' && !row.current)" class="mt-1.5 text-muted-foreground">
                  标注「草稿」的月份还没发布，按草稿金额计入累计；发布后金额若有变化，个税会跟着变。
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible v-model:open="bracketOpen" class="rounded-md border">
            <CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1.5 font-medium">
              <span>个人所得税预扣率表（当前命中 {{ breakdown.ratePercent }}%）</span>
              <ChevronDown class="size-3.5 shrink-0 transition-transform" :class="bracketOpen ? 'rotate-180' : ''" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="overflow-x-auto px-2 pb-2">
                <table class="w-full tabular-nums">
                  <thead>
                    <tr class="text-left text-muted-foreground">
                      <th class="py-1 pr-1 font-normal">累计预扣预缴应纳税所得额</th>
                      <th class="py-1 pr-1 text-right font-normal">预扣率</th>
                      <th class="py-1 text-right font-normal">速算扣除数</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in bracketRows" :key="row.range" class="border-t border-border/50" :class="row.active ? 'bg-primary/10 font-medium' : ''">
                      <td class="py-1 pr-1 whitespace-nowrap">{{ row.range }}</td>
                      <td class="py-1 pr-1 text-right whitespace-nowrap">{{ row.ratePercent }}%</td>
                      <td class="py-1 text-right whitespace-nowrap">{{ formatCents(row.quickDeductionCents) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <p class="text-muted-foreground">
            口径：累计收入 = 收入合计 − 病假/事假/旷工扣款；累计专项扣除 = 个人社保 + 个人公积金；
            累计减除费用 = 5000 元/月 × 当年截至本月在本单位的任职受雇月份数（本系统按「本年度首个有工资条的月份起连续计到本月」，
            本年度还没有往月工资条时按 1 个月计）。专项附加扣除（子女教育、住房贷款利息、赡养老人等）本系统暂未采集，按 0 计。
            已撤回且没有草稿的月份没有有效金额，不计入累计。计算结果仅供参考，多扣少扣可在年度汇算清缴时调整。
          </p>
        </template>
      </div>
    </PopoverContent>
  </Popover>
</template>
