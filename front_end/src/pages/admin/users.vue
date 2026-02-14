<script setup lang="ts">
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { User, UserFormData } from '@/services/api/user.api'

import { BasicPage } from '@/components/global-layout'
import { useAuth } from '@/composables/use-auth'
import { usePermissions } from '@/composables/use-permissions'
import {
  generatePrivilege as _generatePrivilege,
  parsePrivilege as _parsePrivilege,
  getPrivilegeDisplay,
  isAdmin as isAdminPrivilege,
} from '@/lib/permissions'
import {
  addUser,
  deleteUser,
  getUsers,
  resetPassword,
  titleOptions,
  updateUser,
} from '@/services/api/user.api'

// 权限检查
const router = useRouter()
const { user: _authUser } = useAuth()
const { isAdmin } = usePermissions()

// 非管理员用户重定向
watch(
  isAdmin,
  (val) => {
    if (val === false) {
      toast.error('无权限访问此页面')
      router.push('/dashboard')
    }
  },
  { immediate: true },
)

// 状态
const loading = ref(false)
const users = ref<User[]>([])
const selectedUsers = ref<User[]>([])

// 单选的用户（用于编辑和重置密码）
const selectedUser = computed(() =>
  selectedUsers.value.length === 1 ? selectedUsers.value[0] : null,
)

// 对话框状态
const showEditDialog = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const editForm = ref<UserFormData>({
  userid: '',
  name: '',
  title: '',
  phone: '',
  privilege: '',
})

// 权限选项
const _permissionOptions = [
  { id: 'admin', label: '管理员', index: -1 },
  { id: 'operator', label: '业务', index: 0 },
  { id: 'statistics', label: '统计', index: 1 },
  { id: 'account', label: '会计', index: 2 },
  { id: 'custRevenue', label: '客户营业额', index: 4 },
  { id: 'vesselRevenue', label: '车船营业额', index: 5 },
  { id: 'selfVehicle', label: '自有车管理', index: 6 },
  { id: 'seePrice', label: '查看价格', index: 7 },
]

// 权限状态
const permissions = ref({
  admin: false,
  operator: false,
  statistics: false,
  account: false,
  custRevenue: false,
  vesselRevenue: false,
  selfVehicle: false,
  seePrice: false,
})

// 用户名重复检查
const usernameDuplicate = ref(false)

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const result = await getUsers()
    if (result.ok) {
      users.value = result.data
    }
  }
  catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// 选择/取消选择用户
function toggleSelect(user: User) {
  const index = selectedUsers.value.findIndex(u => u.userid === user.userid)
  if (index >= 0) {
    selectedUsers.value.splice(index, 1)
  }
  else {
    selectedUsers.value.push(user)
  }
}

// 是否选中
function isSelected(user: User) {
  return selectedUsers.value.some(u => u.userid === user.userid)
}

// 全选复选框状态
const allSelected = computed({
  get: () =>
    selectedUsers.value.length === users.value.length && users.value.length > 0,
  set: (value: boolean) => {
    if (value) {
      selectedUsers.value = [...users.value]
    }
    else {
      selectedUsers.value = []
    }
  },
})

// 处理单个用户复选框变化
function handleUserCheck(user: User, checked: boolean) {
  const index = selectedUsers.value.findIndex(u => u.userid === user.userid)
  if (checked && index < 0) {
    selectedUsers.value.push(user)
  }
  else if (!checked && index >= 0) {
    selectedUsers.value.splice(index, 1)
  }
}

// 打开新建对话框
function openAddDialog() {
  dialogMode.value = 'add'
  editForm.value = {
    userid: '',
    name: '',
    title: '',
    phone: '',
    privilege: '',
  }
  resetPermissions()
  usernameDuplicate.value = false
  showEditDialog.value = true
}

