<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Clock, Bell, Check, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { DateTimePicker } from '@/components/ui/date-picker'
import { useAuthStore } from '@/stores/auth'
import {
  createSealRequest,
  getSealAvailability,
  createSealWatch,
  SEAL_TYPE_MAP,
  type SealType,
  type SealAvailabilityItem
} from '@/services/api/seal.api'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'success'): void
}>()

const authStore = useAuthStore()

const submitting = ref(false)
const checkingAvailability = ref(false)
const availabilityMap = ref<Record<SealType, SealAvailabilityItem> | null>(null)

/**
 * 申请人姓名：与后端 snapshot 同口径（profile.name → userid）。
 * 存量账号可能没填姓名，退回登录名，别留空。
 */
const applicantName = computed(() => authStore.user?.name || authStore.user?.userid || '—')

const form = ref({
  useDepartment: '',
  useAt: '',
  expectedReturnAt: '',
  sealTypes: [] as SealType[],
  documentName: '',
  copies: 1,
  reason: '',
  remark: ''
})

const availableTypes: SealType[] = ['official', 'finance', 'contract', 'invoice', 'legal']

// 初始化表单部门
watch(() => props.open, (val) => {
  if (val) {
    form.value.useDepartment = authStore.user?.department || ''
    form.value.copies = 1
    form.value.documentName = ''
    form.value.reason = ''
    form.value.remark = ''
    form.value.sealTypes = []
  }
})

// 防抖查询可用性
let checkTimer: ReturnType<typeof setTimeout> | null = null

async function checkAvailability() {
  const { useAt, expectedReturnAt } = form.value
  if (!useAt || !expectedReturnAt) {
    availabilityMap.value = null
    return
  }

  if (new Date(useAt) >= new Date(expectedReturnAt)) {
    availabilityMap.value = null
    return
  }

  checkingAvailability.value = true
  try {
    const res = await getSealAvailability(useAt, expectedReturnAt)
    if (res.ok && res.data) {
      availabilityMap.value = res.data
      // 若当前选中的某些类别已不可用，自动剔除
      form.value.sealTypes = form.value.sealTypes.filter(t => res.data![t]?.available)
    }
  } catch (err: any) {
    console.error('可用性检查失败:', err)
  } finally {
    checkingAvailability.value = false
  }
}

watch([() => form.value.useAt, () => form.value.expectedReturnAt], () => {
  if (checkTimer) clearTimeout(checkTimer)
  checkTimer = setTimeout(checkAvailability, 300)
})

function toggleSealType(type: SealType) {
  const isAvailable = availabilityMap.value ? availabilityMap.value[type]?.available : true
  if (!isAvailable) return

  const idx = form.value.sealTypes.indexOf(type)
  if (idx > -1) {
    form.value.sealTypes.splice(idx, 1)
  } else {
    form.value.sealTypes.push(type)
  }
}

