<script setup lang="ts">
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  LogOut,
  Settings,
  UserRoundCog,
} from 'lucide-vue-next'

import { useSidebar } from '@/components/ui/sidebar'
import { useAuth } from '@/composables/use-auth'

import type { User } from './types'

defineProps<{ user: User }>()

const { logout, user: authUser } = useAuth()
const { isMobile, open } = useSidebar()

// 获取用户显示名称
const displayName = computed(() => authUser.value?.name || authUser.value?.userid || '用户')
const displayTitle = computed(() => authUser.value?.title || '')
// 获取用户名首字母作为头像
const avatarFallback = computed(() => {
  const name = authUser.value?.name || authUser.value?.userid || 'U'
  return name.substring(0, 2).toUpperCase()
})
</script>

<template>
  <UiSidebarMenu>
    <UiSidebarMenuItem>
      <UiDropdownMenu>
        <UiDropdownMenuTrigger as-child>
          <UiSidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <UiAvatar class="size-8 rounded-lg">
              <UiAvatarFallback class="rounded-lg">
                {{ avatarFallback }}
              </UiAvatarFallback>
            </UiAvatar>
            <div class="grid flex-1 text-sm leading-tight text-left">
              <span class="font-semibold truncate">{{ displayName }}</span>
              <span class="text-xs truncate text-muted-foreground">{{ displayTitle }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </UiSidebarMenuButton>
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent
          class="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="(isMobile || open) ? 'bottom' : 'right'"
          align="start"
          :side-offset="4"
        >
          <UiDropdownMenuLabel class="p-0 font-normal">
            <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <UiAvatar class="size-8 rounded-lg">
                <UiAvatarFallback class="rounded-lg">
                  {{ avatarFallback }}
                </UiAvatarFallback>
              </UiAvatar>
              <div class="grid flex-1 text-sm leading-tight text-left">
                <span class="font-semibold truncate">{{ displayName }}</span>
                <span class="text-xs truncate text-muted-foreground">{{ displayTitle }}</span>
              </div>
            </div>
          </UiDropdownMenuLabel>

          <UiDropdownMenuSeparator />
          <UiDropdownMenuGroup>
            <UiDropdownMenuItem @click="$router.push('/settings/')">
              <UserRoundCog />
              个人设置
            </UiDropdownMenuItem>
            <UiDropdownMenuItem @click="$router.push('/settings/account')">
              <BadgeCheck />
              账号设置
            </UiDropdownMenuItem>
            <UiDropdownMenuItem @click="$router.push('/settings/notifications')">
              <Bell />
              通知设置
            </UiDropdownMenuItem>
          </UiDropdownMenuGroup>

          <UiDropdownMenuSeparator />
          <UiDropdownMenuItem @click="logout">
            <LogOut />
            退出登录
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>
    </UiSidebarMenuItem>
  </UiSidebarMenu>
</template>
