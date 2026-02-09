import { defineStore } from 'pinia'
import { isAdmin } from '@/constants/permissions'

export interface User {
  userid: string
  name: string
  title?: string
  privilege: string[]
  role: 'platform' | 'owner' | 'member'
}

export interface Tenant {
  id: string
  code: string
  name: string
  fullName?: string
  plan?: string
  maxUsers?: number
}

export const useAuthStore = defineStore('user', () => {
  const isLogin = ref(false)
  const user = ref<User | null>(null)
  const tenant = ref<Tenant | null>(null)

  function setUser(userData: User | null, tenantData: Tenant | null = null) {
    user.value = userData
    tenant.value = tenantData
    isLogin.value = !!userData
  }

  function clearUser() {
    user.value = null
    tenant.value = null
    isLogin.value = false
  }

  // Computed role checks
  const isPlatformUser = computed(() => user.value?.role === 'platform')
  const isOwner = computed(() => user.value?.role === 'owner')
  const isMember = computed(() => user.value?.role === 'member')
  const isAppAdmin = computed(() => isAdmin(user.value?.privilege ?? []))

  // 公司显示名称：优先 fullName，其次 name
  const companyDisplayName = computed(() => tenant.value?.fullName || tenant.value?.name || '')

  return {
    isLogin,
    user,
    tenant,
    isPlatformUser,
    isOwner,
    isMember,
    isAppAdmin,
    companyDisplayName,
    setUser,
    clearUser,
  }
})
