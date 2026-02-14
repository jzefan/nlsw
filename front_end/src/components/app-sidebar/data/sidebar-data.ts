import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Circle,
  CircleDollarSign,
  Database,
  FileText,
  FolderOpen,
  Home,
  ListOrdered,
  Package,
  PlusCircle,
  Search,
  Settings2,
  Square,
  Trash2,
  Truck,
} from 'lucide-vue-next'

import {
  canManageBill as _canManageBill,
  isAdmin as _isAdmin,
  hasAnyPermission,
  hasPermission,
} from '@/lib/permissions'

import type { NavGroup, PrivilegeCheck } from '../types'

// 权限检查辅助函数（适配 PrivilegeCheck 签名）
const isAdmin: PrivilegeCheck = p => _isAdmin(p)
const _isStatistician: PrivilegeCheck = p => hasPermission(p, 'statistics')
const isAccountant: PrivilegeCheck = p => hasPermission(p, 'account')
const _isOperator: PrivilegeCheck = p => hasPermission(p, 'operator')
const hasCustomerRevenueAccess: PrivilegeCheck = p => hasPermission(p, 'custRevenue')
const hasVesselRevenueAccess: PrivilegeCheck = p => hasPermission(p, 'vesselRevenue')
const _hasSelfVehicleAccess: PrivilegeCheck = p => hasPermission(p, 'selfVehicle')

// 非会计类用户（可管理提单）
const canManageBill: PrivilegeCheck = p => _canManageBill(p)

// 可管理运单
const canManageInvoice: PrivilegeCheck = p => hasAnyPermission(p, 'operator', 'statistics', 'account')

// 可管理结算
const canManageSettle: PrivilegeCheck = p => hasAnyPermission(p, 'statistics', 'account')

// 导出菜单数据生成函数
export function generateNavData(privilege: string): NavGroup[] {
  const navMain: NavGroup[] = []

  // ==================== 第一组：首页 ====================
  navMain.push({
    title: '首页',
    items: [
      {
        title: '工作台',
        url: '/dashboard',
        icon: Home,
      },
    ],
  })

  // ==================== 第二组：业务操作 ====================
  const businessItems = []

  // 订单计划 - 所有人可见
  businessItems.push({
    title: '订单计划',
    icon: BookOpen,
    items: [
      { title: '新建计划', url: '/plans/create', icon: PlusCircle },
      { title: '计划列表', url: '/plans', icon: ListOrdered },
    ],
  })

  // 提单管理 - 非会计类用户可见
  if (canManageBill(privilege)) {
    businessItems.push({
      title: '提单管理',
      icon: FileText,
      items: [
        { title: '新建提单', url: '/bills/create', icon: PlusCircle },
        { title: '提单列表', url: '/bills/list', icon: ListOrdered },
        { title: '删除提单', url: '/bills/delete', icon: Trash2 },
      ],
    })
  }

  // 运单管理 - 管理员/统计员/会计/操作员可见
  if (canManageInvoice(privilege)) {
    const invoiceItems = [
      { title: '配发货-车运', url: '/invoices/create-truck', icon: Package },
      { title: '配发货-船运', url: '/invoices/create-ship', icon: Package },
    ]
    // 删除运单 - 会计权限
    if (isAccountant(privilege)) {
      invoiceItems.push({ title: '删除运单', url: '/invoices/delete', icon: Trash2 })
    }
    businessItems.push({
      title: '运单管理',
      icon: Truck,
      items: invoiceItems,
    })
  }

  // 结算管理 - 统计员/会计可见
  if (canManageSettle(privilege)) {
    const settleItems = []
    if (privilege !== '01000000') {
      settleItems.push(
        { title: '结算', url: '/settle/bill', icon: CircleDollarSign },
        { title: '开票', url: '/settle/ticket', icon: FileText },
        { title: '回款', url: '/settle/money', icon: CircleDollarSign },
      )
    }
    settleItems.push({ title: '车船结算', url: '/settle/vessel', icon: Truck })
    businessItems.push({
      title: '结算管理',
      icon: CircleDollarSign,
      items: settleItems,
    })
  }

  // 自有车管理 - 自有车权限
  /*
  if (hasSelfVehicleAccess(privilege)) {
    const selfVehicleItems = [
      { title: '配发货(新建运单)', url: '/self-vehicle/invoices/create', icon: Package },
      { title: '结算', url: '/self-vehicle/settle/bill', icon: CircleDollarSign },
    ]
    if (privilege !== '01000000') {
      selfVehicleItems.push(
        { title: '开票', url: '/self-vehicle/settle/ticket', icon: FileText },
        { title: '回款', url: '/self-vehicle/settle/money', icon: CircleDollarSign },
      )
    }
    selfVehicleItems.push({ title: '车船结算', url: '/self-vehicle/settle/vessel', icon: Truck })
    businessItems.push({
      title: '自有车管理',
      icon: Truck,
      items: selfVehicleItems,
    })
  }
  */

  if (businessItems.length > 0) {
    navMain.push({
      title: '业务操作',
      items: businessItems,
    })
  }

  // ==================== 第三组：数据与报表 ====================
  const dataReportItems = []

  // 报表和统计 - 所有人可见，子菜单有权限控制
  const reportSubItems = [
    { title: '综合查询', url: '/reports/integrated', icon: Search },
    { title: '运单报表', url: '/reports/invoice', icon: FileText },
  ]

  // 营业额相关（需要权限）
  if (hasCustomerRevenueAccess(privilege)) {
    reportSubItems.push({ title: '客户营业额', url: '/reports/customer-revenue', icon: BarChart3 })
  }
  if (hasVesselRevenueAccess(privilege)) {
    reportSubItems.push({ title: '车船营业额', url: '/reports/vessel-revenue', icon: BarChart3 })
  }
  if (hasCustomerRevenueAccess(privilege) || hasVesselRevenueAccess(privilege)) {
    reportSubItems.push({ title: '运输价格报表', url: '/reports/shipping-charge', icon: BarChart3 })
  }

  // 短驳/叉车应收款（管理员）
  if (isAdmin(privilege)) {
    reportSubItems.push({ title: '短驳/叉车应收款', url: '/reports/drayage-forklift', icon: ChevronRight })
  }

  // 车船固定费用（会计）
  if (isAccountant(privilege)) {
    reportSubItems.push({ title: '车船固定费用', url: '/reports/vessel-fixed-cost', icon: ChevronRight })
  }

  dataReportItems.push({
    title: '报表统计',
    icon: BarChart3,
    items: reportSubItems,
  })

  // 数据字典 - 所有人可见
  dataReportItems.push({
    title: '数据字典',
    icon: Database,
    items: [
      { title: '车船号', url: '/data/vehicles', icon: Truck },
      { title: '发货单位', url: '/data/companies', icon: FolderOpen },
      { title: '仓库', url: '/data/warehouses', icon: Package },
      { title: '目的地', url: '/data/destinations', icon: ChevronRight },
      { title: '牌号', url: '/data/brands', icon: ChevronRight },
      { title: '销售部门', url: '/data/sale-deps', icon: ChevronRight },
    ],
  })

  // 数据处理 - 所有人可见
  dataReportItems.push({
    title: '数据处理',
    icon: Settings2,
    items: [
      { title: '圆钢', url: '/data-process/round-steel', icon: Circle },
      { title: '板材', url: '/data-process/plate', icon: Square },
    ],
  })

  navMain.push({
    title: '数据与报表',
    items: dataReportItems,
  })

  return navMain
}

// 默认导出（用于未登录时的占位）
export const defaultNavData: NavGroup[] = generateNavData('00000000')
