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
  expireDate?: string | null
}

export type DeployMode = 'saas' | 'standalone'

export interface Features {
  selfVehicle: boolean
  publicBasket: boolean
  requireReceiptForSettle: boolean
}

export const useAuthStore = defineStore('user', () => {
  const isLogin = ref(false)
  const user = ref<User | null>(null)
  const tenant = ref<Tenant | null>(null)
  const deployMode = ref<DeployMode>('saas')
  const standaloneCompany = ref('')
  const features = ref<Features>({ selfVehicle: false, publicBasket: false, requireReceiptForSettle: false })

  function setUser(userData: User | null, tenantData: Tenant | null = null) {
    user.value = userData
    tenant.value = tenantData
    isLogin.value = !!userData
  }

  function setDeployMode(mode: DeployMode) {
    deployMode.value = mode
  }

  function setStandaloneCompany(name: string) {
    standaloneCompany.value = name
  }

  function setFeatures(featureData: Features) {
    features.value = featureData
  }

  function clearUser() {
    user.value = null
    tenant.value = null
    isLogin.value = false
    // deployMode is not cleared — it persists across login/logout
  }

  // Computed role checks
  const isPlatformUser = computed(() => user.value?.role === 'platform')
  const isOwner = computed(() => user.value?.role === 'owner')
  const isMember = computed(() => user.value?.role === 'member')
  const isAppAdmin = computed(() => isAdmin(user.value?.privilege ?? []))
  const isStandalone = computed(() => deployMode.value === 'standalone')

  // standalone 模式下的系统标题：公司名+物流系统
  const standaloneSystemTitle = computed(() =>
    standaloneCompany.value ? `${standaloneCompany.value}物流系统` : '物流系统',
  )

  // 公司显示名称：优先 fullName，其次 name
  const companyDisplayName = computed(() => tenant.value?.fullName || tenant.value?.name || '')

  return {
    isLogin,
    user,
    tenant,
    deployMode,
    standaloneCompany,
    features,
    isPlatformUser,
    isOwner,
    isMember,
    isAppAdmin,
    isStandalone,
    standaloneSystemTitle,
    companyDisplayName,
    setUser,
    setDeployMode,
    setStandaloneCompany,
    setFeatures,
    clearUser,
  }
})
