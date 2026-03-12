import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// 车辆/船舶信息
export interface Vehicle {
  _id?: string
  name: string
  veh_type: '车' | '船'
  phone?: string
  contact?: string
}

// 运单中的提单信息
export interface InvoiceBill {
  _id?: string // 提单ID
  bill_no: string
  order_no: string
  order_item_no?: string
  brand_no?: string
  thickness?: number
  width?: number
  len?: number
  weight?: number
  ship_warehouse?: string
  contract_no?: string
  send_num: number
  send_weight: number
  wagon_no?: string // 船运时的车号
  inner_waybill_no?: string
  original_left_num?: number // 加载时的 left_num 快照，用于并发检测
}

// 运单
export interface Invoice {
  _id?: string
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_customer?: string
  ship_from: string
  ship_to: string
  ship_date?: Date | string
  total_weight: number
  total_number: number
  bills: InvoiceBill[]
  state: string
  username?: string
  shipper?: string
  selfOwned?: boolean
  create_date?: Date | string
}

export interface InvoiceListResponse {
  ok: boolean
  invoices: Invoice[]
  total: number
  page: number
  totalPages: number
}

// 获取新运单号
export async function getMaxWaybillNo() {
  const response = await axiosInstance.get<{ ok: boolean, max_no: string }>('/get_max_waybill_no')
  return response.data
}

// 获取运单列表
export async function getInvoices(params: {
  page?: number
  limit?: number
  waybillNo?: string
  shipName?: string
  vehicleName?: string
  state?: string
  startDate?: string
  endDate?: string
}) {
  const response = await axiosInstance.get<InvoiceListResponse>('/invoices', { params })
  return response.data
}

// 获取运单列表（新API，支持关键字搜索）
export async function getInvoiceList(params?: {
  keyword?: string
  waybillNo?: string
  vehicleName?: string
  shipName?: string
  shipTo?: string
  shipperName?: string
  startDate?: string
  endDate?: string
  limit?: number
  page?: number
  myOnly?: boolean
  transportType?: '车' | '船'
}) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: any[]
    total: number
    page: number
    limit: number
  }>('/invoices', { params })
  return response.data
}

// 获取运单详情
export async function getInvoiceDetail(waybillNo: string) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: any
    message?: string
  }>(`/invoices/${waybillNo}`)
  return response.data
}

// 根据条件查询运单
export async function getInvoicesByCondition(params: {
  q: string
  isNeedAnalysis?: boolean
}) {
  const response = await axiosInstance.get('/get_invoices_by_condition', { params })
  return response.data
}

// 搜索可配发提单的开单名称（新建或部分配发状态）
export async function searchBillingNames(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/bills/billing-names', {
    params: { search, limit, page },
  })
  return response.data
}

// 根据开单名称获取提单（2年内剩余量大于0的提单）
export async function getBillsByBillingName(billingName: string, search?: string, page = 1, limit = 100) {
  const response = await axiosInstance.get('/bills/orders', {
    params: { billingName, search, page, limit },
  })
  return response.data
}

// 创建/保存运单 (车运) - 旧接口，保留兼容
export async function buildInvoice(data: {
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_customer?: string
  ship_from: string
  ship_to: string
  ship_date?: Date | string
  bills: InvoiceBill[]
  total_weight: number
  state: string
  username?: string
  shipper?: string
  selfOwned?: boolean
}) {
  const response = await axiosInstance.post('/build_invoice', data)
  return response.data
}

// 创建/保存运单 (车运) - 新接口，正确处理bill更新
export async function buildTruckInvoice(data: {
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_customer?: string
  ship_from: string
  ship_to: string
  ship_date?: Date | string
  bills: InvoiceBill[]
  total_weight: number
  state: string
  username?: string
  shipper?: string
  selfOwned?: boolean
}) {
  const response = await axiosInstance.post('/build_truck_invoice', data)
  return response.data
}

// 创建/保存运单 (船运) - 处理车辆分组的结构
export async function buildShipInvoice(data: {
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_customer?: string
  ship_from: string
  ship_to: string
  ship_date?: Date | string
  bills: InvoiceBill[]
  total_weight: number
  state: string
  username?: string
  shipper?: string
  selfOwned?: boolean
}) {
  const response = await axiosInstance.post('/build_ship_invoice', data)
  return response.data
}

// 修改运单
export async function distributeInvoice(data: {
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_customer?: string
  ship_from: string
  ship_to: string
  ship_date?: Date | string
  bills: InvoiceBill[]
  total_weight: number
  state: string
  username?: string
  shipper?: string
}) {
  const response = await axiosInstance.post('/distribute_invoice', data)
  return response.data
}

// 删除运单
export async function deleteInvoice(invoice: Invoice) {
  const response = await axiosInstance.post('/delete_invoice', invoice)
  return response.data
}

// 获取车辆列表
export async function getVehicles(params?: {
  search?: string
  type?: '车' | '船'
  page?: number
  limit?: number
}) {
  const response = await axiosInstance.get('/vehicles/search', { params })
  return response.data
}

// 搜索车辆
export async function searchVehicles(
  search: string,
  type?: '车' | '船',
  limit = 20,
  page = 1,
  category?: '自有' | '外挂'
) {
  const response = await axiosInstance.get('/vehicles/search', {
    params: { search, type, limit, page, category },
  })
  return response.data
}

// 获取仓库列表
export async function getWarehouses(params?: {
  search?: string
  page?: number
  limit?: number
}) {
  const response = await axiosInstance.get('/warehouses', { params })
  return response.data
}

// 获取目的地列表
export async function getDestinations(params?: {
  search?: string
  page?: number
  limit?: number
}) {
  const response = await axiosInstance.get('/destinations', { params })
  return response.data
}

// 搜索目的地
export async function searchDestinations(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/destinations', {
    params: { search, limit, page },
  })
  return response.data
}

// 搜索仓库
export async function searchWarehouses(search: string, limit = 20, page = 1) {
  const response = await axiosInstance.get('/warehouses', {
    params: { search, limit, page },
  })
  return response.data
}
