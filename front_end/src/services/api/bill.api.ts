import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface Bill {
  _id?: string
  order: string
  bill_no: string
  order_no: string
  order_item_no: string
  brand_no?: string
  billing_name: string
  product_type?: string
  len?: number
  width?: number
  thickness?: number
  size_type?: string
  weight?: number
  block_num?: number
  total_weight: number
  left_num: number
  customer_price?: number
  warehouse?: string
  ship_warehouse?: string
  shipping_address?: string
  contract_no?: string
  sales_dep?: string
  remark?: string
  status: string
  status_flag: number
  create_date?: Date | string
  shipping_date?: Date | string
  settle_date?: Date | string
  creater?: string
  shipper?: string
  settler?: string
  invoices?: any[]
}

export interface BillCreateData {
  billNo: string
  orderNo: string
  orderItemNo: string
  billingName: string
  brandNo?: string
  sizeType?: string
  salesDep?: string
  shipWarehouse?: string
  contractNo?: string
  productType?: string
  thickness?: number
  width?: number
  length?: number
  weight?: number
  blockNum?: number
  totalWeight: number
}

export interface BillListResponse {
  ok: boolean
  data: Bill[]
  total: number
  page: number
  totalPages: number
}

// 获取提单列表
export async function getBills(params: {
  page?: number
  limit?: number
  billNo?: string
  orderNo?: string
  billingName?: string
  brandNo?: string
  contractNo?: string
  status?: string
  leftNumOnly?: boolean
  startDate?: string
  endDate?: string
}) {
  const response = await axiosInstance.get<BillListResponse>('/bills', { params })
  return response.data
}

// 创建提单（批量）
export async function createBills(bills: BillCreateData[]) {
  const response = await axiosInstance.post('/bills', bills)
  return response.data
}

// 更新提单
export async function updateBill(data: {
  _id: string
  billNo?: string
  billingName?: string
  brandNo?: string
  shipWarehouse?: string
  contractNo?: string
  salesDep?: string
  sizeType?: string
  thickness?: number
  width?: number
  length?: number
  blockNum?: number
  totalWeight?: number
}) {
  const response = await axiosInstance.post('/bills/update', data)
  return response.data
}

// 批量更新提单
export async function updateBillsBatch(data: {
  ids: string[]
  field: string
  value: any
}) {
  const response = await axiosInstance.post('/bills/update-batch', data)
  return response.data
}

// 删除提单
export async function deleteBills(ids: string[]) {
  const response = await axiosInstance.post('/bills/delete', ids)
  return response.data
}

// 高级搜索
export async function searchBills(data: {
  queryTree?: any
  sort?: { field: string, order: 'asc' | 'desc' }[]
  page?: number
  limit?: number
}) {
  const response = await axiosInstance.post('/bills/search', data)
  return response.data
}

// 导出提单
export async function exportBills(data: {
  queryTree?: any
  sort?: { field: string, order: 'asc' | 'desc' }[]
  columns?: { field: string, label: string }[]
}) {
  const response = await axiosInstance.post('/bills/export', data, {
    responseType: 'blob',
  })
  return response.data
}

// 获取订单列表（用于下拉选择）
export async function getBillOrders(params?: {
  billingName?: string
  search?: string
  page?: number
  limit?: number
}) {
  const response = await axiosInstance.get('/bills/orders', { params })
  return response.data
}

// 搜索仓库
export async function searchWarehouses(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/warehouses', {
    params: { search, limit, page },
  })
  return response.data
}

// 搜索牌号
export async function searchBrands(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/brands', {
    params: { search, limit, page },
  })
  return response.data
}

// 搜索销售部门
export async function searchSaleDeps(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/sale_deps', {
    params: { search, limit, page },
  })
  return response.data
}
