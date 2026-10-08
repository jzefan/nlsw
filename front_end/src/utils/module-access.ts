/**
 * 「考勤与工资」「用章」两个模块里各入口的可见性判据。
 * 左侧菜单（components/app-sidebar/data/sidebar-data.ts）与移动端模块首页（pages/mobile/*）
 * 共用这一份，避免出现「首页看得到入口、点进去却说无权」。
 */
import { isAdmin } from '@/constants/permissions'
import { getTitleCode } from '@/services/api/user.api'

export interface ModuleAccessInput {
  /** 公司主账号 */
  isOwner: boolean
  /** 用户权限位（privilege） */
  privilege: string[]
  /** 考勤角色：manager / general_manager / attendance_admin */
  attendanceRoles: string[]
  /** 薪资角色：finance / general_manager */
  payrollRoles: string[]
  /** 用户职务，可能是编码（gm/ceo）也可能是中文写法 */
  title: string
  /** 印章保管员 */
  isCustodian: boolean
  /** 被单独指派的考勤审批人 */
  canReviewAttendance: boolean
  /** 被指派为用章审批人（可一人负责多类印章） */
  isSealApprover?: boolean
}

/** 考勤「待我审批」入口：与后端 canReviewAttendance 同口径。 */
export function canReviewAttendanceRequests(input: ModuleAccessInput) {
  return input.canReviewAttendance
    || input.isOwner
    || isAdmin(input.privilege)
    || input.attendanceRoles.some(role => ['manager', 'general_manager', 'attendance_admin'].includes(role))
}

/** 「工资管理」（工资表 / 薪资统计 / 薪资标准设置）：财务可录入发布，总经理与董事长只读查看。 */
export function canManagePayroll(input: ModuleAccessInput) {
  const titleCode = getTitleCode(input.title)
  return input.payrollRoles.some(role => ['finance', 'general_manager'].includes(role))
    || titleCode === 'gm'
    || titleCode === 'ceo'
}

/**
 * 「用章审批」入口：主账号 / 管理员 / 总经理给全公司视角，
 * 另外**某一印章类别配置的审批人**也给入口（否则收得到单子却找不到入口，与考勤踩过的坑同类）。
 */
export function canApproveSeal(input: ModuleAccessInput) {
  const titleCode = getTitleCode(input.title)
  return input.isSealApprover === true
    || input.isOwner
    || isAdmin(input.privilege)
    || input.attendanceRoles.includes('general_manager')
    || titleCode === 'gm'
    || titleCode === 'ceo'
}

/** 「印章管理」（印章工作台 / 印章台账 / 使用台账 / 用章设置入口）。 */
export function canManageSeal(input: ModuleAccessInput) {
  const titleCode = getTitleCode(input.title)
  return input.isOwner
    || isAdmin(input.privilege)
    || input.attendanceRoles.includes('general_manager')
    || titleCode === 'gm'
    || titleCode === 'ceo'
    || input.isCustodian
}

/** 「用章设置」本身：仅主账号与后台管理员。 */
export function canManageSealSettings(input: ModuleAccessInput) {
  return input.isOwner || isAdmin(input.privilege)
}

/** 印章保管员：用户标记、租户保管员列表、租户单个保管员三种写法都算。 */
export function isSealCustodian(
  user?: { id?: string, isSealCustodian?: boolean } | null,
  tenant?: { sealCustodianIds?: string[] | null, sealCustodianId?: string | null } | null,
) {
  if (!user) return false
  if (user.isSealCustodian) return true
  if (Array.isArray(tenant?.sealCustodianIds) && user.id && tenant.sealCustodianIds.includes(user.id)) return true
  return Boolean(tenant?.sealCustodianId && user.id && tenant.sealCustodianId === user.id)
}
