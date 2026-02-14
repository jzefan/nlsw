import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface IntegratedQueryFilter {
  fName?: string[] // Billing Name
  fVeh?: string[] // Vehicle
  fVehMode?: string // Transport Mode
  fDest?: string[] // Destination
  fDate1?: string // Start Date
  fDate2?: string // End Date
  fBno?: string // Bill No
  fOrder?: string // Order No
  fType?: string // 'bill-first'
  fShowDestForVessel?: number // 0 or 1
  fCustomerName?: string // Ship Customer
  fShowUnsend?: number // 0 or 1
  page?: number
  limit?: number
  isExport?: boolean
}

export interface IntegratedQueryBill {
  _id: string
  status: string
  status_2?: string
  order_no: string
  order_item_no: string
  bill_no: string
  billing_name: string
  ship_customer?: string
  veh_ves_name?: string
  ship_to?: string
  send_num: number
  send_weight: number
  price: number
  collection_price: number
  veh_ves_price: number
  inv_ship_date?: string
  inv_shipper?: string
  inv_no?: string
  ship_warehouse?: string
  brand_no?: string
  thickness?: number
  width?: number
  len?: number
  size_type?: string
  block_num?: number
  total_weight: number
  contract_no?: string
  sales_dep?: string
  create_date: string
  creater?: string
  inv_settle_flag: number // 0, 1, 2, 3
  settle_flag?: number // Used in account checking export
  left_num: number // For "not sent" calculation
  weight: number // For "not sent" calculation
}

export interface IntegratedQueryResponse {
  ok: boolean
  bills: IntegratedQueryBill[]
  total?: number
  page?: number
  limit?: number
}

// 综合查询
export async function getIntegratedQuery(params: IntegratedQueryFilter) {
  const response = await axiosInstance.get<IntegratedQueryResponse>('/get_invoices_bill', {
    params,
    paramsSerializer: {
      indexes: null, // array params like fName[] will be fName=v1&fName=v2
    },
    timeout: 30000,
  })
  return response.data
}

export interface InvoiceReportFilter {
  fName?: string // Billing Name
  fVeh?: string // Vehicle
  fDest?: string // Destination
  fShipper?: string // Shipper
  fDate1?: string // Start Date
  fDate2?: string // End Date
}

export interface InvoicePriceSummary {
  cust_price: number
  veh_price: number
  net_income: number
}

export interface InvoiceReportResponse {
  ok: boolean
  hint: boolean
  num?: number
  invs: any[]
  prices: Record<string, InvoicePriceSummary>
}

// 运输价格报表
export async function getInvoiceReport(params: InvoiceReportFilter) {
  const response = await axiosInstance.get<InvoiceReportResponse>('/report/invoice_report', {
    params,
    timeout: 30000,
  })
  return response.data
}

export async function getWaybillDetail(wno: string) {
  const response = await axiosInstance.get<{ bills: any[], invoices: any[] }>('/get_waybill', {
    params: { q: wno },
  })
  return response.data
}
