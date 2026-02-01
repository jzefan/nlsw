<script setup lang="ts">
import { useCookies } from '@vueuse/integrations/useCookies'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AppSidebar from '@/components/app-sidebar/index.vue'
import ThemePopover from '@/components/custom-theme/theme-popover.vue'
import ToggleTheme from '@/components/toggle-theme.vue'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar/utils'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const defaultOpen = useCookies([SIDEBAR_COOKIE_NAME])
const themeStore = useThemeStore()
const { contentLayout } = storeToRefs(themeStore)
const route = useRoute()

// 路由到面包屑的映射
const routeMap: Record<string, { parent?: string, title: string }> = {
  '/dashboard': { title: '首页' },
  '/plans': { parent: '业务操作', title: '计划列表' },
  '/plans/create': { parent: '业务操作', title: '新建计划' },
  '/bills/create': { parent: '提单管理', title: '新建提单' },
  '/bills/edit': { parent: '提单管理', title: '修改提单' },
  '/bills/delete': { parent: '提单管理', title: '删除提单' },
  '/bills/search': { parent: '提单管理', title: '查询' },
  '/invoices/create': { parent: '运单管理', title: '配发货' },
  '/invoices/edit': { parent: '运单管理', title: '修改运单' },
  '/invoices/delete': { parent: '运单管理', title: '删除运单' },
  '/settle/bill': { parent: '结算管理', title: '结算' },
  '/settle/ticket': { parent: '结算管理', title: '开票' },
  '/settle/money': { parent: '结算管理', title: '回款' },
  '/settle/vessel': { parent: '结算管理', title: '车船结算' },
  '/reports/integrated': { parent: '报表统计', title: '综合查询' },
  '/reports/invoice': { parent: '报表统计', title: '运单报表' },
  '/reports/customer-revenue': { parent: '报表统计', title: '客户营业额' },
  '/reports/vessel-revenue': { parent: '报表统计', title: '车船营业额' },
  '/reports/shipping-charge': { parent: '报表统计', title: '运输价格报表' },
  '/data/vehicles': { parent: '数据字典', title: '车船号' },
  '/data/companies': { parent: '数据字典', title: '发货单位' },
  '/data/warehouses': { parent: '数据字典', title: '仓库' },
  '/data/destinations': { parent: '数据字典', title: '目的地' },
  '/data/brands': { parent: '数据字典', title: '牌号' },
  '/data/sale-deps': { parent: '数据字典', title: '销售部门' },
}

// 计算面包屑（不包括首页，首页在模板中固定显示）
const breadcrumbs = computed(() => {
  const path = route.path
  const info = routeMap[path]

  // 首页不需要额外的面包屑
  if (!info || path === '/dashboard') {
    return []
  }

  const items: { title: string, path?: string }[] = []

  if (info.parent) {
    items.push({ title: info.parent })
  }

  items.push({ title: info.title })

  return items
})
</script>

<template>
  <UiSidebarProvider :default-open="defaultOpen.get(SIDEBAR_COOKIE_NAME)">
    <AppSidebar />
    <UiSidebarInset class="w-full max-w-full peer-data-[state=collapsed]:w-[calc(100%-var(--sidebar-width-icon)-1rem)] peer-data-[state=expanded]:w-[calc(100%-var(--sidebar-width))]">
      <header
        class="flex items-center gap-3 sm:gap-4 h-12 px-4 shrink-0 transition-[width,height] ease-linear border-b"
      >
        <UiSidebarTrigger class="-ml-1" />
        <UiSeparator orientation="vertical" class="h-4" />

        <!-- 面包屑 -->
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">
                首页
              </BreadcrumbLink>
            </BreadcrumbItem>
            <template v-for="(item, index) in breadcrumbs" :key="index">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage v-if="index === breadcrumbs.length - 1">
                  {{ item.title }}
                </BreadcrumbPage>
                <BreadcrumbLink v-else :href="item.path">
                  {{ item.title }}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>

        <div class="flex-1" />
        <div class="ml-auto flex items-center space-x-4">
          <ToggleTheme />
          <ThemePopover />
        </div>
      </header>
      <div
        :class="cn(
          'p-4 grow',
          contentLayout === 'centered' ? 'container mx-auto ' : '',
        )"
      >
        <router-view />
      </div>
    </UiSidebarInset>
  </UiSidebarProvider>
</template>
