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

// 显示用取整（去尾零）：15.273238231969941 → "15.273"，500 → "500"
function trimTo(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toString()
}

// 单价（精确值）→ 当前输入方式下输入框里显示的值。
// **只在显示层取整**，精确值本身不变（入库的是精确值）。
export function unitPriceToInput(unitPrice: number, weight: number, mode: PriceMode): string {
  if (!(unitPrice > 0)) {
    return ''
  }
  return mode === 'bale' && weight > 0
    ? trimTo(unitPrice * weight, 2)
    : trimTo(unitPrice, 3)
}

// 输入框里的值 → 单价精确值（保存用）：打包价 ÷ 重量，每吨单价原样。
export function inputToUnitPrice(value: number | string, weight: number, mode: PriceMode): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return mode === 'bale' && weight > 0 ? parsed / weight : parsed
}
