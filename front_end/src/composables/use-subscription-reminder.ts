import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth'

export type Urgency = 'low' | 'medium' | 'high'

const STORAGE_PREFIX = 'sub_reminder_'

function getStorageKey(tenantId: string, type: 'toast' | 'banner') {
  const today = new Date().toISOString().slice(0, 10)
  return `${STORAGE_PREFIX}${type}_${tenantId}_${today}`
}

export function useSubscriptionReminder() {
  const authStore = useAuthStore()
  const { tenant, isPlatformUser, isStandalone } = storeToRefs(authStore)

  const isActive = computed(() => {
    if (isPlatformUser.value || isStandalone.value) return false
    if (!tenant.value?.expireDate) return false
    return true
  })

  const expireTime = computed(() => {
    if (!tenant.value?.expireDate) return null
    return new Date(tenant.value.expireDate).getTime()
  })

  const daysRemaining = computed(() => {
    if (!expireTime.value) return null
    const diff = expireTime.value - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  })

  const hoursRemaining = computed(() => {
    if (!expireTime.value) return null
    const diff = expireTime.value - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60))
  })

  const isExpired = computed(() => {
    if (daysRemaining.value === null) return false
    return daysRemaining.value <= 0
  })

  const urgency = computed<Urgency | null>(() => {
    if (!isActive.value || daysRemaining.value === null) return null
    if (daysRemaining.value <= 0 || (hoursRemaining.value !== null && hoursRemaining.value <= 2)) return 'high'
    if (daysRemaining.value <= 5) return 'medium'
    return 'low'
  })

  const reminderText = computed(() => {
    if (!isActive.value) return ''
    if (isExpired.value) return '您的账号已过期，请尽快续费以恢复服务。'
    if (hoursRemaining.value !== null && hoursRemaining.value <= 2) {
      return `您的账号将在 ${hoursRemaining.value} 小时内到期，请尽快续费。`
    }
    if (daysRemaining.value !== null && daysRemaining.value <= 30) {
      return `您的账号将在 ${daysRemaining.value} 天后到期，请及时续费。`
    }
    return ''
  })

  // Show banner if: active + has reminder text + within 30 days
  const showBanner = computed(() => {
    if (!isActive.value || !reminderText.value) return false
    if (daysRemaining.value !== null && daysRemaining.value > 30) return false
    // Check if dismissed today (unless high urgency and <=2 hours)
    if (urgency.value === 'high' && hoursRemaining.value !== null && hoursRemaining.value <= 2) return true
    if (isBannerDismissed.value) return false
    return true
  })

  const canDismissBanner = computed(() => {
    if (urgency.value === 'high' && hoursRemaining.value !== null && hoursRemaining.value <= 2) return false
    return true
  })

  const isBannerDismissed = computed(() => {
    if (!tenant.value?.id) return false
    const key = getStorageKey(tenant.value.id, 'banner')
    return localStorage.getItem(key) === '1'
  })

  function dismissBanner() {
    if (!tenant.value?.id) return
    const key = getStorageKey(tenant.value.id, 'banner')
    localStorage.setItem(key, '1')
  }

  function shouldShowToast(): boolean {
    if (!isActive.value || !reminderText.value) return false
    if (daysRemaining.value !== null && daysRemaining.value > 30) return false
    if (!tenant.value?.id) return false
    const key = getStorageKey(tenant.value.id, 'toast')
    if (localStorage.getItem(key) === '1') return false
    localStorage.setItem(key, '1')
    return true
  }

  return {
    isActive,
    daysRemaining,
    hoursRemaining,
    isExpired,
    urgency,
    reminderText,
    showBanner,
    canDismissBanner,
    dismissBanner,
    shouldShowToast,
  }
}
