<script setup lang="ts">
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useAuth } from '@/composables/use-auth'
import { isAdmin as isAdminPrivilege } from '@/constants/permissions'
import type { User, UserFormData } from '@/services/api/user.api'
import {
  addUser,
  deleteUser,
  getPrivilegeDisplay,
  getUsers,
  resetPassword,
  titleOptions,
  updateUser,
} from '@/services/api/user.api'

// 权限检查：平台管理员、公司管理员、或权限管理员可访问
const router = useRouter()
const { user: authUser } = useAuth()
const canAccess = computed(
  () =>
    authUser.value?.role === 'platform' ||
    authUser.value?.role === 'owner' ||
    isAdminPrivilege(authUser.value?.privilege ?? []),
)

// 无权限用户重定向
watch(
  canAccess,
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
const selectedUser = computed(() => (selectedUsers.value.length === 1 ? selectedUsers.value[0] : null))

// 对话框状态
const showEditDialog = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const editForm = ref<UserFormData>({
  userid: '',
  name: '',
  title: '',
  phone: '',
  privilege: [],
})

// 权限选项
const permissionOptions = [
  { id: 'admin', label: '管理员' },
  { id: 'operator', label: '业务' },
  { id: 'statistics', label: '统计' },
  { id: 'account', label: '会计' },
  { id: 'custRevenue', label: '客户营业额' },
  { id: 'vesselRevenue', label: '车船营业额' },
  { id: 'selfVehicle', label: '自有车管理' },
  { id: 'seePrice', label: '查看价格' },
  { id: 'custSettle', label: '客户结算' },
  { id: 'vesselSettle', label: '车船结算' },
  { id: 'deleteInvoice', label: '删除运单' },
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
  custSettle: false,
  vesselSettle: false,
  deleteInvoice: false,
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
  } catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  } finally {
    loading.value = false
  }
}

// 选择/取消选择用户
function toggleSelect(user: User) {
  const index = selectedUsers.value.findIndex((u) => u.userid === user.userid)
  if (index >= 0) {
    selectedUsers.value.splice(index, 1)
  } else {
    selectedUsers.value.push(user)
  }
}

// 是否选中
function isSelected(user: User) {
  return selectedUsers.value.some((u) => u.userid === user.userid)
}

// 全选复选框状态
const allSelected = computed({
  get: () => selectedUsers.value.length === users.value.length && users.value.length > 0,
  set: (value: boolean) => {
    if (value) {
      selectedUsers.value = [...users.value]
    } else {
      selectedUsers.value = []
    }
  },
})

// 处理单个用户复选框变化
function handleUserCheck(user: User, checked: boolean) {
  const index = selectedUsers.value.findIndex((u) => u.userid === user.userid)
  if (checked && index < 0) {
    selectedUsers.value.push(user)
  } else if (!checked && index >= 0) {
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
    privilege: [],
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
  const option = titleOptions.find((o) => o.label === label)
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
    custSettle: false,
    vesselSettle: false,
    deleteInvoice: false,
  }
}

// 解析权限数组到 checkbox 状态
function parsePrivilege(privilege: string[]) {
  resetPermissions()
  if (!Array.isArray(privilege)) return

  if (privilege.includes('admin')) {
    permissions.value.admin = true
    return
  }

  permissions.value.operator = privilege.includes('operator')
  permissions.value.statistics = privilege.includes('statistics')
  permissions.value.account = privilege.includes('account')
  permissions.value.custRevenue = privilege.includes('custRevenue')
  permissions.value.vesselRevenue = privilege.includes('vesselRevenue')
  permissions.value.selfVehicle = privilege.includes('selfVehicle')
  permissions.value.seePrice = privilege.includes('seePrice')
  permissions.value.custSettle = privilege.includes('custSettle')
  permissions.value.vesselSettle = privilege.includes('vesselSettle')
  permissions.value.deleteInvoice = privilege.includes('deleteInvoice')
}

// 生成权限数组
function generatePrivilege(): string[] {
  if (permissions.value.admin) {
    return ['admin']
  }

  const result: string[] = []
  if (permissions.value.operator) result.push('operator')
  if (permissions.value.statistics) result.push('statistics')
  if (permissions.value.account) result.push('account')
  if (permissions.value.custRevenue) result.push('custRevenue')
  if (permissions.value.vesselRevenue) result.push('vesselRevenue')
  if (permissions.value.selfVehicle) result.push('selfVehicle')
  if (permissions.value.seePrice) result.push('seePrice')
  if (permissions.value.custSettle) result.push('custSettle')
  if (permissions.value.vesselSettle) result.push('vesselSettle')
  if (permissions.value.deleteInvoice) result.push('deleteInvoice')

  return result
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
    permissions.value.custSettle = false
    permissions.value.vesselSettle = false
    permissions.value.deleteInvoice = false
  } else {
    permissions.value.admin = false
  }
}

