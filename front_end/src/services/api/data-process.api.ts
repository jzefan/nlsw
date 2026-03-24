import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface SaveShipmentPayload {
  productType: 'round-steel' | 'plate'
  rows: {
    bundleNo: string
    orderNo: string
    orderItemNo: string
    quantity: number
    weight: number
    thickness: number
    width: number
    length: number
    brandNo: string
    fixedLength: number
    customerName: string
    loadingListNo: string
    vehicleNo: string
    contractNo: string
  }[]
}

export interface SaveShipmentResponse {
  ok: boolean
  data?: { batchId: string, count: number }
  error?: string
}

export interface ShipmentListParams {
  batchId?: string
  loadingListNo?: string
  orderNo?: string
  productType?: string
  page?: number
  limit?: number
}

export async function saveShipmentDetail(payload: SaveShipmentPayload): Promise<SaveShipmentResponse> {
  const response = await axiosInstance.post('/data-process/shipment/save', payload)
  return response.data
}

export async function getShipmentDetails(params: ShipmentListParams) {
  const response = await axiosInstance.get('/data-process/shipment/list', { params })
  return response.data
}

export interface ShipmentBatch {
  batchId: string
  productType: 'round-steel' | 'plate'
  createdBy: string
  createdAt: string
  rowCount: number
  totalWeight: number
  loadingListNos: string[]
  vehicleNos: string[]
  loadingVehiclePairs: string[]
}

export interface ShipmentBatchListParams {
  productType?: string
  page?: number
  limit?: number
}

export interface ShipmentBatchListResponse {
  ok: boolean
  data: ShipmentBatch[]
  total: number
  page: number
  totalPages: number
}

export async function getShipmentBatches(params: ShipmentBatchListParams): Promise<ShipmentBatchListResponse> {
  const response = await axiosInstance.get('/data-process/shipment/batches', { params })
  return response.data
}

export async function deleteShipmentBatch(batchId: string) {
  const response = await axiosInstance.post('/data-process/shipment/delete-batch', { batchId })
  return response.data as { ok: boolean, data?: { deletedCount: number }, error?: string }
}

export async function updateShipmentDetail(id: string, updates: Record<string, any>) {
  const response = await axiosInstance.post('/data-process/shipment/update', { id, updates })
  return response.data as { ok: boolean, data?: any, error?: string }
}

/**
 * Convert flat API detail rows into LoadingListGroup[] format
 * for use with the LoadingListEditor component.
 * Groups by loadingListNo, no intra-group aggregation (each DB row stays separate).
 */
export function detailRowsToGroups(rows: any[]): import('@/utils/excel-transform').LoadingListGroup[] {
  const groupMap = new Map<string, { rows: any[], vehicleNo: string }>()

  for (const row of rows) {
    const key = row.loadingListNo || '未知装车单'
    let group = groupMap.get(key)
    if (!group) {
      group = { rows: [], vehicleNo: row.vehicleNo || '' }
      groupMap.set(key, group)
    }
    group.rows.push(row)
    if (row.vehicleNo && !group.vehicleNo) {
      group.vehicleNo = row.vehicleNo
    }
  }

  return Array.from(groupMap.entries()).map(([loadingListNo, { rows: groupRows, vehicleNo }]) => ({
    loadingListNo,
    vehicleNo,
    rows: groupRows.map(r => ({
      _id: r._id,
      bundleNo: r.bundleNo || '',
      orderNo: r.orderNo || '',
      orderItemNo: r.orderItemNo || '',
      quantity: r.quantity || 0,
      weight: r.weight || 0,
      thickness: r.thickness || 0,
      width: r.width || 0,
      length: r.length || 0,
      brandNo: r.brandNo || '',
      fixedLength: r.fixedLength || 0,
      customerName: r.customerName || '',
      warehouse: '',
      billNo: r.billNo || '',
      contractNo: r.contractNo || '',
      colorMark: r.colorMark || '',
    })),
    rawRows: [],
    subtotalQuantity: groupRows.reduce((s: number, r: any) => s + (r.quantity || 0), 0),
    subtotalWeight: groupRows.reduce((s: number, r: any) => s + (r.weight || 0), 0),
  }))
}
