import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAttendanceApprovalCounts } from '@/services/api/attendance.api'
import { getSealPendingCount } from '@/services/api/seal.api'
import { useAuthStore } from '@/stores/auth'

/** 有待审批入口的五类，也是审批页待办链接的取值集合。 */
export type ApprovalKind = 'leave' | 'overtime' | 'fieldwork' | 'appeal' | 'seal'

/** 展示顺序：请假 → 加班 → 出差 → 申述 → 用章（与侧栏「待我审批」子项顺序一致）。 */
export const approvalKindOrder: ApprovalKind[] = ['leave', 'overtime', 'fieldwork', 'appeal', 'seal']

/** 短名：页面待办链接里用，短到不抢视觉。 */
export const approvalKindLabels: Record<ApprovalKind, string> = {
  leave: '请假',
  overtime: '加班',
  fieldwork: '出差',
  appeal: '申述',
  seal: '用章',
}

/** 每个待办入口的路径：点一下直达真正有待审批的那个页面。 */
export const approvalKindLinks: Record<ApprovalKind, string> = {
  leave: '/attendance/approvals?type=leave',
  overtime: '/attendance/approvals?type=overtime',
  fieldwork: '/attendance/approvals?type=fieldwork',
  appeal: '/attendance/approvals?type=appeal',
  seal: '/seal/requests?view=inbox',
}

const POLL_INTERVAL = 60000

/**
 * 待审批数量（跨考勤与用章两个模块），供侧栏数字角标与页面待办链接共用。
 * 只统计「轮到我审」的，接口口径与各自列表页的收件箱完全一致。
 */
export const useApprovalStore = defineStore('approvals', () => {
  const authStore = useAuthStore()
  const counts = ref<Record<ApprovalKind, number>>({ leave: 0, overtime: 0, fieldwork: 0, appeal: 0, seal: 0 })
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const attendanceRoles = computed(() => {
    const roles = authStore.user?.attendanceRoles
    if (Array.isArray(roles)) return roles
    return roles ? [roles] : []
  })

  /** 与「待我审批」菜单的可见性同口径：没有审批权的人不必轮询（接口只会返回 0）。 */
  const canReview = computed(() =>
    authStore.isOwner
    || authStore.isAppAdmin
    || authStore.user?.canReviewAttendance === true
    || attendanceRoles.value.some(role => ['manager', 'general_manager', 'attendance_admin'].includes(role))
  )

  const total = computed(() => approvalKindOrder.reduce((sum, kind) => sum + (counts.value[kind] ?? 0), 0))

  /** 有待办的类型（按展示顺序），页面右侧的待办链接直接渲染它。 */
  const pendingKinds = computed(() =>
    approvalKindOrder
      .filter(kind => (counts.value[kind] ?? 0) > 0)
      .map(kind => ({
        kind,
        label: approvalKindLabels[kind],
        count: counts.value[kind] ?? 0,
        to: approvalKindLinks[kind],
      }))
  )

  /** 拉一次计数。两个模块各自容错：任一失败都保留上一次的数字，不让角标闪烁或凭空消失。 */
  async function refresh() {
    if (!canReview.value || inFlight) return
    inFlight = true
    try {
      const tasks: Promise<void>[] = [
        getAttendanceApprovalCounts().then((res) => {
          const data = res?.data
          if (!data || res?.ok === false) return
          counts.value.leave = Number(data.leave) || 0
          counts.value.overtime = Number(data.overtime) || 0
          counts.value.fieldwork = Number(data.fieldwork) || 0
          counts.value.appeal = Number(data.appeal) || 0
        }).catch(() => {}),
      ]
      if (authStore.features.seal) {
        tasks.push(getSealPendingCount().then((res) => {
          if (!res?.ok || !res.data) return
          counts.value.seal = Number(res.data.pendingCount) || 0
        }).catch(() => {}))
      } else {
        counts.value.seal = 0
      }
      await Promise.all(tasks)
    } finally {
      inFlight = false
    }
  }

  /** 侧栏挂载时启动：立即拉一次 + 每 60s 轮询（与顶栏通知同一节奏）。 */
  function start() {
    if (timer) return
    void refresh()
    timer = setInterval(() => { void refresh() }, POLL_INTERVAL)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  return { counts, total, pendingKinds, canReview, refresh, start, stop }
})
