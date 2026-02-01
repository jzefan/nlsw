import type { LucideProps } from 'lucide-vue-next'
import type { FunctionalComponent } from 'vue'

type NavIcon = FunctionalComponent<LucideProps, Record<any, any>, any, Record<any, any>>

interface BaseNavItem {
  title: string
  icon?: NavIcon
}

// 权限检查函数类型
export type PrivilegeCheck = (privilege: string) => boolean

export type NavItem
  = | BaseNavItem & {
    items: (BaseNavItem & { url?: string, privilegeCheck?: PrivilegeCheck })[]
    url?: never
    isActive?: boolean
    privilegeCheck?: PrivilegeCheck
  } | BaseNavItem & {
    url: string
    items?: never
    privilegeCheck?: PrivilegeCheck
  }

export interface NavGroup {
  title: string
  items: NavItem[]
  privilegeCheck?: PrivilegeCheck
}

export interface User {
  name: string
  avatar: string
  email: string
}

export interface Team {
  name: string
  logo: NavIcon
  plan: string
}

export interface SidebarData {
  user: User
  teams: Team[]
  navMain: NavGroup[]
}