// 打开编辑对话框
function openEditDialog(user?: User) {
  const targetUser = user || selectedUser.value
  if (!targetUser) {
    toast.warning('请先选择用户')
    return
  }

  dialogMode.value = 'edit'
  editForm.value = {
    userid: targetUser.userid,
    name: targetUser.name,
    title: getTitleCode(targetUser.title),
    phone: targetUser.phone,
    privilege: targetUser.privilege,
  }
  parsePrivilege(targetUser.privilege)
  usernameDuplicate.value = false
  showEditDialog.value = true
}

// 获取职务代码
function getTitleCode(label: string): string {
  const option = titleOptions.find(o => o.label === label)
  return option?.value || ''
}

// 重置权限状态
function resetPermissions() {
  permissions.value = {
    admin: false,
    operator: false,
    statistics: false,
    account: false,
    custRevenue: false,
    vesselRevenue: false,
    selfVehicle: false,
    seePrice: false,
  }
}

// 解析权限字符串
function parsePrivilege(privilege: string) {
  resetPermissions()
  const parsed = _parsePrivilege(privilege)
  permissions.value = { ...parsed }
}

// 生成权限字符串
function generatePrivilege(): string {
  return _generatePrivilege(permissions.value)
}

// 管理员权限切换
function onAdminChange(checked: boolean) {
  if (checked) {
    permissions.value.admin = true
    permissions.value.operator = false
    permissions.value.statistics = false
    permissions.value.account = false
    permissions.value.custRevenue = false
    permissions.value.vesselRevenue = false
    permissions.value.selfVehicle = false
    permissions.value.seePrice = false
  }
  else {
    permissions.value.admin = false
  }
}

// 切换非管理员权限（自动取消管理员勾选）
function onPermissionChange(
  key: keyof typeof permissions.value,
  checked: boolean,
) {
  if (checked) {
    permissions.value.admin = false
  }
  permissions.value[key] = checked
}

// 职务变更
function onTitleChange(
  value: string | number | bigint | boolean | Record<string, any> | null,
) {
  if (!value || typeof value !== 'string')
    return
  if (value === 'ceo' || value === 'mgr') {
    onAdminChange(true)
  }
  else {
    permissions.value.admin = false
    resetPermissions()
    if (value === 'operator') {
      permissions.value.operator = true
    }
    else if (value === 'account') {
      permissions.value.account = true
    }
    else if (value === 'statistician') {
      permissions.value.statistics = true
    }
  }
}

// 检查用户名重复
function checkUsernameDuplicate() {
  if (dialogMode.value === 'edit')
    return
  const username = editForm.value.userid.trim()
  if (username) {
    usernameDuplicate.value = users.value.some(u => u.userid === username)
  }
  else {
    usernameDuplicate.value = false
  }
}

// 是否可以提交
const canSubmit = computed(() => {
  const hasUsername = !!editForm.value.userid.trim()
  const hasTitle = !!editForm.value.title
  const hasPermission
    = permissions.value.admin
      || permissions.value.operator
      || permissions.value.statistics
      || permissions.value.account
      || permissions.value.custRevenue
      || permissions.value.vesselRevenue
      || permissions.value.selfVehicle

  return hasUsername && hasTitle && hasPermission && !usernameDuplicate.value
})

// 获取职务中文名
function getTitleLabel(code: string): string {
  const option = titleOptions.find(o => o.value === code)
  return option?.label || code
}

// 保存
async function handleSave() {
  try {
    const data: UserFormData = {
      userid: editForm.value.userid.trim(),
      name: editForm.value.name.trim(),
      title: getTitleLabel(editForm.value.title),
      phone: editForm.value.phone.trim(),
      privilege: generatePrivilege(),
    }

    let result
    if (dialogMode.value === 'add') {
      result = await addUser(data)
    }
    else {
      result = await updateUser(data)
    }

    if (result.ok) {
      toast.success(
        dialogMode.value === 'add' ? '用户添加成功' : '用户修改成功',
      )
      showEditDialog.value = false
      selectedUsers.value = []
      loadData()
    }
    else {
      toast.error('操作失败', {
        description: result.message || result.response,
      })
    }
  }
  catch (e: any) {
    toast.error('操作失败', { description: e.message })
  }
}

