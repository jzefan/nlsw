<script setup lang="ts">
import { computed } from 'vue'

import {
  payslipColumns,
  payrollAttendanceDeductionKeys,
  payrollEmployeeDeductionKeys,
  payrollEmployerContributionKeys,
  payrollIncomeKeys,
  payrollTotalsLabels,
} from '@/constants/payroll-fields'
import type { PayrollComponents, PayrollTotals } from '@/services/api/payroll.api'
import { formatCents } from '@/utils/payroll'

/**
 * 工资条的小票样式（参考超市购物小票：纸色底 + 虚线分隔 + 点线引导 + 撕边）。
 * 字段口径全部取自 constants/payroll-fields.ts，这里只负责分组与排版，不重算金额。
 */
const props = withDefaults(defineProps<{
  /** 纸头标题后缀，标题实际印作「{姓名}{title}」 */
  title?: string
  /** 纸头期间，如「2026 年 10 月」 */
  period?: string | null
  name: string
  employeeNo?: string | null
  department?: string | null
  components?: PayrollComponents | null
  totals?: PayrollTotals | null
  /** 底部留存联文案 */
  stubLabel?: string
}>(), {
  title: '工资条',
  period: null,
  employeeNo: null,
  department: null,
  components: null,
  totals: null,
  stubLabel: '员工留存联',
})

/** 姓名直接印在标题上（「张三工资条」），下面就不再重复列姓名。 */
const headerTitle = computed(() => {
  if (!props.name) return props.title
  // 拉丁/数字结尾的姓名补一个空格，避免「Zefan JIANG工资条」粘连
  const gap = /[0-9A-Za-z]$/.test(props.name) ? ' ' : ''
  return `${props.name}${gap}${props.title}`
})

/** 明细项名称沿用工资条列定义，避免两处写两套中文名。 */
function labelOf(key: keyof PayrollComponents) {
  return payslipColumns.find(column => column.key === key)?.label ?? key
}

function rowsOf(keys: readonly (keyof PayrollComponents)[]) {
  return keys.map(key => ({ key, label: labelOf(key), value: props.components?.[key] }))
}

const incomeRows = computed(() => rowsOf(payrollIncomeKeys))
const leaveRows = computed(() => rowsOf(payrollAttendanceDeductionKeys))
const personalRows = computed(() => rowsOf(payrollEmployeeDeductionKeys))
const employerRows = computed(() => rowsOf(payrollEmployerContributionKeys))

/** 纸头下方只留工号与部门；姓名已进标题，发布日期不再印在小票上。 */
const metaRows = computed(() => [
  { label: '工号', value: props.employeeNo },
  { label: '部门', value: props.department },
].filter(row => row.value))
</script>

<template>
  <div class="receipt-shadow mx-auto w-full max-w-sm">
    <article class="receipt font-mono [--receipt-paper:#f8f4ea] [--receipt-ink:#23201c] dark:[--receipt-paper:#221f1c] dark:[--receipt-ink:#eae5dc]">
      <header class="text-center">
        <h3 class="text-base font-bold tracking-[0.18em]">{{ headerTitle }}</h3>
        <p v-if="period" class="mt-1 text-xs receipt-quiet">{{ period }}</p>
      </header>

      <div class="receipt-rule" />

      <template v-if="metaRows.length">
        <dl class="space-y-1">
          <div v-for="row in metaRows" :key="row.label" class="receipt-line">
            <dt class="receipt-quiet">{{ row.label }}</dt>
            <span class="receipt-leader" />
            <dd class="min-w-0 text-right">{{ row.value }}</dd>
          </div>
        </dl>

        <div class="receipt-rule" />
      </template>

      <div class="text-center">
        <p class="text-xs receipt-quiet">{{ payrollTotalsLabels.netPayCents }}</p>
        <p class="mt-0.5 text-3xl font-bold tracking-tight tabular-nums">{{ formatCents(totals?.netPayCents) }}</p>
        <p class="mt-1 text-[10px] receipt-quiet">已扣除个人社保、公积金与个税</p>
      </div>

      <div class="receipt-rule" />

      <p class="receipt-section">收入</p>
      <div v-for="row in incomeRows" :key="row.key" class="receipt-line">
        <span class="receipt-quiet">{{ row.label }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(row.value) }}</span>
      </div>
      <div class="receipt-line receipt-line--total">
        <span>{{ payrollTotalsLabels.incomeSubtotalCents }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(totals?.incomeSubtotalCents) }}</span>
      </div>

      <div class="receipt-rule" />

      <p class="receipt-section">请假与旷工扣款</p>
      <div v-for="row in leaveRows" :key="row.key" class="receipt-line">
        <span class="receipt-quiet">{{ row.label }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(row.value) }}</span>
      </div>
      <div class="receipt-line receipt-line--total">
        <span>{{ payrollTotalsLabels.attendanceDeductionCents }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(totals?.attendanceDeductionCents) }}</span>
      </div>
      <div class="receipt-line receipt-line--total">
        <span>{{ payrollTotalsLabels.payableBeforePersonalDeductionsCents }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(totals?.payableBeforePersonalDeductionsCents) }}</span>
      </div>

      <div class="receipt-rule" />

      <p class="receipt-section">个人扣款</p>
      <div v-for="row in personalRows" :key="row.key" class="receipt-line">
        <span class="receipt-quiet">{{ row.label }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(row.value) }}</span>
      </div>

      <div class="receipt-rule" />

      <p class="receipt-section">公司承担（不计入实发）</p>
      <div v-for="row in employerRows" :key="row.key" class="receipt-line">
        <span class="receipt-quiet">{{ row.label }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(row.value) }}</span>
      </div>
      <div class="receipt-line receipt-line--total">
        <span>{{ payrollTotalsLabels.totalCompensationCents }}</span>
        <span class="receipt-leader" />
        <span class="receipt-amount">{{ formatCents(totals?.totalCompensationCents) }}</span>
      </div>

      <div class="receipt-rule" />

      <footer class="text-center text-[10px] leading-5 receipt-quiet">
        <p>本单由系统生成，与工资表口径一致</p>
        <p>— {{ stubLabel }} —</p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* 纸色与墨色由模板上的 [--receipt-paper] / [--receipt-ink] 提供（含 dark: 变体）：
   scoped 样式里的 :global(.dark) 会被编译器丢掉（实测编译产物里没有这条规则），所以走 Tailwind 变量。 */
