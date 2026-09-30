<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Clock, Loader2, UserCheck, ChevronsUpDown, Search, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  getSealSettings,
  updateSealSettings,
  type SealCustodianCandidate,
} from '@/services/api/seal.api'

const loading = ref(false)
const saving = ref(false)
const candidateList = ref<SealCustodianCandidate[]>([])
const searchKeyword = ref('')
const popoverOpen = ref(false)

const form = ref({
  sealCustodianIds: [] as string[],
  sealOverdueRemindMinutes: 120,
  sealOverdueEscalateMinutes: 1440
})

const filteredCandidates = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return candidateList.value
  return candidateList.value.filter(p =>
    (p.name && p.name.toLowerCase().includes(kw)) ||
    (p.department && p.department.toLowerCase().includes(kw)) ||
    (p.employeeNo && p.employeeNo.toLowerCase().includes(kw)) ||
    (p.userid && p.userid.toLowerCase().includes(kw))
  )
})

const selectedCustodians = computed(() => {
  return form.value.sealCustodianIds.map(id => {
    const found = candidateList.value.find(p => p.userId === id)
    return found || { userId: id, name: '未知员工', userid: id }
  })
})

function toggleCustodian(userId: string) {
  const index = form.value.sealCustodianIds.indexOf(userId)
  if (index > -1) {
    form.value.sealCustodianIds.splice(index, 1)
  } else {
    form.value.sealCustodianIds.push(userId)
  }
}

function removeCustodian(userId: string, event?: Event) {
  event?.stopPropagation()
  form.value.sealCustodianIds = form.value.sealCustodianIds.filter(id => id !== userId)
}

function clearCustodians() {
  form.value.sealCustodianIds = []
}

