import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  Database,
  Eye,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Ship,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-vue-next'

import type { NavGroup } from '../types'
import type { Features } from '@/stores/auth'
import { hasPermission, isAdmin, PERMISSIONS } from '@/constants/permissions'

export function generateNavData(privilege: string[], features?: Features): NavGroup[] {
  const groups: NavGroup[] = []

  // 总览 - 所有人可见
  groups.push({
    title: '总览',
    items: [{ title: '首页', url: '/dashboard', icon: LayoutDashboard }],
  })

  // 业务管理 - 业务员或客户结算或车船结算或管理员
  if (hasPermission(privilege, PERMISSIONS.OPERATOR) || hasPermission(privilege, PERMISSIONS.CUST_SETTLE) || hasPermission(privilege, PERMISSIONS.VESSEL_SETTLE)) {
    const bizItems: NavGroup['items'] = []

    if (hasPermission(privilege, PERMISSIONS.OPERATOR)) {
      bizItems.push(
        {
          title: '订单计划',
          icon: ClipboardList,
          items: [
            { title: '新建计划', url: '/plans/create' },
            { title: '计划列表', url: '/plans' },
          ],
        },
        {
          title: '提单管理',
          icon: FileText,
          items: [
            { title: '新建提单', url: '/bills/create' },
            { title: '提单列表', url: '/bills/list' },
            { title: '删除提单', url: '/bills/delete' },
          ],
        },
        {
          title: '运单管理',
          icon: Truck,
          // icon: Receipt,
          items: [
            { title: '配发货-车运', url: '/invoices/create-truck' },
            { title: '配发货-船运', url: '/invoices/create-ship' },
            { title: '删除运单', url: '/invoices/delete' },
          ],
        },
      )
    }

    if (hasPermission(privilege, PERMISSIONS.CUST_SETTLE) || hasPermission(privilege, PERMISSIONS.VESSEL_SETTLE)) {
      const settleItems: { title: string; url: string; icon?: any }[] = []

      if (hasPermission(privilege, PERMISSIONS.CUST_SETTLE)) {
        settleItems.push(
          { title: '结算', url: '/settle/bill', icon: Receipt },
          { title: '开票', url: '/settle/ticket', icon: CreditCard },
          { title: '回款', url: '/settle/money', icon: CreditCard },
        )
      }
      if (hasPermission(privilege, PERMISSIONS.VESSEL_SETTLE)) {
        settleItems.push({ title: '车船结算', url: '/settle/vessel', icon: Ship })
      }

      bizItems.push({
        title: '结算管理',
        icon: Receipt,
        items: settleItems,
      })
    }

    groups.push({
      title: '业务管理',
      items: bizItems,
    })
  }

  // 自有车管理 - 仅在功能开关启用 + 有权限时显示
  if (features?.selfVehicle && hasPermission(privilege, PERMISSIONS.SELF_VEHICLE)) {
    const selfVehicleItems: NavGroup['items'] = [
      {
        title: '运单管理',
        icon: Truck,
        items: [
          { title: '配发货-车运', url: '/invoices/create-truck?selfOwned=true' },
          { title: '配发货-船运', url: '/invoices/create-ship?selfOwned=true' },
        ],
      },
    ]

    const selfSettleItems: { title: string; url: string; icon?: any }[] = []
    if (hasPermission(privilege, PERMISSIONS.CUST_SETTLE)) {
      selfSettleItems.push(
        { title: '结算', url: '/settle/bill?selfOwned=true', icon: Receipt },
        { title: '开票', url: '/settle/ticket?selfOwned=true', icon: CreditCard },
        { title: '回款', url: '/settle/money?selfOwned=true', icon: CreditCard },
      )
    }
    if (hasPermission(privilege, PERMISSIONS.VESSEL_SETTLE)) {
      selfSettleItems.push({ title: '车船结算', url: '/settle/vessel?selfOwned=true', icon: Ship })
    }
    if (selfSettleItems.length > 0) {
      selfVehicleItems.push({
        title: '结算管理',
        icon: Receipt,
        items: selfSettleItems,
      })
    }

    groups.push({
      title: '自有车管理',
      items: selfVehicleItems,
    })
  }

  // 数据与报表
  {
    const groupItems: NavGroup['items'] = []

    // 综合查询和运单报表 - 所有用户可见
    const reportItems: NavGroup['items'][0] = {
      title: '报表统计',
      icon: TrendingUp,
      items: [
        { title: '综合查询', url: '/reports/integrated' },
        { title: '运单报表', url: '/reports/invoice' },
      ],
    }

    // 以下报表需要统计或会计权限
    if (hasPermission(privilege, PERMISSIONS.STATISTICS) || hasPermission(privilege, PERMISSIONS.ACCOUNT)) {
      reportItems.items!.push(
        { title: '运输价格报表', url: '/reports/shipping-charge' },
        { title: '短驳叉车应收款', url: '/reports/drayage-forklift' },
        { title: '车船固定费用', url: '/reports/vessel-fixed-cost' },
      )
    }
    if (hasPermission(privilege, PERMISSIONS.CUST_REVENUE)) {
      reportItems.items!.push({ title: '客户营业额', url: '/reports/customer-revenue' })
    }
    if (hasPermission(privilege, PERMISSIONS.VESSEL_REVENUE)) {
      reportItems.items!.push({ title: '车船营业额', url: '/reports/vessel-revenue' })
    }
    groupItems.push(reportItems)

    // 基础数据 - 所有用户可见
    groupItems.push({
      title: '基础数据',
      icon: Database,
      items: [
        { title: '车船号', url: '/data/vehicles' },
        { title: '发货单位', url: '/data/companies' },
        { title: '仓库', url: '/data/warehouses' },
        { title: '目的地', url: '/data/destinations' },
        { title: '牌号', url: '/data/brands' },
        { title: '销售部门', url: '/data/sale-deps' },
      ],
    })

    // 数据处理 - 所有用户可见
    groupItems.push({
      title: '数据处理',
      icon: BookOpen,
      items: [
        { title: '圆钢', url: '/data-process/round-steel' },
        { title: '板材', url: '/data-process/plate' },
      ],
    })

    groups.push({
      title: '数据与报表',
      items: groupItems,
    })
  }

  // 设置 - 所有人可见
  groups.push({
    title: '其他',
    items: [
      {
        title: '设置',
        icon: Settings,
        items: [{ title: '密码修改', url: '/settings/account', icon: Wrench }],
      },
    ],
  })

  return groups
}

export function generatePlatformNavData(): NavGroup[] {
  return [
    {
      title: '平台管理',
      items: [
        { title: '账号管理', url: '/platform/tenants', icon: Building2 },
        { title: '订单管理', url: '/platform/orders', icon: ShoppingCart },
        { title: '业务查看', url: '/platform/business', icon: Eye },
        { title: '统计报告', url: '/platform/statistics', icon: BarChart3 },
      ],
    },
    {
      title: '其他',
      items: [
        {
          title: '设置',
          icon: Settings,
          items: [{ title: '密码修改', url: '/settings/account', icon: Wrench }],
        },
      ],
    },
  ]
}