// 职务变更
function onTitleChange(value: string | number | bigint | boolean | Record<string, any> | null) {
  if (!value || typeof value !== 'string') return
  if (value === 'ceo' || value === 'mgr') {
    onAdminChange(true)
  } else {
    permissions.value.admin = false
    resetPermissions()
    if (value === 'operator') {
      permissions.value.operator = true
    } else if (value === 'account') {
      permissions.value.account = true
    } else if (value === 'statistician') {
      permissions.value.statistics = true
    }
  }
}

// 检查用户名重复
function checkUsernameDuplicate() {
  if (dialogMode.value === 'edit') return
  const username = editForm.value.userid.trim()
  if (username) {
    usernameDuplicate.value = users.value.some((u) => u.userid === username)
  } else {
    usernameDuplicate.value = false
  }
}

// 是否可以提交
const canSubmit = computed(() => {
  const hasUsername = !!editForm.value.userid.trim()
  const hasPhone = !!editForm.value.phone.trim()
  const hasTitle = !!editForm.value.title
  const hasPermission =
    permissions.value.admin ||
    permissions.value.operator ||
    permissions.value.statistics ||
    permissions.value.account ||
    permissions.value.custRevenue ||
    permissions.value.vesselRevenue ||
    permissions.value.selfVehicle

  return hasUsername && hasPhone && hasTitle && hasPermission && !usernameDuplicate.value
})

// 获取职务中文名
function getTitleLabel(code: string): string {
  const option = titleOptions.find((o) => o.value === code)
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
    } else {
      result = await updateUser(data)
    }

    if (result.ok) {
      toast.success(dialogMode.value === 'add' ? '用户添加成功' : '用户修改成功')
      showEditDialog.value = false
      selectedUsers.value = []
      loadData()
    } else {
      toast.error('操作失败', { description: result.message || result.response })
    }
  } catch (e: any) {
    toast.error('操作失败', { description: e.message })
  }
}

// 是否为主账号（不可删除/编辑角色）
function isOwnerUser(user: User) {
  return user.role === 'owner'
}

// 是否是当前登录用户自己
function isSelf(user: User) {
  return user.userid === authUser.value?.userid
}

// 角色显示
function getRoleDisplay(role?: string) {
  if (role === 'owner') return '主账号'
  return ''
}

