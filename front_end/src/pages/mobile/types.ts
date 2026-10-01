import type { Component } from 'vue'

/** 移动端模块首页上的一个入口卡片。 */
export interface HubEntry {
  title: string
  to: string
  icon: Component
  /** 图标前景色，如 text-blue-600 */
  color: string
  /** 图标底色，如 bg-blue-50 dark:bg-blue-900/30 */
  bgColor: string
  /** 待审批数量，仅在 > 0 时显示 */
  count?: number
}

export interface HubGroup {
  /** 不写分组名表示这是页面的主入口，直接展示 */
  label?: string
  items: HubEntry[]
}