// 删除单个用户
async function handleDeleteOne(user: User) {
  if (!confirm(`确定要删除用户 "${user.name || user.userid}" 吗?`))
    return

  try {
    const result = await deleteUser(user.userid)
    if (result.ok) {
      toast.success('用户删除成功')
      selectedUsers.value = selectedUsers.value.filter(
        u => u.userid !== user.userid,
      )
      loadData()
    }
    else {
      toast.error('删除失败', {
        description: result.message || result.response,
      })
    }
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

// 批量删除用户
async function handleDeleteSelected() {
  if (selectedUsers.value.length === 0) {
    toast.warning('请先选择用户')
    return
  }

  const count = selectedUsers.value.length
  const names = selectedUsers.value.map(u => u.name || u.userid).join(', ')
  if (!confirm(`确定要删除 ${count} 个用户吗?\n${names}`))
    return

  try {
    let successCount = 0
    let failCount = 0
    for (const user of selectedUsers.value) {
      const result = await deleteUser(user.userid)
      if (result.ok) {
        successCount++
      }
      else {
        failCount++
      }
    }

    if (successCount > 0) {
      toast.success(`成功删除 ${successCount} 个用户`)
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个用户删除失败`)
    }

    selectedUsers.value = []
    loadData()
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

// 重置密码
async function handleResetPassword() {
  if (!selectedUser.value) {
    toast.warning('请选择一个用户')
    return
  }

  if (
    !confirm(
      `确定要重置用户 "${selectedUser.value.name || selectedUser.value.userid}" 的密码吗？密码将被重置为"123456"`,
    )
  ) {
    return
  }

  try {
    const result = await resetPassword({ userid: selectedUser.value.userid })
    if (result.ok) {
      toast.success(
        `成功重置用户 ${selectedUser.value.name || selectedUser.value.userid} 的密码`,
      )
      selectedUsers.value = []
    }
    else {
      toast.error('重置密码失败', { description: result.message })
    }
  }
  catch (e: any) {
    toast.error('重置密码失败', { description: e.message })
  }
}

// 初始化
onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="用户管理" description="管理系统用户账号和权限">
    <template #actions>
      <div class="flex items-center gap-1.5 sm:gap-2">
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">刷新</span>
        </UiButton>
        <UiButton size="sm" @click="openAddDialog">
          <Plus class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">新建用户</span>
        </UiButton>
      </div>
    </template>

    <!-- 工具栏 -->
    <div class="mb-3 sm:mb-4 flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!selectedUser"
          @click="openEditDialog()"
        >
          <Pencil class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">修改</span>
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="selectedUsers.length === 0"
          @click="handleDeleteSelected"
        >
          <Trash2 class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">删除</span>
          <span v-if="selectedUsers.length > 0" class="text-xs">({{ selectedUsers.length }})</span>
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!selectedUser"
          @click="handleResetPassword"
        >
          <KeyRound class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">重置密码</span>
        </UiButton>
      </div>
      <div
        v-if="selectedUsers.length > 0"
        class="text-xs sm:text-sm text-muted-foreground whitespace-nowrap"
      >
        已选 {{ selectedUsers.length }}
      </div>
    </div>

    <!-- 数据表格 - 桌面端 -->
    <div class="hidden sm:block border rounded-xl overflow-auto shadow-sm">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-3 w-10">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                :checked="
                  selectedUsers.length === users.length && users.length > 0
                "
                @change="
                  allSelected = ($event.target as HTMLInputElement).checked
                "
              >
            </th>
            <th class="p-3 text-left">
              用户名
            </th>
            <th class="p-3 text-left">
              真实名字
            </th>
            <th class="p-3 text-left">
              职务
            </th>
            <th class="p-3 text-left">
              权限
            </th>
            <th class="p-3 text-left">
              联系电话
            </th>
            <th class="p-3 w-16 text-center">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.userid"
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            :class="{ 'bg-primary/15 hover:bg-primary/20': isSelected(user) }"
            @click="toggleSelect(user)"
          >
            <td class="p-3" @click.stop>
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                :checked="isSelected(user)"
                @change="
                  handleUserCheck(
                    user,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              >
            </td>
            <td class="p-3">
              {{ user.userid }}
            </td>
            <td class="p-3">
              {{ user.name }}
            </td>
            <td class="p-3">
              {{ user.title }}
            </td>
            <td class="p-3">
              <UiBadge
                v-if="isAdminPrivilege(user.privilege)"
                variant="destructive"
              >
                管理
              </UiBadge>
              <span v-else>{{ getPrivilegeDisplay(user.privilege) }}</span>
            </td>
            <td class="p-3">
              {{ user.phone }}
            </td>
            <td class="p-3 text-center" @click.stop>
              <UiButton
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-destructive"
                @click="handleDeleteOne(user)"
              >
                <Trash2 class="h-4 w-4" />
              </UiButton>
            </td>
          </tr>
          <tr v-if="users.length === 0 && !loading">
            <td colspan="7" class="p-8 text-center text-muted-foreground">
              暂无数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 数据列表 - 移动端卡片 -->
    <div class="sm:hidden space-y-2">
      <!-- 全选 -->
      <div class="flex items-center gap-2 px-1 mb-1">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          :checked="selectedUsers.length === users.length && users.length > 0"
          @change="allSelected = ($event.target as HTMLInputElement).checked"
        >
        <span class="text-xs text-muted-foreground">全选</span>
      </div>

      <div
        v-for="user in users"
        :key="user.userid"
        class="border rounded-xl p-3 bg-card transition-colors active:bg-muted/50"
        :class="{ 'border-primary/50 bg-primary/5': isSelected(user) }"
        @click="toggleSelect(user)"
      >
        <div class="flex items-start gap-3">
          <input
            type="checkbox"
            class="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
            :checked="isSelected(user)"
            @click.stop
            @change="
              handleUserCheck(user, ($event.target as HTMLInputElement).checked)
            "
          >
          <div class="flex-1 min-w-0">
            <!-- 第一行：用户名 + 权限标签 -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-semibold text-sm">{{ user.userid }}</span>
                <span
                  v-if="user.name"
                  class="text-xs text-muted-foreground truncate"
                >{{ user.name }}</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <UiBadge
                  v-if="isAdminPrivilege(user.privilege)"
                  variant="destructive"
                  class="text-[10px] px-1.5 py-0"
                >
                  管理
                </UiBadge>
                <span v-else class="text-[10px] text-muted-foreground">{{
                  getPrivilegeDisplay(user.privilege)
                }}</span>
              </div>
            </div>
            <!-- 第二行：职务 + 电话 -->
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span v-if="user.title">{{ user.title }}</span>
              <span v-if="user.phone">{{ user.phone }}</span>
            </div>
          </div>
          <!-- 操作按钮 -->
          <div class="flex items-center gap-0.5 shrink-0" @click.stop>
            <UiButton
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground"
              @click="openEditDialog(user)"
            >
              <Pencil class="h-3.5 w-3.5" />
            </UiButton>
            <UiButton
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-destructive"
              @click="handleDeleteOne(user)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </UiButton>
          </div>
        </div>
      </div>

      <div
        v-if="users.length === 0 && !loading"
        class="p-8 text-center text-muted-foreground border border-dashed rounded-xl"
      >
        暂无数据
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <UiDialog v-model:open="showEditDialog">
      <UiDialogContent
        class="w-[100vw] h-[100dvh] sm:w-auto sm:h-auto sm:min-w-[600px] sm:max-w-[600px] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-none sm:rounded-lg"
      >
        <UiDialogHeader>
          <UiDialogTitle>
            {{
              dialogMode === "add" ? "新建用户" : "修改用户"
            }}
          </UiDialogTitle>
          <UiDialogDescription v-if="dialogMode === 'add'">
            <span class="text-destructive">初始密码是"123456"</span>
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="flex-1 overflow-auto py-4">
          <div class="grid gap-4">
            <!-- 用户名 + 真实名字 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="grid gap-2">
                <label class="text-sm font-medium">用户名 <span class="text-destructive">*</span></label>
                <UiInput
                  v-model="editForm.userid"
                  placeholder="请输入用户名"
                  :disabled="dialogMode === 'edit'"
                  @input="checkUsernameDuplicate"
                />
                <p v-if="usernameDuplicate" class="text-xs text-destructive">
                  此用户名已注册!
                </p>
              </div>
              <div class="grid gap-2">
                <label class="text-sm font-medium">真实名字</label>
                <UiInput v-model="editForm.name" placeholder="请输入真实名字" />
              </div>
            </div>

            <!-- 职务 + 电话 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="grid gap-2">
                <label class="text-sm font-medium">职务 <span class="text-destructive">*</span></label>
                <UiSelect
                  v-model="editForm.title"
                  @update:model-value="onTitleChange"
                >
                  <UiSelectTrigger class="w-full">
                    <UiSelectValue placeholder="请选择职务" />
                  </UiSelectTrigger>
                  <UiSelectContent>
                    <UiSelectItem
                      v-for="opt in titleOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </UiSelectItem>
                  </UiSelectContent>
                </UiSelect>
              </div>
              <div class="grid gap-2">
                <label class="text-sm font-medium">联系电话</label>
                <UiInput
                  v-model="editForm.phone"
                  placeholder="请输入联系电话"
                  inputmode="tel"
                />
              </div>
            </div>

            <!-- 权限选择 -->
            <div class="grid gap-2">
              <label class="text-sm font-medium">选择权限 <span class="text-destructive">*</span></label>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <!-- 管理员 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg cursor-pointer transition-all"
                  :class="{
                    'bg-primary/10 border-primary': permissions.admin,
                    'hover:border-primary/50': !permissions.admin,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.admin"
                    @change="
                      onAdminChange(($event.target as HTMLInputElement).checked)
                    "
                  >
                  <span class="text-sm">管理员</span>
                </label>

                <!-- 业务 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.operator,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.operator"
                    @change="
                      onPermissionChange(
                        'operator',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">业务</span>
                </label>

                <!-- 会计 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.account,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.account"
                    @change="
                      onPermissionChange(
                        'account',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">会计</span>
                </label>

                <!-- 统计 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.statistics,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.statistics"
                    @change="
                      onPermissionChange(
                        'statistics',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">统计</span>
                </label>

                <!-- 客户营业额 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.custRevenue,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.custRevenue"
                    @change="
                      onPermissionChange(
                        'custRevenue',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">客户营业额</span>
                </label>

                <!-- 车船营业额 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.vesselRevenue,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.vesselRevenue"
                    @change="
                      onPermissionChange(
                        'vesselRevenue',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">车船营业额</span>
                </label>

                <!-- 自有车管理 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.selfVehicle,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.selfVehicle"
                    @change="
                      onPermissionChange(
                        'selfVehicle',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">自有车管理</span>
                </label>

                <!-- 查看价格 -->
                <label
                  class="flex items-center gap-2 p-2.5 sm:p-2 border rounded-lg transition-all hover:border-primary/50 cursor-pointer"
                  :class="{
                    'bg-primary/10 border-primary': permissions.seePrice,
                  }"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    :checked="permissions.seePrice"
                    @change="
                      onPermissionChange(
                        'seePrice',
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  >
                  <span class="text-sm">查看价格</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <UiDialogFooter class="shrink-0 gap-2 sm:gap-0">
          <UiButton
            variant="outline"
            class="flex-1 sm:flex-none"
            @click="showEditDialog = false"
          >
            取消
          </UiButton>
          <UiButton
            :disabled="!canSubmit"
            class="flex-1 sm:flex-none"
            @click="handleSave"
          >
            确定
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
