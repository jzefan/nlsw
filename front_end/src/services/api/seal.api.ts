import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export type SealType = 'official' | 'finance' | 'contract' | 'invoice' | 'legal'
export type SealRequestStatus = 'pending' | 'approved' | 'checked_out' | 'overdue' | 'returned' | 'rejected' | 'withdrawn'
export type SealItemStatus = 'active' | 'disabled' | 'scrapped'

export const SEAL_TYPE_MAP: Record<SealType, string> = {
  official: '公章',
  finance: '财务专用章',
  contract: '合同专用章',
  invoice: '发票专用章',
  legal: '法人章'
}

export const SEAL_STATUS_MAP: Record<SealRequestStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待审批', variant: 'secondary' },
  approved: { label: '待发章', variant: 'outline' },
  checked_out: { label: '使用中', variant: 'default' },
  overdue: { label: '已逾期', variant: 'destructive' },
  returned: { label: '已归还', variant: 'secondary' },
  rejected: { label: '已驳回', variant: 'destructive' },
  withdrawn: { label: '已撤回', variant: 'outline' }
}

export interface SealItem {
  _id: string
  sealType: SealType
  code: string
  status: SealItemStatus
  physicalOut: boolean
  currentRequestId?: string | null
  currentBorrowerName?: string
  borrowCount: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface SealApproval {
  approverId: string
  role: 'general_manager' | 'owner' | 'delegate'
  status: 'pending' | 'approved' | 'rejected'
  comment?: string
  reviewedAt?: string
}

export interface AssignedSealItem {
  sealItemId: string
  code: string
  sealType: SealType
}

export interface SealUsageLog {
  _id: string
  sealType: SealType
  sealItemId?: string | null
  sealItemCode?: string
  requestId: string
  action: 'submit' | 'approve' | 'reject' | 'withdraw' | 'checkout' | 'return' | 'overdue' | 'remind' | 'watch_notified'
  operatorId?: string | null
  operatorName?: string
  at: string
  snapshot?: Record<string, unknown>
  note?: string
}

export interface SealRequest {
  _id: string
  serialNo: string
  applicantId: string
  applicant: {
    employeeNo?: string
    name: string
    department?: string
    title?: string
  }
  useDepartment?: string
  useAt: string
  expectedReturnAt: string
  actualReturnAt?: string | null
  sealTypes: SealType[]
  documentName: string
  copies: number
  reason: string
  remark?: string
  status: SealRequestStatus
  approvals: SealApproval[]
  currentApproverId?: string | null
  sealItems: AssignedSealItem[]
  checkedOutAt?: string | null
  operatorId?: string | null
  operatorName?: string
  returnNote?: string
  reminders?: string[]
  withdrawnAt?: string | null
  createdAt: string
  updatedAt: string
  logs?: SealUsageLog[]
}

export interface SealAvailabilityItem {
  name: string
  available: boolean
  active: number
  freeNow: number
  maxConcurrent: number
  physicalOutCount: number
  reason?: string
}

export interface SealWatchItem {
  _id: string
  sealType: SealType
  desiredFrom: string
  desiredTo: string
  status: 'waiting' | 'notified' | 'expired'
  notifiedAt?: string | null
  createdAt: string
}

export interface SealCustodianCandidate {
  userId: string
  name: string
  department?: string
  employeeNo?: string
  title?: string
  userid: string
}

export interface SealSettings {
  sealEnabled: boolean
  sealCustodianId?: string | null
  sealCustodianIds?: string[]
  candidates?: SealCustodianCandidate[]
  custodianUser?: {
    _id: string
    profile?: { name?: string }
    userid: string
    employeeNo?: string
    department?: string
  } | null
  sealOverdueRemindMinutes: number
  sealOverdueEscalateMinutes: number
}

export interface SealStatisticsItem {
  sealItemId: string
  code: string
  sealType: SealType
  sealTypeName: string
  status: SealItemStatus
  physicalOut: boolean
  currentBorrowerName?: string
  borrowCount: number
  totalDurationMinutes: number
  overdueCount: number
  overdueDurationMinutes: number
}

export interface SealResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  meta?: {
    pendingCount?: number
    hasGlobalApprovalView?: boolean
  }
}

