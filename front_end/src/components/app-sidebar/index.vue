<script lang="ts" setup>
import { GalleryVerticalEnd } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

import { SYSTEM_NAME } from '@/config/constants'
import { useAuthStore } from '@/stores/auth'

import { generateNavData } from './data/sidebar-data'
import NavFooter from './nav-footer.vue'
import NavTeam from './nav-team.vue'

const authStore = useAuthStore()
const { user } = storeToRefs(authStore)

// 根据用户权限动态生成菜单
const navMain = computed(() => {
  const privilege = user.value?.privilege || '00000000'
  return generateNavData(privilege)
})

// 公司信息
const companyInfo = {
  name: SYSTEM_NAME,
  logo: GalleryVerticalEnd,
}
</script>

<template>
  <UiSidebar collapsible="icon" class="z-50">
    <UiSidebarHeader>
      <UiSidebarMenu>
        <UiSidebarMenuItem>
          <UiSidebarMenuButton size="lg" as-child>
            <router-link to="/dashboard">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <component :is="companyInfo.logo" class="size-4" />
              </div>
              <div class="flex flex-col gap-0.5 leading-none">
                <span class="font-semibold">{{ companyInfo.name }}</span>
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
