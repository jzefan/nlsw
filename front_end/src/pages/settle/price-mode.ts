import type { PriceMode } from './types'

// 车船价格输入方式在库里的表示：0 = 每吨单价，1 = 打包价
// 注意：vessel_price / vehicles[].veh_price 恒存「元/吨」单价，price_mode 只表示录入方式，
// 不参与金额换算（金额一律 = 单价 × 重量）。

export function priceModeFromDb(mode: unknown): PriceMode {
  return Number(mode) === 1 ? 'bale' : 'unit'
}

export function priceModeToDb(mode: PriceMode): number {
  return mode === 'bale' ? 1 : 0
}

// 单价 → 当前输入方式下输入框里该显示的值
export function unitPriceToInput(unitPrice: number, weight: number, mode: PriceMode): string {
  if (!(unitPrice > 0)) {
    return ''
  }
  return mode === 'bale' && weight > 0
    ? (unitPrice * weight).toFixed(2)
    : unitPrice.toString()
}
