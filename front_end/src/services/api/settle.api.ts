import type {
  PriceInputData,
  SettleBill,
  SettleFilterParams,
  SettleMode,
  SettleObject,
} from '@/pages/settle/types'

import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// 获取结算提单列表
export async function getSettleBills(params: SettleFilterParams) {
  const response = await axiosInstance.get<{
    ok: boolean
    bills: SettleBill[]
  }>('/settle/bills', { params })
  return response.data
}

// 价格输入
export async function inputPrice(data: PriceInputData[], action: SettleMode) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle/price_input',
    { data, act: action },
  )
  return response.data
}

// 结算
export async function settleBills(data: {
  settleObj: SettleObject[]
  price: number
  settle_type: SettleMode
  billName: string
  shipTo: string
  selfOwned?: number
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle/settle_bill',
    data,
  )
  return response.data
}

// 标记不需要结算
export async function markNotRequireSettle(data: {
  nonSettleObj: Array<{ bid: string, inv_no: string, settle_flag?: number }>
  settle_type: SettleMode
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle/not_require_settle',
    data,
  )
  return response.data
}

// 获取车辆列表
export async function getVehicleList() {
  const response = await axiosInstance.get<{ ok: boolean, vehicles: Array<{ name: string, veh_type: string }> }>(
    '/settle/vehicles',
  )
  return response.data
}

// 车船结算 - 获取初始数据
export async function getVesselSettleData(params: any) {
  const response = await axiosInstance.get<{
    ok: boolean
    options: {
      vehicleList: string[]
      contactList: string[]
      nameList: string[]
      destList: string[]
      vehPersonMap: Record<string, any>
    }
  }>('/settle/vessel_initial_data', { params })
  return response.data
}

// 车船结算 - 查询运单
export async function getInvoiceSettleVessel(params: {
  fVeh?: string | null
  fContact?: string | null
  fName?: string | null
  fDest?: string | null
  fDate1?: string | null
  fDate2?: string | null
  fSettledState?: string
  fReceipt?: number
  fAmount?: string
  fWeight?: string
}) {
  const response = await axiosInstance.get<{
    ok: boolean
    invs: any[]
  }>('/get_invoice_settle_vellel', { params })
  return response.data
}

// 车船结算 - 更新价格
export async function updateVesselPrice(data: {
  wnoList: string[]
  priceData: Array<{
    wno: string
    price: number
    inner: number
    mode: number
    unitPrice: number
    remark: string
  }>
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle_vessel_price',
    data,
  )
  return response.data
}

// 车船结算 - 结算
export async function settleVessel(data: {
  allSelectedInvNo: string[]
  allInvNoFromInner: string[]
  allInnerNo: string[]
  settle: boolean
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle_vessel',
    data,
  )
  return response.data
}

// 车船结算 - 付款
export async function settleVesselPay(data: {
  allPayInvNo: string[]
  allInvNoFromInner: string[]
  allInnerNo: string[]
  forPay: boolean
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle_vessel_pay',
    data,
  )
  return response.data
}

// 车船结算 - 更新卸船/滞留信息
export async function updateVesselDelayInfo(data: {
  unshipData: {
    unship_date?: any
    delay_day?: number
    charge_cash?: number
    charge_oil?: number
    receipt?: number
    remark?: string
  }
  wnoList: string[]
  partInd: number
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle_vessel_delay_info',
    data,
  )
  return response.data
}

// 车船结算 - 标记不需要结算
export async function settleVesselNotNeeded(data: {
  wayNoList: string[]
  notNeeded: boolean
}) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/settle_vessel_not_needed',
    data,
  )
  return response.data
}

// 车船结算 - 更新承运单位
export async function postCarrierDepartment(data: {
  vehName: string
  wno: string
  boss: string
}) {
  const response = await axiosInstance.post<{
    ok: boolean
    data?: {
      name: string
      boss: string
      real_boss: Array<{ waybill_no: string, rb: string }>
    }
  }>('/post-carrier-department', data)
  return response.data
}

// 车船结算 - 上传回执图片
export async function uploadReceiptImg(formData: FormData) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/upload-receipt-img',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  )
  return response.data
}

// 车船结算 - 获取回执图片（旧接口，保留兼容性）
export async function getReceiptImg(wno: string) {
  const response = await axiosInstance.get<{
    ok: boolean
    contentType?: string
    data?: string
  }>('/get-receipt-img', { params: { q: wno } })
  return response.data
}

// 车船结算 - 获取回执图片列表（新接口，支持多图）
export async function getReceiptImagesList(wno: string) {
  const response = await axiosInstance.get<{
    ok: boolean
    images: Array<{
      id: string
      filename: string
      original_filename: string
      file_size: number
      mime_type: string
      uploader: string
      upload_time: string
    }>
    total: number
  }>('/get-receipt-images-list', { params: { q: wno } })
  return response.data
}

// 车船结算 - 根据ID获取单张回执图片
export async function getReceiptImageById(imageId: string) {
  const response = await axiosInstance.get<{
    ok: boolean
    contentType?: string
    data?: string
    filename?: string
  }>('/get-receipt-image-by-id', { params: { id: imageId } })
  return response.data
}

// 车船结算 - 删除回执图片
export async function deleteReceiptImage(imageId: string) {
  const response = await axiosInstance.delete<{
    ok: boolean
    message?: string
  }>('/delete-receipt-image', { params: { id: imageId } })
  return response.data
}

// 车船结算 - 获取运单详情
export async function getWaybill(wno: string) {
  const response = await axiosInstance.get<{
    bills: any[]
    invoices: any[]
  }>('/get_waybill', { params: { q: wno } })
  return response.data
}

// 车船结算 - 搜索车船号（包括车和船）
export async function searchVehicles(search: string, limit: number) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: Array<{ name: string }>
  }>('/vehicles/search', {
    params: { search, limit },  // 不传 type，搜索所有车船
  })
  return response.data
}

// 车船结算 - 搜索开单名称（使用通用的 companies 接口）
export async function searchBillingNames(search: string, limit: number) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: Array<{ name: string }>
  }>('/companies', {
    params: { search, limit },
  })
  return response.data
}

// 车船结算 - 搜索目的地（使用通用的 destinations 接口）
export async function searchDestinations(search: string, limit: number) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: Array<{ name: string }>
  }>('/destinations', {
    params: { search, limit },
  })
  return response.data
}
