import { reactive, watch } from 'vue'

export interface ConfirmDialogOptions {
  title?: string
  description?: string
  confirmButtonText?: string
  cancelButtonText?: string
  destructive?: boolean
}

const state = reactive({
  open: false,
  title: '确认操作',
  description: '',
  confirmButtonText: '确认',
  cancelButtonText: '取消',
  destructive: false,
})

let resolveCurrent: ((value: boolean) => void) | null = null

function finishConfirm(result: boolean) {
  const resolver = resolveCurrent
  resolveCurrent = null
  state.open = false
  resolver?.(result)
}

watch(
  () => state.open,
  (open) => {
    if (!open && resolveCurrent) {
      const resolver = resolveCurrent
      resolveCurrent = null
      resolver(false)
    }
  },
)

export function useConfirmDialog() {
  function confirm(options: ConfirmDialogOptions | string) {
    if (resolveCurrent) {
      finishConfirm(false)
    }

    const normalized = typeof options === 'string'
      ? { description: options }
      : options

    const destructive = !!normalized.destructive

    state.title = normalized.title || (destructive ? '确认删除' : '确认操作')
    state.description = normalized.description || ''
    state.confirmButtonText = normalized.confirmButtonText || (destructive ? '确认删除' : '确认')
    state.cancelButtonText = normalized.cancelButtonText || '取消'
    state.destructive = destructive
    state.open = true

    return new Promise<boolean>((resolve) => {
      resolveCurrent = resolve
    })
  }

  return {
    confirm,
    state,
    handleConfirm: () => finishConfirm(true),
    handleCancel: () => finishConfirm(false),
  }
}
