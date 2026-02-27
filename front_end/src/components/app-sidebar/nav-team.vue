<script lang="ts" setup>
import {
  ChevronRight,
} from 'lucide-vue-next'

import { useSidebar } from '@/components/ui/sidebar'

import type { NavGroup, NavItem } from './types'

const { navMain } = defineProps<{
  navMain: NavGroup[]
}>()

const route = useRoute()

const { state, isMobile } = useSidebar()

// 比较URL时考虑查询参数
function matchUrl(menuUrl: string | undefined, currentFullPath: string): boolean {
  if (!menuUrl) return false

  // 如果菜单URL包含查询参数，需要完全匹配
  if (menuUrl.includes('?')) {
    return currentFullPath === menuUrl
  }

  // 如果菜单URL不包含查询参数
  // 只有在当前URL也不包含查询参数时才匹配
  const currentPath = currentFullPath.split('?')[0]
  const hasQueryParams = currentFullPath.includes('?')

  if (hasQueryParams) {
    return false  // 当前URL有查询参数，但菜单URL没有，不匹配
  }

  return currentPath === menuUrl
}

function isCollapsed(menu: NavItem): boolean {
  const currentFullPath = route.fullPath
  navMain.forEach((group) => {
    group.items.forEach((item) => {
      if (matchUrl(item.url, currentFullPath)) {
        return true
      }
    })
  })
  return !!menu.items?.some(item => matchUrl(item.url, currentFullPath))
}

function isActive(menu: NavItem): boolean {
  const currentFullPath = route.fullPath
  if (menu.url) {
    return matchUrl(menu.url, currentFullPath)
  }
  return !!menu.items?.some(item => matchUrl(item.url, currentFullPath))
}
</script>

<template>
  <UiSidebarGroup v-for="group in navMain" :key="group.title">
    <UiSidebarGroupLabel>{{ group.title }}</UiSidebarGroupLabel>
    <UiSidebarMenu>
      <template v-for="menu in group.items" :key="menu.title">
        <UiSidebarMenuItem v-if="!menu.items">
          <UiSidebarMenuButton as-child :is-active="isActive(menu)" :tooltip="menu.title">
            <router-link :to="menu.url">
              <component :is="menu.icon" />
              <span>{{ menu.title }}</span>
            </router-link>
          </UiSidebarMenuButton>
        </UiSidebarMenuItem>

        <UiSidebarMenuItem v-else>
          <!-- sidebar expanded -->
          <UiCollapsible
            v-if="state !== 'collapsed' || isMobile"
            as-child :default-open="isCollapsed(menu)"
            class="group/collapsible"
          >
            <UiSidebarMenuItem>
              <UiCollapsibleTrigger as-child>
                <UiSidebarMenuButton :tooltip="menu.title">
                  <component :is="menu.icon" v-if="menu.icon" />
                  <span>{{ menu.title }}</span>
                  <ChevronRight
                    class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                  />
                </UiSidebarMenuButton>
              </UiCollapsibleTrigger>
            </UiSidebarMenuItem>
            <UiCollapsibleContent>
              <UiSidebarMenuSub>
                <UiSidebarMenuSubItem v-for="subItem in menu.items" :key="subItem.title">
                  <UiSidebarMenuSubButton as-child :is-active="isActive(subItem as NavItem)">
                    <router-link :to="subItem?.url || '/'">
                      <component :is="subItem.icon" v-if="subItem.icon" />
                      <span>{{ subItem.title }}</span>
                    </router-link>
                  </UiSidebarMenuSubButton>
                </UiSidebarMenuSubItem>
              </UiSidebarMenuSub>
            </UiCollapsibleContent>
          </UiCollapsible>

          <!-- sidebar collapsed -->
          <UiDropdownMenu v-else>
            <UiDropdownMenuTrigger as-child>
              <UiSidebarMenuButton :tooltip="menu.title">
                <component :is="menu.icon" v-if="menu.icon" />
                <span>{{ menu.title }}</span>
              </UiSidebarMenuButton>
            </UiDropdownMenuTrigger>
            <UiDropdownMenuContent align="start" side="right">
              <UiDropdownMenuLabel>{{ menu.title }}</UiDropdownMenuLabel>
              <UiDropdownMenuSeparator />
              <UiDropdownMenuItem v-for="subItem in menu.items" :key="subItem.title" as-child>
                <router-link :to="subItem?.url || '/'">
                  <component :is="subItem.icon" v-if="subItem.icon" />
                  <span>{{ subItem.title }}</span>
                </router-link>
              </UiDropdownMenuItem>
            </UiDropdownMenuContent>
          </UiDropdownMenu>
        </UiSidebarMenuItem>
      </template>
    </UiSidebarMenu>
  </UiSidebarGroup>
</template>
