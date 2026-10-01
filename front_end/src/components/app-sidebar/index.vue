<script lang="ts" setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { GalleryVerticalEnd } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

import { SYSTEM_NAME } from '@/config/constants'
import { useApprovalStore } from '@/stores/approvals'
import { useAuthStore } from '@/stores/auth'
import { isSealCustodian } from '@/utils/module-access'

import { generateNavData, generatePlatformNavData } from './data/sidebar-data'
import NavFooter from './nav-footer.vue'
import NavTeam from './nav-team.vue'

const authStore = useAuthStore()
const approvalStore = useApprovalStore()
const route = useRoute()
const { user, isPlatformUser, features } = storeToRefs(authStore)

// 审批待办计数（审批页那一行的待办链接用）在侧栏启动：侧栏随布局常驻，进任何页面都会保持最新（60s 轮询）
onMounted(() => approvalStore.start())
onUnmounted(() => approvalStore.stop())
// 切页面时补拉一次（例如刚审完一条），不必等下一次轮询
watch(() => route.fullPath, () => { void approvalStore.refresh() })

// 根据用户角色和权限动态生成菜单
const navMain = computed(() => {
  if (isPlatformUser.value) {
    return generatePlatformNavData()
  }
  const privilege = user.value?.privilege ?? []
  const roles = user.value?.attendanceRoles
  const attendanceRoles = Array.isArray(roles) ? roles : roles ? [roles] : []
  const payroll = user.value?.payrollRoles
  const payrollRoles = Array.isArray(payroll) ? payroll : payroll ? [payroll] : []
  const isCustodian = isSealCustodian(user.value, authStore.tenant)
  return generateNavData(privilege, features.value, attendanceRoles, payrollRoles, authStore.isOwner, user.value?.title ?? '', isCustodian, user.value?.canReviewAttendance === true)
})

// 侧边栏标题：standalone 模式显示"公司名+物流系统"，平台用户显示"物流管理平台"，租户用户显示系统名
const sidebarTitle = computed(() => {
  if (authStore.isStandalone) return authStore.standaloneSystemTitle
  return isPlatformUser.value ? '物流管理平台' : SYSTEM_NAME
})
</script>

<template>
  <UiSidebar collapsible="icon" class="z-50">
    <UiSidebarHeader>
      <UiSidebarMenu>
        <UiSidebarMenuItem>
          <UiSidebarMenuButton size="lg" as-child>
            <router-link to="/dashboard">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GalleryVerticalEnd class="size-4" />
              </div>
              <div class="flex flex-col gap-0.5 leading-none">
                <span class="font-semibold">{{ sidebarTitle }}</span>
              </div>
            </router-link>
          </UiSidebarMenuButton>
        </UiSidebarMenuItem>
      </UiSidebarMenu>
    </UiSidebarHeader>

    <UiSidebarContent>
      <NavTeam :nav-main="navMain" />
    </UiSidebarContent>

    <UiSidebarFooter>
      <NavFooter :user="{ name: '', avatar: '', email: '' }" />
    </UiSidebarFooter>

    <UiSidebarRail />
  </UiSidebar>
</template>