async function handleSubscribeWatch(type: SealType) {
  const { useAt, expectedReturnAt } = form.value
  if (!useAt || !expectedReturnAt) {
    toast.error('请先选择期望的用章时段')
    return
  }

  try {
    const res = await createSealWatch({
      sealType: type,
      desiredFrom: useAt,
      desiredTo: expectedReturnAt
    })
    if (res.ok) {
      toast.success(`已关注【${SEAL_TYPE_MAP[type]}】，时段释放时将收到站内通知`)
    } else {
      toast.error(res.error || '登记候补失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '登记候补异常')
  }
}

async function handleSubmit() {
  const { useDepartment, useAt, expectedReturnAt, sealTypes, documentName, copies, reason, remark } = form.value

  if (!useAt || !expectedReturnAt) {
    toast.error('请完整选择用章时间与预计归还时间')
    return
  }
  if (new Date(useAt) >= new Date(expectedReturnAt)) {
    toast.error('预计归还时间必须晚于用章时间')
    return
  }
  if (!sealTypes.length) {
    toast.error('请至少勾选一种申请印章类别')
    return
  }
  if (!documentName.trim()) {
    toast.error('请填写用章文件名称')
    return
  }
  if (!copies || copies < 1) {
    toast.error('文件份数必须大于 0')
    return
  }
  if (!reason.trim()) {
    toast.error('请详细填写用章事由')
    return
  }

  submitting.value = true
  try {
    const res = await createSealRequest({
      useDepartment: useDepartment.trim(),
      useAt,
      expectedReturnAt,
      sealTypes,
      documentName: documentName.trim(),
      copies: Number(copies),
      reason: reason.trim(),
      remark: remark.trim()
    })

    if (res.ok) {
      toast.success('用章申请已提交，等待审批')
      emit('update:open', false)
      emit('success')
    } else {
      toast.error(res.error || '提交申请失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '提交申请异常')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(val: boolean) => emit('update:open', val)">
    <!-- 用带 sm: 前缀的宽度：DialogContent 自带 sm:max-w-lg，tailwind-merge 不去重不同修饰符，
         写 max-w-2xl 会被它压住（实测只有 510px） -->
    <DialogContent class="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
      <DialogHeader>
        <DialogTitle class="text-base font-semibold">新建用章申请</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2 text-sm">
        <!-- 申请人与部门 -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">申请人</label>
            <!-- 只读展示，不用 Input：ui/Input 只认 modelValue，:value 会被当普通属性挂上去、不生效 -->
            <div class="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-foreground">
              {{ applicantName }}
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">用章部门</label>
            <Input v-model="form.useDepartment" placeholder="输入用章部门" class="h-9" />
          </div>
        </div>

        <!-- 用章时间段：日期 + 时 + 分 三段并排至少要 320px（日期 144 + 时分 152 + 间隙），
             放半宽列里会溢出并切掉「分」，所以两个时间各占一整行 -->
        <div class="space-y-3">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">
              用章时间 <span class="text-destructive">*</span>
            </label>
            <DateTimePicker v-model="form.useAt" label="用章时间" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">
              预计归还时间 <span class="text-destructive">*</span>
            </label>
            <DateTimePicker v-model="form.expectedReturnAt" label="预计归还时间" class="w-full" />
          </div>
        </div>

        <!-- 申请印章类别与实时容量 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-muted-foreground">
              申请印章类别 <span class="text-destructive">*</span>
            </label>
            <span v-if="checkingAvailability" class="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 class="h-3 w-3 animate-spin" /> 检测时段可用性...
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="type in availableTypes"
              :key="type"
              class="relative flex items-center justify-between border rounded-md p-2.5 transition-all text-xs"
              :class="[
                availabilityMap && !availabilityMap[type]?.available
                  ? 'bg-muted/40 opacity-70 border-dashed border-border'
                  : form.sealTypes.includes(type)
                    ? 'border-primary bg-primary/[0.04]'
                    : 'hover:border-foreground/30 cursor-pointer'
              ]"
              @click="toggleSealType(type)"
            >
              <div class="flex items-center gap-2">
                <div
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  :class="form.sealTypes.includes(type) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
                >
                  <Check v-if="form.sealTypes.includes(type)" class="h-3 w-3 stroke-[3]" />
                </div>
                <span class="font-medium">{{ SEAL_TYPE_MAP[type] }}</span>
              </div>

              <!-- 状态与候补入口 -->
              <div class="flex items-center gap-1.5">
                <template v-if="availabilityMap">
                  <Badge
                    v-if="availabilityMap[type]?.available"
                    variant="outline"
                    class="text-[10px] font-normal px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                  >
                    剩余 {{ availabilityMap[type].freeNow }} 枚
                  </Badge>
                  <template v-else>
                    <Badge variant="destructive" class="text-[10px] font-normal px-1.5 py-0 h-4">
                      已被占满
                    </Badge>
                    <button
                      type="button"
                      class="flex items-center gap-0.5 text-[11px] text-primary hover:underline ml-1"
                      title="时段释放时广播通知"
                      @click.stop="handleSubscribeWatch(type)"
                    >
                      <Bell class="h-3 w-3" />
                      <span>候补</span>
                    </button>
                  </template>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件名称与份数 -->
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">
              用章文件名称 <span class="text-destructive">*</span>
            </label>
            <Input v-model="form.documentName" placeholder="如：货物承运协议、授权委托书" class="h-9" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">
              文件份数 <span class="text-destructive">*</span>
            </label>
            <Input v-model="form.copies" type="number" min="1" class="h-9" />
          </div>
        </div>

        <!-- 事由 -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground">
            用章事由 <span class="text-destructive">*</span>
          </label>
          <Textarea v-model="form.reason" rows="3" placeholder="详细说明用章具体事由及交接安排" class="text-xs resize-none" />
        </div>

        <!-- 备注 -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground">备注</label>
          <Input v-model="form.remark" placeholder="其他需要向审批人与保管员说明的事项（选填）" class="h-9" />
        </div>
      </div>

      <DialogFooter class="gap-2 sm:gap-0 pt-2">
        <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="submitting" @click="handleSubmit">
          <Loader2 v-if="submitting" class="h-3.5 w-3.5 mr-1.5 animate-spin" />
          <span>确认提交</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
