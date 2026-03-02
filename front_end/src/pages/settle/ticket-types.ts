// 结算类型
export type SettleType = 'CUSTOMER' | 'COLLECTION'

// 结算状态
export type SettleStatus = '已结算' | '已开票' | '已回款'

// 显示模式
export type DisplayMode = 'settle' | 'ticket' | 'money'

// 结算记录
export interface SettleRecord {
  _id: string
  serial_number: string
  billing_name: string
  price: number
  real_price: number
  settle_type: string
  ship_number: number
  ship_weight: number
  ship_to: string
  bills: SettleBill[]
  settle_date: string
  ticket_date?: string
  return_money_date?: string
  settler: string
  ticket_person?: string
  return_person?: string
  ticket_no?: string
  selfOwned: number
  status: SettleStatus
  remark?: string
}

// 结算提单
export interface SettleBill {
  bill_id: string
  num: number
  weight: number
  inv_no: string
  settle_flag: number
}

// 过滤参数
export interface TicketFilterParams {
  settle_type?: SettleType
  display_mode?: DisplayMode
  billing_name?: string
  price_min?: number
  price_max?: number
  date_start?: string
  date_end?: string
  selfOwned?: string
}

// 开票数据
export interface TicketData {
  _id: string
  ticket_no: string
  ticket_date: Date
  ticket_person: string
  status: SettleStatus
}

// 删除结算请求
export interface DeleteSettleRequest {
  settle_ids: string[]
  settle_type: SettleType
}
