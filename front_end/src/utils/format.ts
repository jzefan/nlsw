/**
 * 通用数字格式化工具
 * - formatNumber: 吨位、金额等固定小数位格式化
 * - formatDim: 尺寸（长、宽、厚）格式化，去除尾部零
 */

/**
 * 格式化数字，保留固定小数位
 * 用于吨位(decimals=3)、金额(decimals=2)等场景
 * @param num 数值（支持 number | string | null | undefined）
 * @param decimals 小数位数，默认3
 * @returns 格式化后的字符串
 */
export function formatNumber(num: number | string | null | undefined, decimals: number = 3): string {
  if (num === null || num === undefined || num === '') return ''
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  if (isNaN(n)) return ''
  return parseFloat(n.toFixed(decimals)).toString()
}

/**
 * 格式化尺寸数值（厚度、宽度、长度）
 * 最多3位小数，去除尾部零：12.500 → 12.5, 8.000 → 8
 * @param num 数值
 * @returns 格式化后的字符串
 */
export function formatDim(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === '') return ''
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  if (isNaN(n)) return ''
  return parseFloat(n.toFixed(3)).toString()
}
