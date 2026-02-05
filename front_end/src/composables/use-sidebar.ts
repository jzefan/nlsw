import { BadgeHelp, BellDot, Boxes, Bug, Component, CreditCard, LayoutDashboard, ListTodo, Palette, PictureInPicture2, Podcast, Settings, SquareUserRound, User, Users, Wrench } from 'lucide-vue-next'

import type { NavGroup } from '@/components/app-sidebar/types'

export function useSidebar() {
  const settingsNavItems = [
    { title: '密码修改', url: '/settings/account', icon: Wrench },
  ]

  const navData = ref<NavGroup[]> ([
    {
      title: 'General',
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
        { title: 'Tasks', url: '/tasks', icon: ListTodo },
        { title: 'Apps', url: '/apps', icon: Boxes },
        { title: 'Users', url: '/users', icon: Users },
        { title: 'Ai Talk Example', url: '/ai-talk', icon: Podcast },
      ],
    },
    {
      title: 'Pages',
      items: [
        {
          title: 'Auth',
          icon: SquareUserRound,
          items: [
            { title: 'Sign In', url: '/auth/sign-in' },
            { title: 'Sign Up', url: '/auth/sign-up' },
            { title: 'Forgot Password', url: '/auth/forgot-password' },
            { title: 'OTP', url: '/auth/otp' },
          ],
        },
        {
          title: 'Errors',
          icon: Bug,
          items: [
            { title: '401 | Unauthorized', url: '/errors/401' },
            { title: '403 | Forbidden', url: '/errors/403' },
            { title: '404 | Not Found', url: '/errors/404' },
            { title: '500 | Internal Server Error', url: '/errors/500' },
            { title: '503 | Maintenance Error', url: '/errors/503' },
          ],
        },
      ],
    },
    {
      title: 'Other',
      items: [
        { title: 'Settings', icon: Settings, items: settingsNavItems },
        { title: 'SVA Components', url: '/sva-components', icon: Component },
        { title: 'Help Center', url: '/help-center', icon: BadgeHelp,
        },
      ],
    },
  ])

  const otherPages = ref<NavGroup[]>([
    {
      title: 'Other',
      items: [
        {
          title: 'Plans & Pricing',
          icon: CreditCard,
          url: '/billing',
        },
      ],
    },
  ])

  return {
    navData,
    otherPages,
    settingsNavItems,
  }
}
