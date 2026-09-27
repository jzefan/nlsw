/**
 * 居民个人「工资、薪金所得」个人所得税 —— 累计预扣预缴法。
 * 依据《国家税务总局关于全面实施新个人所得税法若干征管衔接问题的公告》（2018 年第 61 号）。
 *
 *   累计预扣预缴应纳税所得额 = 累计收入 − 累计免税收入 − 累计减除费用 − 累计专项扣除
 *                              − 累计专项附加扣除 − 累计依法确定的其他扣除
 *   本期应预扣预缴税额 = (累计预扣预缴应纳税所得额 × 预扣率 − 速算扣除数)
 *                        − 累计减免税额 − 累计已预扣预缴税额
 *
 *   累计减除费用 = 5000 元/月 × 纳税人当年截至本月在本单位的任职受雇月份数
 *   累计专项扣除 = 三险一金中个人负担的部分（本系统口径 = 个人社保 + 个人公积金）
 *
 * 本文件是前端唯一的计税口径来源：纯函数、不 import 任何模块，
 * 因此可以直接用 node 跑用例核对（`node front_end/src/utils/income-tax.ts`）。
 * 工资条里的「个人所得税扣款」按这里的结果自动填入，财务仍可手工改写。
 */

/** 预扣率表的一级。金额一律用「分」，与工资条其它金额字段口径一致。 */
export interface WithholdingBracket {
  /** 该级「累计预扣预缴应纳税所得额」的上限（分）；最高一级用 Infinity。 */
  upperCents: number
  /** 预扣率（百分比）。 */
  ratePercent: number
  /** 速算扣除数（分）。 */
  quickDeductionCents: number
}

/** 个人所得税预扣率表一（居民个人工资、薪金所得预扣预缴适用）。 */
export const withholdingBrackets: readonly WithholdingBracket[] = [
  { upperCents: 3_600_000, ratePercent: 3, quickDeductionCents: 0 },
  { upperCents: 14_400_000, ratePercent: 10, quickDeductionCents: 252_000 },
  { upperCents: 30_000_000, ratePercent: 20, quickDeductionCents: 1_692_000 },
  { upperCents: 42_000_000, ratePercent: 25, quickDeductionCents: 3_192_000 },
  { upperCents: 66_000_000, ratePercent: 30, quickDeductionCents: 5_292_000 },
  { upperCents: 96_000_000, ratePercent: 35, quickDeductionCents: 8_592_000 },
  { upperCents: Number.POSITIVE_INFINITY, ratePercent: 45, quickDeductionCents: 18_192_000 },
]

/** 减除费用：5000 元/月（分）。 */
export const MONTHLY_BASIC_DEDUCTION_CENTS = 500_000

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

/** 命中的预扣率级次；应纳税所得额按 0 起算，所以不会是「无级次」。 */
export function withholdingBracketFor(taxableIncomeCents: number): WithholdingBracket {
  const income = nonNegativeInteger(taxableIncomeCents)
  return withholdingBrackets.find(bracket => income <= bracket.upperCents) ?? withholdingBrackets[withholdingBrackets.length - 1]
}

export interface CumulativeTaxInput {
  /** 计税月份（YYYY-MM），仅原样带回，便于界面标注区间。 */
  month: string
  /** 当年截至本月在本单位的任职受雇月份数（含本月），至少按 1 计。 */
  serviceMonths: number
  /** 累计收入（含本月，分）：收入合计 − 病假/事假/旷工扣款，即「合计应发（不含社保公积金）」。 */
  cumulativeIncomeCents: number
  /** 累计专项扣除（含本月，分）：个人社保 + 个人公积金。 */
  cumulativeSpecialDeductionCents: number
  /** 累计专项附加扣除（含本月，分）；本系统暂未采集该项，缺省 0。 */
  cumulativeAdditionalDeductionCents?: number
  /** 累计已预扣预缴税额（**不含**本月，分）。 */
  cumulativeWithheldTaxCents: number
}

export interface CumulativeTaxBreakdown {
  month: string
  serviceMonths: number
  cumulativeIncomeCents: number
  /** 累计减除费用 = 5000 × 任职月数。 */
  cumulativeBasicDeductionCents: number
  cumulativeSpecialDeductionCents: number
  cumulativeAdditionalDeductionCents: number
  cumulativeWithheldTaxCents: number
  /** 累计预扣预缴应纳税所得额（不足 0 按 0 计）。 */
  taxableIncomeCents: number
  /** 命中的预扣率（%）。 */
  ratePercent: number
  quickDeductionCents: number
  /** 累计应纳税额。 */
  cumulativeTaxCents: number
  /** 本月应预扣预缴税额；累计已预扣预缴多于累计应纳税额时不足 0 按 0 计（多扣部分留待年度汇算）。 */
  payableTaxCents: number
}

/** 按累计预扣预缴法算出本月应预扣预缴税额与中间量。 */
export function computeCumulativeIncomeTax(input: CumulativeTaxInput): CumulativeTaxBreakdown {
  const serviceMonths = Math.max(1, nonNegativeInteger(input.serviceMonths))
  const cumulativeIncomeCents = nonNegativeInteger(input.cumulativeIncomeCents)
  const cumulativeSpecialDeductionCents = nonNegativeInteger(input.cumulativeSpecialDeductionCents)
  const cumulativeAdditionalDeductionCents = nonNegativeInteger(input.cumulativeAdditionalDeductionCents)
  const cumulativeWithheldTaxCents = nonNegativeInteger(input.cumulativeWithheldTaxCents)
  const cumulativeBasicDeductionCents = serviceMonths * MONTHLY_BASIC_DEDUCTION_CENTS
  const taxableIncomeCents = Math.max(
    0,
    cumulativeIncomeCents - cumulativeBasicDeductionCents - cumulativeSpecialDeductionCents - cumulativeAdditionalDeductionCents,
  )
  const bracket = withholdingBracketFor(taxableIncomeCents)
  // 金额都是整数分，税率最多两位小数，先乘后除再四舍五入即与「按元计算保留两位小数」等价。
  const cumulativeTaxCents = Math.max(0, Math.round((taxableIncomeCents * bracket.ratePercent) / 100) - bracket.quickDeductionCents)
  return {
    month: input.month,
    serviceMonths,
    cumulativeIncomeCents,
    cumulativeBasicDeductionCents,
    cumulativeSpecialDeductionCents,
    cumulativeAdditionalDeductionCents,
    cumulativeWithheldTaxCents,
    taxableIncomeCents,
    ratePercent: bracket.ratePercent,
    quickDeductionCents: bracket.quickDeductionCents,
    cumulativeTaxCents,
    payableTaxCents: Math.max(0, cumulativeTaxCents - cumulativeWithheldTaxCents),
  }
}