// 1. 可用性查询
export async function getSealAvailability(from: string, to: string) {
  const { data } = await axiosInstance.get<SealResponse<Record<SealType, SealAvailabilityItem>>>('/seal/availability', {
    params: { from, to }
  })
  return data
}

// 2. 实体章管理
export async function getSealItems(params: { status?: string; sealType?: string } = {}) {
  const { data } = await axiosInstance.get<SealResponse<SealItem[]>>('/seal/items', { params })
  return data
}

export async function createSealItem(body: { sealType: SealType; code?: string; note?: string }) {
  const { data } = await axiosInstance.post<SealResponse<SealItem>>('/seal/items', body)
  return data
}

export async function updateSealItem(id: string, body: { code?: string; note?: string; status?: SealItemStatus }) {
  const { data } = await axiosInstance.patch<SealResponse<SealItem>>(`/seal/items/${id}`, body)
  return data
}

// 3. 申请单生命周期
export async function getSealRequests(params: {
  view?: 'mine' | 'inbox' | 'history' | 'custody' | 'all'
  status?: string
  sealType?: string
  page?: number
  limit?: number
} = {}) {
  const { data } = await axiosInstance.get<SealResponse<SealRequest[]>>('/seal/requests', { params })
  return data
}

export async function createSealRequest(body: {
  useDepartment?: string
  useAt: string
  expectedReturnAt: string
  sealTypes: SealType[]
  documentName: string
  copies: number
  reason: string
  remark?: string
}) {
  const { data } = await axiosInstance.post<SealResponse<SealRequest>>('/seal/requests', body)
  return data
}

export async function getSealRequestDetail(id: string) {
  const { data } = await axiosInstance.get<SealResponse<SealRequest>>(`/seal/requests/${id}`)
  return data
}

export async function withdrawSealRequest(id: string) {
  const { data } = await axiosInstance.post<SealResponse<SealRequest>>(`/seal/requests/${id}/withdraw`)
  return data
}

export async function reviewSealRequest(id: string, body: { decision: 'approved' | 'rejected'; comment?: string }) {
  const { data } = await axiosInstance.post<SealResponse<SealRequest>>(`/seal/requests/${id}/review`, body)
  return data
}

export async function checkoutSealRequest(id: string, body: { sealItemIds: string[] }) {
  const { data } = await axiosInstance.post<SealResponse<SealRequest>>(`/seal/requests/${id}/checkout`, body)
  return data
}

export async function returnSealRequest(id: string, body: { actualReturnAt?: string; note?: string } = {}) {
  const { data } = await axiosInstance.post<SealResponse<SealRequest>>(`/seal/requests/${id}/return`, body)
  return data
}

// 4. 台账与统计
export async function getSealLedger(params: {
  sealItemId?: string
  sealType?: string
  action?: string
  from?: string
  to?: string
  page?: number
  limit?: number
} = {}) {
  const { data } = await axiosInstance.get<SealResponse<SealUsageLog[]>>('/seal/ledger', { params })
  return data
}

export async function getSealStatistics(params: { sealItemId?: string; sealType?: string } = {}) {
  const { data } = await axiosInstance.get<SealResponse<SealStatisticsItem[]>>('/seal/statistics', { params })
  return data
}

// 5. 候补管理
export async function getSealWatches() {
  const { data } = await axiosInstance.get<SealResponse<SealWatchItem[]>>('/seal/watches')
  return data
}

export async function createSealWatch(body: { sealType: SealType; desiredFrom: string; desiredTo: string }) {
  const { data } = await axiosInstance.post<SealResponse<SealWatchItem>>('/seal/watches', body)
  return data
}

export async function cancelSealWatch(id: string) {
  const { data } = await axiosInstance.delete<SealResponse>(`/seal/watches/${id}`)
  return data
}

// 6. 用章设置
export async function getSealSettings() {
  const { data } = await axiosInstance.get<SealResponse<SealSettings>>('/seal/settings')
  return data
}

export async function updateSealSettings(body: {
  sealEnabled?: boolean
  sealCustodianId?: string | null
  sealCustodianIds?: string[]
  sealOverdueRemindMinutes?: number
  sealOverdueEscalateMinutes?: number
}) {
  const { data } = await axiosInstance.post<SealResponse>('/seal/settings', body)
  return data
}
