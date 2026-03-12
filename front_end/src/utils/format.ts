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

/**
 * 格式化日期，智能显示日期或日期时间
 * 当时间为 00:00:00 时只显示日期，否则显示完整日期时间
 * @param date 日期值
 * @param fallback 空值时的返回值，默认 '-'
 * @returns 格式化后的字符串
 */
export function formatDate(date: string | Date | null | undefined, fallback: string = '-'): string {
  if (!date) return fallback
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return fallback
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  if (h === '00' && min === '00' && s === '00') return `${y}-${m}-${day}`
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

/**
 * 将日期字符串转换为 Date 对象（用于 Excel 导出）
 * @param dateStr 日期字符串
 * @returns Date 对象或空字符串
 */
export function toExcelDate(dateStr: string | Date | null | undefined): Date | string {
  if (!dateStr) return ''
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  // ExcelJS 按 UTC 格式化日期，需补偿时区偏移以确保显示北京时间
  const offsetMs = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - offsetMs)
}

/**
 * 将数值转为导出用的数字（null/undefined 返回空字符串，其他保持原值）
 * @param num 数值
 * @returns 原始数字或空字符串
 */
export function toExcelNum(num: number | string | null | undefined): number | string {
  if (num === null || num === undefined || num === '') return ''
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  if (isNaN(n)) return ''
  return n
}

/**
 * 按订单号排序（order_no 字母顺序，order_item_no 数字顺序）
 */
export function sortByOrder<T extends { order_no?: string; order_item_no?: number | string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const orderCmp = (a.order_no || '').localeCompare(b.order_no || '')
    if (orderCmp !== 0) return orderCmp
    return (Number(a.order_item_no) || 0) - (Number(b.order_item_no) || 0)
  })
}
