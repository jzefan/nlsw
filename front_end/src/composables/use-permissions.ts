import type { PermissionName } from '@/lib/permissions'

import { isAdmin as checkAdmin, hasAnyPermission, hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/stores/auth'

export function usePermissions() {
  const authStore = useAuthStore()

  const privilege = computed(() => authStore.user?.privilege)

  const isAdmin = computed(() => checkAdmin(privilege.value))

  function can(permName: PermissionName): boolean {
    return hasPermission(privilege.value, permName)
  }

  function canAny(...permNames: PermissionName[]): boolean {
    return hasAnyPermission(privilege.value, ...permNames)
  }

  return {
    privilege,
    isAdmin,
    can,
    canAny,
  }
}
