import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface OrderPlan {
  _id?: string
  order_no: string
  order_weight: number
  left_weight: number
  destination?: string
  consignee?: string
  customer_code?: string
  customer_name: string
  ds_client?: string
  transport_mode?: string
  customer_saleman?: string
  consigner?: string
  status: number
  contract_no?: string
  receiving_charge?: number
  entry_time?: Date | string
  create_time?: Date
  creator?: string
}

export interface PlanListResponse {
  ok: boolean
  data: OrderPlan[]
  total: number
  page: number
  totalPages: number
  summary: {
    totalWeight: number
    leftWeight: number
    sentWeight: number
  }
}

export interface PlanCreateData {
  orderNo: string
  orderWeight: number
  customerName: string
  customerCode?: string
  destination?: string
  transportMode?: string
  consignee?: string
  dsClient?: string
  contractNo?: string
  salesman?: string
  receivingCharge?: number
  consigner?: string
}

// 获取计划列表
export async function getPlans(params: {
  page?: number
  limit?: number
  orderNo?: string
  customerName?: string
  transportMode?: string
  status?: string
  startDate?: string
  endDate?: string
}) {
  const response = await axiosInstance.get<PlanListResponse>('/plans', { params })
  return response.data
}

// 创建计划（批量）
export async function createPlans(plans: PlanCreateData[]) {
  const response = await axiosInstance.post('/plans', plans)
  return response.data
}

// 更新计划
export async function updatePlan(data: {
  orderNo: string
  orderWeight: number
  destination?: string
  transportMode?: string
  consignee?: string
  dsClient?: string
  salesman?: string
  consigner?: string
  contractNo?: string
  charge?: number
  entryTime?: string
}) {
  const response = await axiosInstance.post('/plans/update', data)
  return response.data
}

// 删除计划
export async function deletePlans(plans: { order_no: string }[]) {
  const response = await axiosInstance.post('/plans/delete', plans)
  return response.data
}

// 结案
export async function closePlans(orderNos: string[]) {
  const response = await axiosInstance.post('/plans/close', orderNos)
  return response.data
}

// 取消结案
export async function unclosePlans(orderNos: string[]) {
  const response = await axiosInstance.post('/plans/unclose', orderNos)
  return response.data
}

// 检查订单号是否存在
export async function checkPlanExists(orderNo: string) {
  const response = await axiosInstance.get('/plans/check', { params: { q: orderNo } })
  return response.data
}

// 获取公司列表（用于下拉选择）
export async function getCompanies(params?: { search?: string, limit?: number }) {
  const response = await axiosInstance.get('/companies', { params })
  return response.data
}

// 搜索公司（用于动态加载，支持分页）
export async function searchCompanies(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/companies', {
    params: { search, limit, page },
  })
  return response.data
}

// 获取目的地列表
export async function getDestinations() {
  const response = await axiosInstance.get('/destinations')
  return response.data
}

// 搜索目的地（用于动态加载，支持分页）
export async function searchDestinations(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/destinations', {
    params: { search, limit, page },
  })
  return response.data
}