// 删除单个用户
async function handleDeleteOne(user: User) {
  if (isOwnerUser(user)) {
    toast.warning('主账号不可删除')
    return
  }
  if (isSelf(user)) {
    toast.warning('不能删除自己的账号')
    return
  }
  if (!confirm(`确定要删除用户 "${user.name || user.userid}" 吗?`)) return

  try {
    const result = await deleteUser(user.userid)
    if (result.ok) {
      toast.success('用户删除成功')
      selectedUsers.value = selectedUsers.value.filter((u) => u.userid !== user.userid)
      loadData()
    } else {
      toast.error('删除失败', { description: result.message || result.response })
    }
  } catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

// 批量删除用户
async function handleDeleteSelected() {
  // 过滤掉主账号和自己
  const deletable = selectedUsers.value.filter((u) => !isOwnerUser(u) && !isSelf(u))
  if (deletable.length === 0) {
    toast.warning('没有可删除的用户（主账号和自己不可删除）')
    return
  }

  const count = deletable.length
  const names = deletable.map((u) => u.name || u.userid).join(', ')
  if (!confirm(`确定要删除 ${count} 个用户吗?\n${names}`)) return

  try {
    let successCount = 0
    let failCount = 0
    for (const user of deletable) {
      const result = await deleteUser(user.userid)
      if (result.ok) {
        successCount++
      } else {
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
  } catch (e: any) {
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
  )
    return

  try {
    const result = await resetPassword({ userid: selectedUser.value.userid })
    if (result.ok) {
      toast.success(`成功重置用户 ${selectedUser.value.name || selectedUser.value.userid} 的密码`)
      selectedUsers.value = []
    } else {
      toast.error('重置密码失败', { description: result.message })
    }
  } catch (e: any) {
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
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 mr-1" />
          刷新
        </UiButton>
        <UiButton size="sm" @click="openAddDialog">
          <Plus class="w-4 h-4 mr-1" />
          新建用户
        </UiButton>
      </div>
    </template>

    <!-- 工具栏 -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <UiButton variant="outline" size="sm" :disabled="!selectedUser" @click="openEditDialog()">
          <Pencil class="w-4 h-4 mr-1" />
          修改
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="selectedUsers.length === 0" @click="handleDeleteSelected">
          <Trash2 class="w-4 h-4 mr-1" />
          删除{{ selectedUsers.length > 0 ? ` (${selectedUsers.length})` : '' }}
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="!selectedUser" @click="handleResetPassword">
          <KeyRound class="w-4 h-4 mr-1" />
          重置密码
        </UiButton>
      </div>
      <div v-if="selectedUsers.length > 0" class="text-sm text-muted-foreground">
        已选择 {{ selectedUsers.length }} 个用户
      </div>
    </div>

    <!-- 桌面端表格 -->
    <div class="hidden sm:block border rounded-lg overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-3 w-10">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                :checked="selectedUsers.length === users.length && users.length > 0"
                @change="allSelected = ($event.target as HTMLInputElement).checked"
              />
            </th>
            <th class="p-3 text-left">用户名</th>
            <th class="p-3 text-left">手机号</th>
            <th class="p-3 text-left">真实名字</th>
            <th class="p-3 text-left">角色</th>
            <th class="p-3 text-left">职务</th>
            <th class="p-3 text-left">权限</th>
            <th class="p-3 w-16 text-center">操作</th>
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
                @change="handleUserCheck(user, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="p-3">{{ user.userid }}</td>
            <td class="p-3">{{ user.phone }}</td>
            <td class="p-3">{{ user.name }}</td>
            <td class="p-3">
              <UiBadge v-if="isOwnerUser(user)" variant="outline">
                {{ getRoleDisplay(user.role) }}
              </UiBadge>
            </td>
            <td class="p-3">{{ user.title }}</td>
            <td class="p-3">
              <UiBadge v-if="user.privilege.includes('admin')" variant="destructive"> 管理 </UiBadge>
              <span v-else>{{ getPrivilegeDisplay(user.privilege) }}</span>
            </td>
            <td class="p-3 text-center" @click.stop>
              <UiButton
                v-if="!isOwnerUser(user) && !isSelf(user)"
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
            <td colspan="8" class="p-8 text-center text-muted-foreground">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片列表 -->
    <div class="sm:hidden space-y-2">
      <div v-if="users.length === 0 && !loading" class="p-8 text-center text-muted-foreground border rounded-lg">
        暂无数据
      </div>
      <div
        v-for="user in users"
        :key="'m-' + user.userid"
        class="border rounded-lg p-3 cursor-pointer transition-colors"
        :class="isSelected(user) ? 'bg-primary/15 border-primary/30' : 'hover:bg-muted/30'"
        @click="toggleSelect(user)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-start gap-2 min-w-0 flex-1">
            <input
              type="checkbox"
              class="h-4 w-4 mt-0.5 shrink-0 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              :checked="isSelected(user)"
              @click.stop
              @change="handleUserCheck(user, ($event.target as HTMLInputElement).checked)"
            />
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium">{{ user.userid }}</span>
                <UiBadge v-if="isOwnerUser(user)" variant="outline" class="text-[10px] px-1 py-0">
                  {{ getRoleDisplay(user.role) }}
                </UiBadge>
                <UiBadge v-if="user.privilege.includes('admin')" variant="destructive" class="text-[10px] px-1 py-0">
                  管理
                </UiBadge>
              </div>
              <div class="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div v-if="user.name">{{ user.name }} <span v-if="user.title" class="ml-1">/ {{ user.title }}</span></div>
                <div v-if="user.phone">{{ user.phone }}</div>
                <div v-if="!user.privilege.includes('admin') && getPrivilegeDisplay(user.privilege)">
                  {{ getPrivilegeDisplay(user.privilege) }}
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0" @click.stop>
            <button
              class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm active:scale-95 transition-all"
              @click="openEditDialog(user)"
            >
              <Pencil class="h-3 w-3" />
              编辑
            </button>
            <button
              v-if="!isOwnerUser(user) && !isSelf(user)"
              class="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-xs text-destructive shadow-sm active:scale-95 transition-all"
              @click="handleDeleteOne(user)"
            >
              <Trash2 class="h-3 w-3" />
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <UiDialog v-model:open="showEditDialog">
      <UiDialogContent class="w-full max-w-[600px] max-h-[90vh] overflow-y-auto">
        <UiDialogHeader>
          <UiDialogTitle>{{ dialogMode === 'add' ? '新建用户' : '修改用户' }}</UiDialogTitle>
          <UiDialogDescription v-if="dialogMode === 'add'">
            <span class="text-destructive">初始密码是"123456"</span>
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="grid gap-4 py-4">
          <!-- 用户名 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">用户名 <span class="text-destructive">*</span></label>
            <UiInput
              v-model="editForm.userid"
              placeholder="请输入用户名"
              :disabled="dialogMode === 'edit'"
              @input="checkUsernameDuplicate"
            />
            <p v-if="usernameDuplicate" class="text-xs text-destructive">此用户名已注册!</p>
          </div>

          <!-- 电话 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">手机号 <span class="text-destructive">*</span></label>
            <UiInput v-model="editForm.phone" placeholder="请输入手机号" />
            <p class="text-xs text-muted-foreground">手机号也可以作为登录账号使用</p>
          </div>

          <!-- 真实名字 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">真实名字</label>
            <UiInput v-model="editForm.name" placeholder="请输入真实名字" />
          </div>

          <!-- 职务 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">职务 <span class="text-destructive">*</span></label>
            <UiSelect v-model="editForm.title" @update:model-value="onTitleChange">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="请选择职务" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="opt in titleOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <!-- 权限选择 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">选择权限 <span class="text-destructive">*</span></label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <!-- 管理员 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.admin,
                  'hover:border-primary/50': !permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.admin"
                  @change="onAdminChange(($event.target as HTMLInputElement).checked)"
                />
                <span class="text-sm">管理员</span>
              </label>

              <!-- 业务 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.operator,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.operator"
                  :disabled="permissions.admin"
                  @change="permissions.operator = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">业务</span>
              </label>

              <!-- 会计 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.account,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.account"
                  :disabled="permissions.admin"
                  @change="permissions.account = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">会计</span>
              </label>

              <!-- 统计 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.statistics,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.statistics"
                  :disabled="permissions.admin"
                  @change="permissions.statistics = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">统计</span>
              </label>

              <!-- 客户营业额 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.custRevenue,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.custRevenue"
                  :disabled="permissions.admin"
                  @change="permissions.custRevenue = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">客户营业额</span>
              </label>

              <!-- 车船营业额 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.vesselRevenue,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.vesselRevenue"
                  :disabled="permissions.admin"
                  @change="permissions.vesselRevenue = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">车船营业额</span>
              </label>

              <!-- 自有车管理 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.selfVehicle,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.selfVehicle"
                  :disabled="permissions.admin"
                  @change="permissions.selfVehicle = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">自有车管理</span>
              </label>

              <!-- 查看价格 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.seePrice,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.seePrice"
                  :disabled="permissions.admin"
                  @change="permissions.seePrice = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">查看价格</span>
              </label>

              <!-- 结算价格��作 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.custSettle,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.custSettle"
                  :disabled="permissions.admin"
                  @change="permissions.custSettle = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">客户结算</span>
              </label>

              <!-- 车船结算 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.vesselSettle,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.vesselSettle"
                  :disabled="permissions.admin"
                  @change="permissions.vesselSettle = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">车船结算</span>
              </label>

              <!-- 删除运单 -->
              <label
                class="flex items-center gap-2 p-2 border rounded-lg transition-all"
                :class="{
                  'bg-primary/10 border-primary': permissions.deleteInvoice,
                  'hover:border-primary/50 cursor-pointer': !permissions.admin,
                  'opacity-50 cursor-not-allowed': permissions.admin,
                }"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  :checked="permissions.deleteInvoice"
                  :disabled="permissions.admin"
                  @change="permissions.deleteInvoice = ($event.target as HTMLInputElement).checked"
                />
                <span class="text-sm">删除运单</span>
              </label>
            </div>
          </div>
        </div>

        <UiDialogFooter class="flex-col-reverse sm:flex-row gap-2">
          <UiButton variant="outline" class="w-full sm:w-auto" @click="showEditDialog = false"> 取消 </UiButton>
          <UiButton :disabled="!canSubmit" class="w-full sm:w-auto" @click="handleSave"> 确定 </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