async function loadData() {
  loading.value = true
  try {
    const res = await getSealSettings()
    if (res.ok && res.data) {
      if (Array.isArray(res.data.sealCustodianIds)) {
        form.value.sealCustodianIds = [...res.data.sealCustodianIds]
      } else if (res.data.sealCustodianId) {
        form.value.sealCustodianIds = [res.data.sealCustodianId]
      } else {
        form.value.sealCustodianIds = []
      }
      form.value.sealOverdueRemindMinutes = res.data.sealOverdueRemindMinutes || 120
      form.value.sealOverdueEscalateMinutes = res.data.sealOverdueEscalateMinutes || 1440

      if (Array.isArray(res.data.candidates)) {
        candidateList.value = res.data.candidates
      }
    }
  } catch (err: any) {
    toast.error('加载用章设置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (form.value.sealOverdueRemindMinutes <= 0) {
    toast.error('逾期通知直属主管阈值必须大于 0 分钟')
    return
  }
  if (form.value.sealOverdueEscalateMinutes <= 0) {
    toast.error('逾期升级总经理阈值必须大于 0 分钟')
    return
  }

  saving.value = true
  try {
    const res = await updateSealSettings({
      sealCustodianIds: form.value.sealCustodianIds,
      sealCustodianId: form.value.sealCustodianIds[0] || null,
      sealOverdueRemindMinutes: Number(form.value.sealOverdueRemindMinutes),
      sealOverdueEscalateMinutes: Number(form.value.sealOverdueEscalateMinutes)
    })
    if (res.ok) {
      toast.success('用章设置已保存')
      loadData()
    } else {
      toast.error(res.error || '保存失败')
    }
  } catch (err: any) {
    toast.error(err.response?.data?.error || '保存设置异常')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <!-- 页面标题 -->
    <div class="border-b pb-4">
      <h2 class="text-base font-semibold text-foreground">用章管理设置</h2>
      <p class="text-xs text-muted-foreground mt-1">
        配置公司专职印章保管员（支持多位）与逾期未还分级催办阈值。
      </p>
    </div>

    <div v-if="loading" class="py-12 text-center text-xs text-muted-foreground">
      <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
      加载设置项...
    </div>

    <div v-else class="space-y-6 text-xs">
      <!-- 专职保管员配置卡片 -->
      <div class="rounded-lg border bg-card p-5 space-y-4">
        <div class="flex items-center gap-2">
          <UserCheck class="h-4 w-4 text-primary" />
          <h3 class="text-sm font-semibold text-foreground">专职印章保管员</h3>
        </div>

        <p class="text-muted-foreground leading-relaxed">
          专职保管员负责公司实体印章的集中交接、发章出库与收章验视，可指定多位员工。总经理、董事长及管理员账号默认拥有全量发章与收章权限。
        </p>

        <div class="max-w-md space-y-2 pt-1">
          <label class="font-medium text-foreground">指派保管员员工（可多选）</label>

          <Popover v-model:open="popoverOpen">
            <PopoverTrigger as-child>
              <div
                role="combobox"
                tabindex="0"
                class="min-h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring transition-colors flex items-center justify-between gap-2 cursor-pointer"
              >
                <!-- 未选择 -->
                <div v-if="form.sealCustodianIds.length === 0" class="text-muted-foreground">
                  未指派（由管理员/总经理兼管）
                </div>

                <!-- 已选择标签列表 -->
                <div v-else class="flex flex-wrap gap-1.5 py-0.5">
                  <Badge
                    v-for="person in selectedCustodians"
                    :key="person.userId"
                    variant="secondary"
                    class="h-6 gap-1 px-2 text-xs font-normal"
                  >
                    <span>{{ person.name }}</span>
                    <span v-if="person.department" class="text-[10px] text-muted-foreground">({{ person.department }})</span>
                    <button
                      type="button"
                      class="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      @click="removeCustodian(person.userId, $event)"
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </Badge>
                </div>

                <ChevronsUpDown class="h-3.5 w-3.5 shrink-0 opacity-50 ml-auto" />
              </div>
            </PopoverTrigger>

            <PopoverContent class="w-80 p-2 space-y-2 text-xs" align="start">
              <!-- 搜索框 -->
              <div class="relative">
                <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  v-model="searchKeyword"
                  placeholder="按姓名、部门或工号搜索..."
                  class="h-8 pl-8 text-xs"
                />
              </div>

              <!-- 员工列表 -->
              <div class="max-h-56 overflow-y-auto space-y-0.5 py-1">
                <div
                  v-if="filteredCandidates.length === 0"
                  class="py-6 text-center text-xs text-muted-foreground"
                >
                  未找到匹配员工
                </div>

                <div
                  v-for="person in filteredCandidates"
                  :key="person.userId"
                  class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer select-none transition-colors"
                  @click="toggleCustodian(person.userId)"
                >
                  <Checkbox
                    :checked="form.sealCustodianIds.includes(person.userId)"
                    class="shrink-0"
                    @click.stop="toggleCustodian(person.userId)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-foreground truncate">{{ person.name }}</div>
                    <div class="text-[11px] text-muted-foreground truncate">
                      {{ person.department || '未分配部门' }}{{ person.employeeNo ? ` · ${person.employeeNo}` : '' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 底部操作 -->
              <div class="flex items-center justify-between border-t pt-2 text-[11px]">
                <span class="text-muted-foreground">已选 {{ form.sealCustodianIds.length }} 位保管员</span>
                <button
                  v-if="form.sealCustodianIds.length > 0"
                  type="button"
                  class="text-destructive hover:underline"
                  @click="clearCustodians"
                >
                  清空已选
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <!-- 逾期催办分级阈值卡片 -->
      <div class="rounded-lg border bg-card p-5 space-y-4">
        <div class="flex items-center gap-2">
          <Clock class="h-4 w-4 text-amber-500" />
          <h3 class="text-sm font-semibold text-foreground">逾期催办与预警升级阈值</h3>
        </div>

        <p class="text-muted-foreground leading-relaxed">
          当借用人超过预计归还时间仍未归还实体章时，系统将分阶段发送站内催办通知。实体章在此期间将持续锁定占用，直至收章销账。
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div class="space-y-1.5">
            <label class="font-medium text-foreground">通知直属主管阈值（分钟）</label>
            <Input
              v-model="form.sealOverdueRemindMinutes"
              type="number"
              min="10"
              class="h-9"
            />
            <span class="text-[11px] text-muted-foreground">
              默认 120 分钟（即逾期 2 小时后自动提醒借用人直属主管协助催缴）
            </span>
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-foreground">升级通知总经理阈值（分钟）</label>
            <Input
              v-model="form.sealOverdueEscalateMinutes"
              type="number"
              min="60"
              class="h-9"
            />
            <span class="text-[11px] text-muted-foreground">
              默认 1440 分钟（即逾期 24 小时后自动升级预警通知公司总经理）
            </span>
          </div>
        </div>
      </div>

      <!-- 保存操作 -->
      <div class="pt-2">
        <Button size="sm" class="px-5 text-xs" :disabled="saving" @click="handleSave">
          <Loader2 v-if="saving" class="h-3.5 w-3.5 mr-1.5 animate-spin" />
          <span>保存设置</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
