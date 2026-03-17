<script setup lang="ts">
import { useCookies } from '@vueuse/integrations/useCookies'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import AppSidebar from '@/components/app-sidebar/index.vue'
import PaymentQRDialog from '@/components/subscription-reminder/PaymentQRDialog.vue'
import SubscriptionBanner from '@/components/subscription-reminder/SubscriptionBanner.vue'
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
import { useSubscriptionReminder } from '@/composables/use-subscription-reminder'
import { useKeyboardSafe } from '@/composables/use-keyboard-safe'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

useKeyboardSafe()

const defaultOpen = useCookies([SIDEBAR_COOKIE_NAME])
const themeStore = useThemeStore()
const { contentLayout } = storeToRefs(themeStore)
const route = useRoute()

const authStore = useAuthStore()
const { tenant, user, isPlatformUser, isOwner } = storeToRefs(authStore)

const roleBadgeText = computed(() => {
  if (isPlatformUser.value) return '平台管理员'
  if (isOwner.value) return '管理员'
  return ''
})

// 路由到面包屑的映射
const routeMap: Record<string, { parent?: string; title: string }> = {
  '/dashboard': { title: '首页' },
  '/plans': { parent: '业务操作', title: '计划列表' },
  '/plans/create': { parent: '业务操作', title: '新建计划' },
  '/bills/list': { parent: '提单管理', title: '提单列表' },
  '/bills/create': { parent: '提单管理', title: '新建提单' },
  '/bills/edit': { parent: '提单管理', title: '修改提单' },
  '/bills/delete': { parent: '提单管理', title: '删除提单' },
  '/bills/search': { parent: '提单管理', title: '查询' },
  '/invoices/create-truck': { parent: '运单管理', title: '配发货(车运)' },
  '/invoices/create-ship': { parent: '运单管理', title: '配发货(船运)' },
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
  '/data-process/round-steel': { parent: '数据处理', title: '圆钢' },
  '/data-process/round-steel-create': { parent: '数据处理', title: '圆钢 - 新建' },
  '/data-process/plate': { parent: '数据处理', title: '板材' },
  '/data-process/plate-create': { parent: '数据处理', title: '板材 - 新建' },
  '/platform/tenants': { parent: '平台管理', title: '公司账号管理' },
  '/platform/orders': { parent: '平台管理', title: '订单管理' },
  '/platform/business': { parent: '平台管理', title: '公司业务查看' },
  '/platform/statistics': { parent: '平台管理', title: '平台统计报告' },
}

// Subscription reminder
const { shouldShowToast, reminderText: subReminderText } = useSubscriptionReminder()
const showPaymentQR = ref(false)

onMounted(() => {
  if (shouldShowToast()) {
    toast.warning(subReminderText.value, { duration: 6000 })
  }
})

// 计算面包屑（不包括首页，首页在模板中固定显示）
const breadcrumbs = computed(() => {
  const path = route.path
  const info = routeMap[path]

  // 首页不需要额外的面包屑
  if (!info || path === '/dashboard') {
    return []
  }

  const items: { title: string; path?: string }[] = []

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
    <UiSidebarInset
      class="w-full max-w-full max-h-svh overflow-hidden peer-data-[state=collapsed]:w-[calc(100%-var(--sidebar-width-icon)-1rem)] peer-data-[state=expanded]:w-[calc(100%-var(--sidebar-width))]"
    >
      <header
        class="flex items-center gap-3 sm:gap-4 h-12 px-4 shrink-0 transition-[width,height] ease-linear border-b"
      >
        <UiSidebarTrigger class="-ml-1" />
        <UiSeparator orientation="vertical" class="h-4" />

        <!-- 面包屑 -->
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem class="hidden sm:inline-flex">
              <BreadcrumbLink href="/dashboard"> 首页 </BreadcrumbLink>
            </BreadcrumbItem>
            <template v-for="(item, index) in breadcrumbs" :key="index">
              <BreadcrumbSeparator :class="index === 0 ? 'hidden sm:inline-flex' : ''" />
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
        <div class="ml-auto flex items-center space-x-2">
          <template v-if="!authStore.isStandalone">
            <!-- 租户信息 (standalone 模式下隐藏, 移动端隐藏) -->
            <div v-if="tenant" class="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <span class="font-medium text-foreground">{{ tenant.name }}</span>
              <span class="text-xs">[{{ tenant.code }}]</span>
            </div>
            <span
              v-if="roleBadgeText"
              class="hidden sm:inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {{ roleBadgeText }}
            </span>
            <UiSeparator v-if="tenant" orientation="vertical" class="hidden sm:block h-4" />
          </template>
          <ToggleTheme />
          <ThemePopover />
        </div>
      </header>
      <SubscriptionBanner @open-payment="showPaymentQR = true" />
      <div class="overflow-auto grow min-h-0">
        <div :class="cn('p-0 md:p-4 md:min-w-[1024px]', contentLayout === 'centered' ? 'container mx-auto ' : '')">
          <router-view />
        </div>
      </div>
    </UiSidebarInset>

    <!-- Payment QR Dialog -->
    <PaymentQRDialog v-model:open="showPaymentQR" />
  </UiSidebarProvider>
</template>
