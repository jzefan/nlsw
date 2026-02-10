<script lang="ts" setup>
import { GalleryVerticalEnd } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

import { SYSTEM_NAME } from '@/config/constants'
import { useAuthStore } from '@/stores/auth'

import { generateNavData, generatePlatformNavData } from './data/sidebar-data'
import NavFooter from './nav-footer.vue'
import NavTeam from './nav-team.vue'

const authStore = useAuthStore()
const { user, isPlatformUser } = storeToRefs(authStore)

// 根据用户角色和权限动态生成菜单
const navMain = computed(() => {
  if (isPlatformUser.value) {
    return generatePlatformNavData()
  }
  const privilege = user.value?.privilege ?? []
  return generateNavData(privilege)
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
