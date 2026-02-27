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
          authStore.setUser(response.data.user, response.data.tenant || null)
          if (response.data.deployMode) {
            authStore.setDeployMode(response.data.deployMode)
          }
          if (response.data.standaloneCompany) {
            authStore.setStandaloneCompany(response.data.standaloneCompany)
          }
          if (response.data.features) {
            authStore.setFeatures(response.data.features)
          }
        }
      }
      catch (e) {
        authStore.clearUser()
        // 未登录时也需要获取部署模式，以便登录页正确显示
        try {
          const { axiosInstance: axios } = useAxios()
          const deployInfoRes = await axios.get('/deploy-info')
          if (deployInfoRes.data.deployMode) {
            authStore.setDeployMode(deployInfoRes.data.deployMode)
          }
          if (deployInfoRes.data.standaloneCompany) {
            authStore.setStandaloneCompany(deployInfoRes.data.standaloneCompany)
          }
        } catch (_) {
          // ignore
        }
      }
    }

    // 如果页面需要登录但用户未登录，重定向到登录页面
    if (to.meta.auth && !unref(isLogin) && !to.path.startsWith('/auth/')) {
      return {
        path: '/auth/sign-in',
        query: { redirect: to.fullPath },
      }
    }

    // 角色权限检查
    if (to.meta.requiresOwner && !authStore.isPlatformUser && !authStore.isOwner) {
      return { path: '/dashboard' }
    }

    if (to.meta.requiresPlatformUser && !authStore.isPlatformUser) {
      return { path: '/dashboard' }
    }
  })
}
