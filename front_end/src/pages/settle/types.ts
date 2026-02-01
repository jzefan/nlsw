// 结算模式
export type SettleMode = 'CUSTOMER' | 'COLLECTION'

// 结算标志位
export const CUSTOMER_SETTLE_FLAG = 1 // 0001
export const COLLECTION_SETTLE_FLAG = 2 // 0010

// 结算提单数据结构
export interface SettleBill {
  _id: string
  bill_no: string
  order_no: string
  order_item_no?: string
  billing_name: string
  ship_customer?: string
  veh_ves_name: string
  ship_to: string
  ship_from: string
  ship_warehouse?: string
  inv_no: string
  inv_ship_date: string
  inv_shipper?: string

  // 发运信息
  send_num: number
  send_weight: number

  // 规格
  thickness: number
  width: number
  len: number
  contract_no?: string

  // 价格信息
  price: number // 客户价格: 0=未输入, -1=不需结算, >0=已输入
  collection_price: number // 代收代付价格
  incoming_price_remark?: string // 价格备注

  // 结算状态
  inv_settle_flag: number // 位标志: 1=客户已结算, 2=代收代付已结算
  settle_flag?: number
  status?: string
}

// 过滤参数
export interface SettleFilterParams {
  fName?: string[] // 开单名称
  fVeh?: string[] // 车号
  fShipFrom?: string[] // 起始地
  fDest?: string[] // 目的地
  fOrder?: string[] // 订单号
  fBno?: string[] // 提单号
  fInvNo?: string[] // 运单号
  fDate1?: string // 起始日期
  fDate2?: string // 结束日期
  fType: 'invoice-first'
  selfOwned?: number
}

// 价格输入数据
export interface PriceInputData {
  bid: string
  inv_no: string
  price: number
  remark?: string
}

// 结算对象
export interface SettleObject {
  bid: string
  inv_no: string
  num: number
  weight: number
  settle_flag: number
}

// 价格输入模式
export type PriceMode = 'unit' | 'bale' // unit=每吨单价, bale=打包价

// 批量输入分组（用于客户结算）
export interface BatchPriceGroup {
  billingName: string
  items: Array<{
    vehVesName: string
    shipTo: string
    id: string // 用于表单 ID
  }>
}