.receipt {
  --receipt-tear: 4px;
  padding: 1.1rem 1.15rem 1.35rem;
  color: var(--receipt-ink);
  background-color: var(--receipt-paper);
  /* 左右与下沿的撕齿：四层取交集，从矩形里挖掉半圆缺口。
     浏览器不支持 mask-composite 时退化成矩形，不影响可读性。 */
  -webkit-mask-image:
    radial-gradient(circle var(--receipt-tear) at 1px 50%, transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    radial-gradient(circle var(--receipt-tear) at calc(100% - 1px) 50%, transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    radial-gradient(circle var(--receipt-tear) at 50% calc(100% - 1px), transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    linear-gradient(#000, #000);
  -webkit-mask-size: 100% 10px, 100% 10px, 10px 100%, 100% 100%;
  -webkit-mask-repeat: repeat-y, repeat-y, repeat-x, no-repeat;
  -webkit-mask-composite: source-in;
  mask-image:
    radial-gradient(circle var(--receipt-tear) at 1px 50%, transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    radial-gradient(circle var(--receipt-tear) at calc(100% - 1px) 50%, transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    radial-gradient(circle var(--receipt-tear) at 50% calc(100% - 1px), transparent calc(var(--receipt-tear) - 0.5px), #000 var(--receipt-tear)),
    linear-gradient(#000, #000);
  mask-size: 100% 10px, 100% 10px, 10px 100%, 100% 100%;
  mask-repeat: repeat-y, repeat-y, repeat-x, no-repeat;
  mask-composite: intersect;
}

/* 阴影挂在外面：mask 在元素自身生效，若把 filter 放在同一元素上会被裁掉 */
.receipt-shadow {
  filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.1));
}

.receipt-quiet {
  color: color-mix(in oklab, var(--receipt-ink) 62%, transparent);
}

/* 细虚线分隔块 */
.receipt-rule {
  margin: 0.7rem 0;
  border-top: 1px dashed color-mix(in oklab, var(--receipt-ink) 34%, transparent);
}

/* 分组标题：小号加字距、居中 */
.receipt-section {
  margin-bottom: 0.15rem;
  font-size: 0.6875rem;
  letter-spacing: 0.12em;
  text-align: center;
  color: color-mix(in oklab, var(--receipt-ink) 62%, transparent);
}

/* 一行：标签 + 点线引导 + 金额（金额定宽右对齐，各行的点线才会停在同一条竖线上） */
.receipt-line {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-size: 0.6875rem;
  line-height: 1.5rem;
}

.receipt-line--total {
  font-weight: 600;
}

.receipt-amount {
  flex: none;
  width: 5.5rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.receipt-leader {
  flex: 1;
  min-width: 0.75rem;
  align-self: center;
  border-bottom: 1px dotted color-mix(in oklab, var(--receipt-ink) 30%, transparent);
}
</style>
