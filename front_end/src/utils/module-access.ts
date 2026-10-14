/**
 * 「考勤与工资」「用章」两个模块里各入口的可见性判据。
 * 左侧菜单（components/app-sidebar/data/sidebar-data.ts）与移动端模块首页（pages/mobile/*）
 * 共用这一份，避免出现「首页看得到入口、点进去却说无权」。
 */
import { getTitleCode } from '@/services/api/user.api'

export interface ModuleAccessInput {
  /** 公司主账号 */
  isOwner: boolean
  /** 登录名；`admin` 为系统初始化创建的主账号，与 privilege 里的 admin 权限位无关 */
  userid: string
  /** 用户权限位（privilege）—— 只管老业务模块，新模块一律不看 */
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

/**
 * 全模块全权（含考勤、工资、用章）。三个来源，任一满足即可：
 *  1. **登录名 `admin`**（系统初始化创建的主账号）
 *  2. `role === 'owner'`（公司主账号）
 *  3. 职务总经理/董事长（既可能是代码 gm/ceo，也可能是老账号的中文写法）
 *
 * 与 `privilege` 里的 `admin` **无关** —— 用户反复强调：「老业务的权限不要延伸到新的业务里」。
 * 勾了「管理」权限（`privilege: ['admin']`）在考勤、工资、用章里**一律不生效**。
 * 新模块一律用本函数判全权，不要散着判 role / userid / title。
 */
export function isFullPrivilege(input: Pick<ModuleAccessInput, 'isOwner' | 'userid' | 'title'>) {
  if (input.isOwner || input.userid === 'admin') return true
  const titleCode = getTitleCode(input.title)
  return titleCode === 'gm' || titleCode === 'ceo'
}

/** 职务总经理/董事长（不含主账号）：只给 title 就能判的场合用。 */
export function isTopLeaderTitle(title: string) {
  const titleCode = getTitleCode(title)
  return titleCode === 'gm' || titleCode === 'ceo'
}

/**
 * 考勤「待我审批」入口：与后端 getApprovalAccess 同口径。
 * 全权身份 + 考勤角色 + 总经理代理人 + 有下属 + 被单独指派。
 * 老业务的「管理」权限位不在其中。
 */
export function canReviewAttendanceRequests(input: ModuleAccessInput) {
  return input.canReviewAttendance
    || isFullPrivilege(input)
    || input.attendanceRoles.some(role => ['manager', 'general_manager', 'attendance_admin'].includes(role))
}

/** 「工资管理」（工资表 / 薪资统计 / 薪资标准设置）：财务、公司主账号、总经理与董事长可录入发布。 */
export function canManagePayroll(input: ModuleAccessInput) {
  return input.payrollRoles.some(role => ['finance', 'general_manager'].includes(role))
    || isFullPrivilege(input)
}

/**
 * 「用章审批」入口：全权身份给全公司视角，
 * 另外**某一印章类别配置的审批人**也给入口（否则收得到单子却找不到入口，与考勤踩过的坑同类）。
 * 老业务的「管理」权限位与考勤总经理角色都不单独授予。
 */
export function canApproveSeal(input: ModuleAccessInput) {
  return input.isSealApprover === true || isFullPrivilege(input)
}

/**
 * 「印章管理」（印章工作台 / 印章台账 / 使用台账 / 用章设置入口）。
 * 两个来源：身份（登录名 admin / owner / 一把手）+ 配置（用章设置里指派的印章保管员）。
 */
export function canManageSeal(input: ModuleAccessInput) {
  return isFullPrivilege(input) || input.isCustodian
}

/** 「用章设置」本身：仅全权身份（登录名 admin / owner / 总经理·董事长）。 */
export function canManageSealSettings(input: ModuleAccessInput) {
  return isFullPrivilege(input)
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
