import type { Component } from 'vue'
import type { HubGroup } from '../types'
import type { ModuleAccessInput } from '@/utils/module-access'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock3,
  Database,
  FileText,
  FileWarning,
  MapPin,
  Receipt,
  Send,
  Settings2,
  Stamp,
  UserCog,
  Wallet,
} from 'lucide-vue-next'

import { useApprovalStore } from '@/stores/approvals'
import { useAuthStore } from '@/stores/auth'
import { visibleAttendanceSettingsViews } from '@/utils/attendance-settings'
import { canApproveSeal, canManagePayroll, canManageSeal, canManageSealSettings, canReviewAttendanceRequests, isSealCustodian } from '@/utils/module-access'

/**
 * 移动端「考勤首页 / 工资首页 / 用章首页」的入口清单。
 * 可见性判据与左侧菜单共用 utils/module-access.ts，避免出现「首页有入口、点进去无权」。
 */
export function useModuleHub() {
  const authStore = useAuthStore()
  const approvalStore = useApprovalStore()
  const { user } = storeToRefs(authStore)
  const { counts } = storeToRefs(approvalStore)

  const roles = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : [])

  const access = computed<ModuleAccessInput>(() => ({
    isOwner: authStore.isOwner,
    privilege: user.value?.privilege ?? [],
    attendanceRoles: roles(user.value?.attendanceRoles),
    payrollRoles: roles(user.value?.payrollRoles),
    title: user.value?.title ?? '',
    isCustodian: isSealCustodian(user.value, authStore.tenant),
    canReviewAttendance: user.value?.canReviewAttendance === true,
  }))

  // 同一类入口在三个首页里保持同一个配色
  const tones = {
    blue: { color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
    amber: { color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
    emerald: { color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30' },
    violet: { color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/30' },
    cyan: { color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
    rose: { color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-900/30' },
    indigo: { color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
    teal: { color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
    slate: { color: 'text-slate-600', bgColor: 'bg-slate-100 dark:bg-slate-700/40' },
  } as const

  function entry(title: string, to: string, icon: Component, tone: keyof typeof tones, count = 0) {
    return { title, to, icon, ...tones[tone], count: count || undefined }
  }

  const attendanceGroups = computed<HubGroup[]>(() => {
    const groups: HubGroup[] = [{
      label: '我的申请',
      items: [
        entry('请假申请', '/attendance/requests?type=leave', CalendarDays, 'blue'),
        entry('加班申请', '/attendance/requests?type=overtime', Clock3, 'amber'),
        entry('出差申请', '/attendance/requests?type=fieldwork', MapPin, 'emerald'),
        entry('考勤申述', '/attendance/requests?type=appeal', FileWarning, 'rose'),
      ],
    }]

    if (canReviewAttendanceRequests(access.value)) {
      groups.push({
        label: '待我审批',
        items: [
          entry('请假审批', '/attendance/approvals?type=leave', CalendarCheck, 'blue', counts.value.leave),
          entry('加班审批', '/attendance/approvals?type=overtime', Clock3, 'amber', counts.value.overtime),
          entry('出差审批', '/attendance/approvals?type=fieldwork', MapPin, 'emerald', counts.value.fieldwork),
          entry('申述审批', '/attendance/approvals?type=appeal', FileWarning, 'rose', counts.value.appeal),
          entry('审核记录', '/attendance/approval-history', ClipboardList, 'slate'),
        ],
      })
    }

    groups.push({
      label: '台账',
      items: [
        entry('考勤台账', '/attendance/ledger', ClipboardList, 'violet'),
        entry('统计汇总', '/attendance/ledger?view=stats', BarChart3, 'cyan'),
      ],
    })

    // 与侧栏「设置」同一份可见性规则（utils/attendance-settings.ts）
    const settingsIcons: Record<string, { icon: Component, tone: keyof typeof tones }> = {
      people: { icon: UserCog, tone: 'indigo' },
      payroll: { icon: Wallet, tone: 'teal' },
      calendar: { icon: CalendarClock, tone: 'slate' },
    }
    const settingsViews = visibleAttendanceSettingsViews({
      isOwner: authStore.isOwner,
      isAppAdmin: authStore.isAppAdmin,
      attendanceRoles: access.value.attendanceRoles,
      payrollRoles: access.value.payrollRoles,
    })
    if (settingsViews.length) {
      groups.push({
        label: '设置',
        items: settingsViews.map(view => entry(
          view.label,
          view.url,
          settingsIcons[view.value]?.icon ?? Settings2,
          settingsIcons[view.value]?.tone ?? 'slate',
        )),
      })
    }

    return groups
  })

  const payrollGroups = computed<HubGroup[]>(() => {
    const groups: HubGroup[] = [{
      items: [entry('我的工资条', '/attendance/payroll/my', Receipt, 'emerald')],
    }]

    if (canManagePayroll(access.value)) {
      groups.push({
        label: '工资管理',
        items: [
          entry('工资表', '/attendance/payroll/statements', FileText, 'blue'),
          entry('薪资统计', '/attendance/payroll/statistics', BarChart3, 'cyan'),
          entry('薪资标准设置', '/attendance/payroll/settings', Settings2, 'indigo'),
        ],
      })
    }

    return groups
  })

  const sealGroups = computed<HubGroup[]>(() => {
    const groups: HubGroup[] = [{
      items: [entry('用章申请', '/seal/requests', Send, 'rose')],
    }]

    if (canApproveSeal(access.value)) {
      groups.push({
        label: '待我审批',
        items: [
          entry('用章审批', '/seal/requests?view=inbox', Stamp, 'rose', counts.value.seal),
          entry('审核记录', '/seal/requests?view=history', ClipboardList, 'slate'),
        ],
      })
    }

    if (canManageSeal(access.value)) {
      const items = [
        entry('印章工作台', '/seal/workbench', Stamp, 'amber'),
        entry('印章台账', '/seal/items', Database, 'violet'),
        entry('使用台账', '/seal/ledger', FileText, 'teal'),
      ]
      if (canManageSealSettings(access.value)) {
        items.push(entry('用章设置', '/seal/settings', Settings2, 'slate'))
      }
      groups.push({ label: '印章管理', items })
    }

    return groups
  })

  return {
    attendanceGroups,
    payrollGroups,
    sealGroups,
  }
}
