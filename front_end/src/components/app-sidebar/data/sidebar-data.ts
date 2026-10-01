import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Database,
  Eye,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Settings2,
  Ship,
  ShoppingCart,
  Stamp,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-vue-next'

import type { NavGroup } from '../types'
import type { Features } from '@/stores/auth'
import { hasPermission, isAdmin, PERMISSIONS } from '@/constants/permissions'
import { getTitleCode } from '@/services/api/user.api'
import { visibleAttendanceSettingsViews } from '@/utils/attendance-settings'

export function generateNavData(privilege: string[], features?: Features, attendanceRoles: string[] = [], payrollRoles: string[] = [], isOwner = false, title = '', isCustodian = false, canReviewAttendance = false): NavGroup[] {
  const groups: NavGroup[] = []

  // 总览 - 所有人可见
  groups.push({
    title: '总览',
    items: [{ title: '首页', url: '/dashboard', icon: LayoutDashboard }],
  })

  // 考勤入口仅在功能开启后显示；实际分配的审批人也可进入本人待办与审核历史。
  if (features?.attendance) {
    const canApprove = canReviewAttendance || isOwner || isAdmin(privilege) || attendanceRoles.some(role => ['manager', 'general_manager', 'attendance_admin'].includes(role))
    // 工资管理菜单：财务可录入发布，总经理与董事长只读查看（职务可能是 gm/ceo，也可能是老账号的中文写法）
    const titleCode = getTitleCode(title)
    const canManagePayroll = payrollRoles.some(role => ['finance', 'general_manager'].includes(role)) || titleCode === 'gm' || titleCode === 'ceo'
    // 「设置」下的三个视图与考勤设置页共用同一份可见性规则，避免菜单能点、进了页面却说无权
    const settingsViews = visibleAttendanceSettingsViews({
      isOwner,
      isAppAdmin: isAdmin(privilege),
      attendanceRoles,
      payrollRoles,
    })
    const myRequestItems: { title: string; url: string }[] = [
      { title: '请假申请', url: '/attendance/requests?type=leave' },
      { title: '加班申请', url: '/attendance/requests?type=overtime' },
      { title: '出差申请', url: '/attendance/requests?type=fieldwork' },
    ]
    // 「待我审批」与「我的申请」一一对应；用章审批落在印章模块的收件箱里
    const approvalItems: { title: string; url: string }[] = [
      { title: '请假审批', url: '/attendance/approvals?type=leave' },
      { title: '加班审批', url: '/attendance/approvals?type=overtime' },
      { title: '出差审批', url: '/attendance/approvals?type=fieldwork' },
    ]
    if (features?.seal) {
      myRequestItems.push({ title: '用章申请', url: '/seal/requests' })
      // 只有能审用章单的人（主账号 / 管理员 / 总经理职务或角色）才给审批入口，与后端 hasGlobalApprovalView 一致
      const canApproveSeal = isOwner || isAdmin(privilege) || attendanceRoles.includes('general_manager') || titleCode === 'gm' || titleCode === 'ceo'
      if (canApproveSeal) approvalItems.push({ title: '用章审批', url: '/seal/requests?view=inbox' })
    }

    const attendanceItems: NavGroup['items'] = [
      { title: '我的申请', icon: CalendarDays, items: myRequestItems },
      ...(canApprove ? [{ title: '待我审批', icon: ClipboardList, items: approvalItems }] : []),
      // 「考勤台账」内含「明细台账 / 统计汇总」两个视图；「工资管理」下分「工资表 / 薪资统计 / 薪资设置」三个入口
      { title: '考勤台账', url: '/attendance/ledger', icon: ClipboardList },
      { title: '我的工资条', url: '/attendance/payroll/my', icon: Receipt },
      ...(canManagePayroll
        ? [{
            title: '工资管理',
            icon: FileText,
            items: [
              { title: '工资表', url: '/attendance/payroll/statements' },
              { title: '薪资统计', url: '/attendance/payroll/statistics' },
              { title: '薪资标准设置', url: '/attendance/payroll/settings' },
            ],
          }]
        : []),
      // 「设置」下按视图展开：员工资料 / 薪资权限 / 工作日历设置
      ...(settingsViews.length
        ? [{
            title: '设置',
            icon: Settings2,
            items: settingsViews.map(view => ({ title: view.label, url: view.url })),
          }]
        : []),
    ]
    groups.push({ title: '考勤与工资', items: attendanceItems })
  } else if (features?.seal) {
    // 仅开启用章模块、未开考勤时，独立渲染「我的申请」
    groups.push({
      title: '我的申请',
      items: [
        { title: '用章申请', url: '/seal/requests', icon: CalendarDays }
      ]
    })
  }

  // 印章管理模块（若启用用章功能，具有管理权限或管理员可见）
  if (features?.seal) {
    const titleCode = getTitleCode(title)
    const canManageSeal = isOwner || isAdmin(privilege) || attendanceRoles.some(role => ['general_manager'].includes(role)) || titleCode === 'gm' || titleCode === 'ceo' || isCustodian
    if (canManageSeal) {
      const sealItems: NavGroup['items'] = [
        { title: '印章工作台', url: '/seal/workbench', icon: Stamp },
        { title: '印章台账', url: '/seal/items', icon: Database },
        { title: '使用台账', url: '/seal/ledger', icon: FileText },
        ...(isOwner || isAdmin(privilege) ? [{ title: '用章设置', url: '/seal/settings', icon: Settings2 }] : [])
      ]
      groups.push({ title: '印章管理', items: sealItems })
    }
  }

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

    // 自有车权限即可看到自有车的结算管理（不需要额外的 custSettle/vesselSettle 权限）
    selfVehicleItems.push({
      title: '结算管理',
      icon: Receipt,
      items: [
        { title: '结算', url: '/settle/bill?selfOwned=true', icon: Receipt },
        { title: '开票', url: '/settle/ticket?selfOwned=true', icon: CreditCard },
        { title: '回款', url: '/settle/money?selfOwned=true', icon: CreditCard },
        { title: '车船结算', url: '/settle/vessel?selfOwned=true', icon: Ship },
      ],
    })

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
