import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// ---- Types ----

export interface TenantItem {
  _id: string
  code: string
  name: string
  fullName?: string
  status: 'active' | 'suspended'
  plan: string
  maxUsers: number
  contact?: {
    name?: string
    phone?: string
    email?: string
    address?: string
  }
  createDate: string
  expireDate?: string
  userCount: number
  lastActiveAt: string | null
}

export interface TenantUser {
  _id: string
  userid: string
  profile: { name?: string; phone?: string }
  title: string
  privilege: string[]
  role: string
  status: string
  lastLoginAt: string | null
  createDate: string
}

export interface BillItem {
  _id: string
  bill_no: string
  order_no: string
  billing_name: string
  customer_price: number
  total_weight: number
  status: string
  create_date: string
}

export interface InvoiceItem {
  _id: string
  waybill_no: string
  vehicle_vessel_name: string
  total_weight: number
  vessel_price: number
  state: string
  ship_date: string
}

export interface PaginatedResponse<T> {
  ok: boolean
  data: T[]
  total: number
  page: number
  totalPages: number
}

export interface TenantDistribution {
  tenantId: string
  tenantName: string
  tenantCode: string
  billCount: number
  invoiceCount: number
}

export interface PlatformStats {
  activeTenants: number
  suspendedTenants: number
  totalUsers: number
  totalBills: number
  totalInvoices: number
  distribution: TenantDistribution[]
}

export interface CreateTenantData {
  tenant: {
    code: string
    name: string
    fullName?: string
    contact?: TenantItem['contact']
    plan?: string
    maxUsers?: number
    expireDate?: string
  }
  owner: {
    userid: string
    name: string
    phone?: string
  }
}

export interface UpdateTenantData {
  tenantId: string
  tenant?: {
    name?: string
    fullName?: string
    contact?: TenantItem['contact']
    plan?: string
    maxUsers?: number
    expireDate?: string
  }
  owner?: {
    userid: string
    name?: string
    phone?: string
  }
}

// ---- API Functions ----

/** 获取公司列表 */
export async function getTenants() {
  const response = await axiosInstance.get<{ ok: boolean; data: TenantItem[] }>('/platform/tenants')
  return response.data
}

/** 启用/禁用公司 */
export async function updateTenantStatus(tenantId: string, status: 'active' | 'suspended') {
  const response = await axiosInstance.post<{ ok: boolean; data: { _id: string; status: string } }>(
    '/platform/tenants/status',
    { tenantId, status },
  )
  return response.data
}

/** 获取公司子账号列表 */
export async function getTenantUsers(tenantId: string) {
  const response = await axiosInstance.get<{ ok: boolean; data: TenantUser[] }>(
    `/platform/tenants/${tenantId}/users`,
  )
  return response.data
}

/** 获取公司提单列表（分页） */
export async function getTenantBills(tenantId: string, page = 1, limit = 20) {
  const response = await axiosInstance.get<PaginatedResponse<BillItem>>(
    `/platform/tenants/${tenantId}/bills`,
    { params: { page, limit } },
  )
  return response.data
}

/** 获取公司运单列表（分页） */
export async function getTenantInvoices(tenantId: string, page = 1, limit = 20) {
  const response = await axiosInstance.get<PaginatedResponse<InvoiceItem>>(
    `/platform/tenants/${tenantId}/invoices`,
    { params: { page, limit } },
  )
  return response.data
}

/** 新建公司 + 主账号 */
export async function createTenant(data: CreateTenantData) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string }>('/platform/tenants', data)
  return response.data
}

/** 修改公司 + 主账号 */
export async function updateTenant(data: UpdateTenantData) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string }>('/platform/tenants/update', data)
  return response.data
}

/** 删除公司（软删除） */
export async function deleteTenant(tenantId: string) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string }>('/platform/tenants/delete', { tenantId })
  return response.data
}

/** 获取平台统计数据 */
export async function getPlatformStats() {
  const response = await axiosInstance.get<{ ok: boolean; data: PlatformStats }>(
    '/platform/statistics',
  )
  return response.data
}

/** 重置用户密码 */
export async function resetUserPassword(userId: string) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string; data?: { userid: string; password: string } }>(
    '/platform/users/reset-password',
    { userId },
  )
  return response.data
}
