import { useAxios } from '@/composables/use-axios'
import { getPrivilegeDisplay } from '@/constants/permissions'

const { axiosInstance } = useAxios()

export interface User {
  userid: string
  name: string
  title: string
  phone: string
  privilege: string[]
  role?: 'platform' | 'owner' | 'member'
}

export interface UserFormData {
  userid: string
  name: string
  title: string
  phone: string
  privilege: string[]
}

// 职务选项
export const titleOptions = [
  { value: 'ceo', label: '董事长' },
  { value: 'mgr', label: '经理' },
  { value: 'operator', label: '业务员' },
  { value: 'account', label: '会计' },
  { value: 'statistician', label: '统计员' },
]

// 职务代码转中文
export function getTitleLabel(code: string): string {
  const option = titleOptions.find(o => o.value === code)
  return option?.label || code
}

// 中文转职务代码
export function getTitleCode(label: string): string {
  const option = titleOptions.find(o => o.label === label)
  return option?.value || label
}

// Re-export from permissions constants
export { getPrivilegeDisplay }

// 获取用户名称列表（所有用户可用，排除平台管理员）
export async function getUserNames() {
  const response = await axiosInstance.get<{ ok: boolean; data: string[] }>('/users')
  return response.data
}

// 获取用户管理列表（需要管理权限）
export async function getUsers() {
  const response = await axiosInstance.get<{ ok: boolean; data: User[] }>('/user_mgr')
  return response.data
}

// 添加用户
export async function addUser(data: UserFormData) {
  const response = await axiosInstance.post('/user_mgr', {
    act: 'add',
    data,
  })
  return response.data
}

// 修改用户
export async function updateUser(data: UserFormData) {
  const response = await axiosInstance.post('/user_mgr', {
    act: 'modify',
    data,
  })
  return response.data
}

// 删除用户
export async function deleteUser(userid: string) {
  const response = await axiosInstance.post('/user_mgr', {
    act: 'delete',
    userid,
  })
  return response.data
}

// 重置密码
export async function resetPassword(user: { userid: string }) {
  const response = await axiosInstance.post('/resetPwd', { user })
  return response.data
}

// 获取租户设置
export async function getTenantSettings() {
  const response = await axiosInstance.get<{
    ok: boolean
    settings: {
      drayageRate?: number
      ownVehicleDeductPayable?: boolean
      receiptStorage?: string
      requireReceiptForSettle?: boolean
      billImportCarrierRule?: 'contains_company_name' | 'unrestricted'
    }
  }>('/tenant/settings')
  return response.data
}

// 更新租户设置
export async function updateTenantSettings(data: {
  drayageRate?: number
  ownVehicleDeductPayable?: boolean
  receiptStorage?: string
  requireReceiptForSettle?: boolean
  billImportCarrierRule?: 'contains_company_name' | 'unrestricted'
}) {
  const response = await axiosInstance.post('/tenant/settings', data)
  return response.data
}
