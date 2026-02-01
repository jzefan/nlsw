import type { Router } from 'vue-router'

import { storeToRefs } from 'pinia'

import { useAxios } from '@/composables/use-axios'
import pinia from '@/plugins/pinia/setup'
import { useAuthStore } from '@/stores/auth'

let isAuthChecked = false

export function authGuard(router: Router) {
  router.beforeEach(async (to, _from) => {
    const authStore = useAuthStore(pinia)
    const { isLogin } = storeToRefs(authStore)

    // 首次加载时检查服务器端 session 状态
    if (!isAuthChecked) {
      isAuthChecked = true
      try {
        const { axiosInstance } = useAxios()
        const response = await axiosInstance.get('/me')
        if (response.data.ok) {
          authStore.setUser(response.data.user)
        }
      }
      catch (e) {
        authStore.clearUser()
      }
    }

    // 如果页面需要登录但用户未登录，重定向到登录页面
    if (to.meta.auth && !unref(isLogin) && !to.path.startsWith('/auth/')) {
      return {
        path: '/auth/sign-in',
        query: { redirect: to.fullPath },
      }
    }
  })
}
