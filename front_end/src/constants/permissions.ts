/**
 * 权限注册表
 *
 * 权限用命名字符串数组表示，如 ['operator', 'account', 'seePrice']
 * 管理员为 ['admin']
 */

export const PERMISSIONS = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  STATISTICS: 'statistics',
  ACCOUNT: 'account',
  CUST_REVENUE: 'custRevenue',
  VESSEL_REVENUE: 'vesselRevenue',
  SELF_VEHICLE: 'selfVehicle',
  SEE_PRICE: 'seePrice',
  CUST_SETTLE: 'custSettle',
  VESSEL_SETTLE: 'vesselSettle',
  DELETE_INVOICE: 'deleteInvoice',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

/** 权限 → 中文显示名 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  admin: '管理',
  operator: '业务',
  statistics: '统计',
  account: '会计',
  custRevenue: '客户营业额',
  vesselRevenue: '车船营业额',
  selfVehicle: '自有车管理',
  seePrice: '查看价格',
  custSettle: '客户结算',
  vesselSettle: '车船结算',
  deleteInvoice: '删除运单',
}

export function isAdmin(privilege: string[]): boolean {
  return Array.isArray(privilege) && privilege.includes(PERMISSIONS.ADMIN)
}

export function hasPermission(privilege: string[], perm: Permission): boolean {
  if (!Array.isArray(privilege)) return false
  return privilege.includes(PERMISSIONS.ADMIN) || privilege.includes(perm)
}

export function getPrivilegeDisplay(privilege: string[]): string {
  if (!Array.isArray(privilege) || privilege.length === 0) return ''
  if (isAdmin(privilege)) return '管理'
  return privilege
    .map(p => PERMISSION_LABELS[p as Permission])
    .filter(Boolean)
    .join(',')
}
