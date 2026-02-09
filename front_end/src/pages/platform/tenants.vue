<script setup lang="ts">
import { Building2, Pencil, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import {
  createTenant,
  deleteTenant,
  getTenants,
  getTenantUsers,
  updateTenant,
  updateTenantStatus,
} from '@/services/api/platform.api'
import type { CreateTenantData, TenantItem, TenantUser } from '@/services/api/platform.api'

// State
const loading = ref(false)
const tenants = ref<TenantItem[]>([])
const searchText = ref('')
const statusFilter = ref<'' | 'active' | 'suspended'>('')

// Users dialog
const showUsersDialog = ref(false)
const usersDialogTenant = ref<TenantItem | null>(null)
const tenantUsers = ref<TenantUser[]>([])
const usersLoading = ref(false)

// Create/Edit dialog
const showFormDialog = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const formLoading = ref(false)
const editingTenantId = ref('')
const tenantForm = ref({
  code: '',
  name: '',
  fullName: '',
  contact: { name: '', phone: '', email: '', address: '' },
  plan: 'basic',
  maxUsers: 5,
})
const ownerForm = ref({
  userid: '',
  name: '',
  phone: '',
})

// Delete confirmation
const showDeleteDialog = ref(false)
const deletingTenant = ref<TenantItem | null>(null)

// Filtered tenants
const filteredTenants = computed(() => {
  let list = tenants.value
  if (statusFilter.value) {
    list = list.filter(t => t.status === statusFilter.value)
  }
  if (searchText.value.trim()) {
    const q = searchText.value.trim().toLowerCase()
    list = list.filter(t =>
      t.name.toLowerCase().includes(q)
      || t.code.toLowerCase().includes(q)
      || (t.fullName && t.fullName.toLowerCase().includes(q)),
    )
  }
  return list
})

// Can submit form
const canSubmitForm = computed(() => {
  const hasCode = !!tenantForm.value.code.trim()
  const hasName = !!tenantForm.value.name.trim()
  const hasOwnerUserid = !!ownerForm.value.userid.trim()
  const hasOwnerName = !!ownerForm.value.name.trim()

  if (formMode.value === 'add') {
    return hasCode && hasName && hasOwnerUserid && hasOwnerName
  }
  return hasName
})

async function loadTenants() {
  loading.value = true
  try {
    const res = await getTenants()
    if (res.ok) {
      tenants.value = res.data
    }
  }
  catch (e: any) {
    toast.error('获取公司列表失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

async function toggleStatus(tenant: TenantItem) {
  const newStatus = tenant.status === 'active' ? 'suspended' : 'active'
  const label = newStatus === 'active' ? '启用' : '禁用'
  try {
    const res = await updateTenantStatus(tenant._id, newStatus)
    if (res.ok) {
      tenant.status = newStatus
      toast.success(`已${label}公司: ${tenant.name}`)
    }
  }
  catch (e: any) {
    toast.error(`${label}失败`, { description: e.message })
  }
}

async function viewUsers(tenant: TenantItem) {
  usersDialogTenant.value = tenant
  showUsersDialog.value = true
  usersLoading.value = true
  tenantUsers.value = []
  try {
    const res = await getTenantUsers(tenant._id)
    if (res.ok) {
      tenantUsers.value = res.data
    }
  }
  catch (e: any) {
    toast.error('获取用户列表失败', { description: e.message })
  }
  finally {
    usersLoading.value = false
  }
}

// Open create dialog
function openCreateDialog() {
  formMode.value = 'add'
  editingTenantId.value = ''
  tenantForm.value = {
    code: '',
    name: '',
    fullName: '',
    contact: { name: '', phone: '', email: '', address: '' },
    plan: 'basic',
    maxUsers: 5,
  }
  ownerForm.value = { userid: '', name: '', phone: '' }
  showFormDialog.value = true
}

// Open edit dialog
async function openEditDialog(tenant: TenantItem) {
  formMode.value = 'edit'
  editingTenantId.value = tenant._id
  tenantForm.value = {
    code: tenant.code,
    name: tenant.name,
    fullName: tenant.fullName || '',
    contact: {
      name: tenant.contact?.name || '',
      phone: tenant.contact?.phone || '',
      email: tenant.contact?.email || '',
      address: tenant.contact?.address || '',
    },
    plan: tenant.plan,
    maxUsers: tenant.maxUsers,
  }

  // Fetch owner info
  ownerForm.value = { userid: '', name: '', phone: '' }
  try {
    const res = await getTenantUsers(tenant._id)
    if (res.ok) {
      const owner = res.data.find(u => u.role === 'owner')
      if (owner) {
        ownerForm.value = {
          userid: owner.userid,
          name: owner.profile?.name || '',
          phone: owner.profile?.phone || '',
        }
      }
    }
  }
  catch {
    // non-critical, proceed with empty owner info
  }

  showFormDialog.value = true
}

// Submit create/edit form
async function handleFormSubmit() {
  formLoading.value = true
  try {
    if (formMode.value === 'add') {
      const data: CreateTenantData = {
        tenant: {
          code: tenantForm.value.code.trim(),
          name: tenantForm.value.name.trim(),
          fullName: tenantForm.value.fullName.trim() || undefined,
          contact: tenantForm.value.contact,
          plan: tenantForm.value.plan,
          maxUsers: tenantForm.value.maxUsers,
        },
        owner: {
          userid: ownerForm.value.userid.trim(),
          name: ownerForm.value.name.trim(),
          phone: ownerForm.value.phone.trim() || undefined,
        },
      }
      const res = await createTenant(data)
      if (res.ok) {
        toast.success('公司创建成功')
        showFormDialog.value = false
        loadTenants()
      }
      else {
        toast.error('创建失败', { description: res.msg })
      }
    }
    else {
      const res = await updateTenant({
        tenantId: editingTenantId.value,
        tenant: {
          name: tenantForm.value.name.trim(),
          fullName: tenantForm.value.fullName.trim(),
          contact: tenantForm.value.contact,
          plan: tenantForm.value.plan,
          maxUsers: tenantForm.value.maxUsers,
        },
        owner: ownerForm.value.userid
          ? {
              userid: ownerForm.value.userid,
              name: ownerForm.value.name.trim(),
              phone: ownerForm.value.phone.trim(),
            }
          : undefined,
      })
      if (res.ok) {
        toast.success('公司修改成功')
        showFormDialog.value = false
        loadTenants()
      }
      else {
        toast.error('修改失败', { description: res.msg })
      }
    }
  }
  catch (e: any) {
    toast.error('操作失败', { description: e.message })
  }
  finally {
    formLoading.value = false
  }
}

// Open delete confirmation
function confirmDelete(tenant: TenantItem) {
  deletingTenant.value = tenant
  showDeleteDialog.value = true
}

// Execute delete
async function handleDelete() {
  if (!deletingTenant.value) return
  try {
    const res = await deleteTenant(deletingTenant.value._id)
    if (res.ok) {
      toast.success(`已删除公司: ${deletingTenant.value.name}`)
      showDeleteDialog.value = false
      deletingTenant.value = null
      loadTenants()
    }
    else {
      toast.error('删除失败', { description: res.msg })
    }
  }
  catch (e: any) {
    toast.error('删除失败', { description: e.message })
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const planLabels: Record<string, string> = {
  basic: '基础版',
  enterprise: '企业版',
}

const planOptions = [
  { value: 'basic', label: '基础版' },
  { value: 'enterprise', label: '企业版' },
]

onMounted(() => {
  loadTenants()
})
</script>

<template>
  <BasicPage title="公司账号管理" description="管理平台所有公司账号">
    <template #actions>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="loadTenants">
          <RefreshCw class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">刷新</span>
        </UiButton>
        <UiButton size="sm" @click="openCreateDialog">
          <Plus class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">新建公司</span>
        </UiButton>
      </div>
    </template>

    <!-- 搜索和筛选 -->
    <div class="mb-4 flex flex-col sm:flex-row gap-2">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <UiInput
          v-model="searchText"
          placeholder="搜索公司名称或编码..."
          class="pl-8"
        />
      </div>
      <select
        v-model="statusFilter"
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">
          全部状态
        </option>
        <option value="active">
          活跃
        </option>
        <option value="suspended">
          已暂停
        </option>
      </select>
    </div>

    <!-- Desktop Table -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left">
              公司名称
            </th>
            <th class="p-2 text-left">
              编码
            </th>
            <th class="p-2 text-center">
              状态
            </th>
            <th class="p-2 text-center">
              套餐
            </th>
            <th class="p-2 text-center">
              用户数/上限
            </th>
            <th class="p-2 text-left">
              最近活跃
            </th>
            <th class="p-2 text-left">
              创建时间
            </th>
            <th class="p-2 text-center">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tenant in filteredTenants" :key="tenant._id" class="border-t hover:bg-muted/30">
            <td class="p-2 font-medium">
              {{ tenant.name }}
            </td>
            <td class="p-2 text-muted-foreground">
              {{ tenant.code }}
            </td>
            <td class="p-2 text-center">
              <UiBadge :variant="tenant.status === 'active' ? 'default' : 'destructive'">
                {{ tenant.status === 'active' ? '活跃' : '已暂停' }}
              </UiBadge>
            </td>
            <td class="p-2 text-center">
              {{ planLabels[tenant.plan] || tenant.plan }}
            </td>
            <td class="p-2 text-center">
              {{ tenant.userCount }} / {{ tenant.maxUsers }}
            </td>
            <td class="p-2 text-muted-foreground">
              {{ formatDateTime(tenant.lastActiveAt) }}
            </td>
            <td class="p-2 text-muted-foreground">
              {{ formatDate(tenant.createDate) }}
            </td>
            <td class="p-2 text-center">
              <div class="flex items-center justify-center gap-1">
                <UiButton variant="ghost" size="sm" @click="viewUsers(tenant)">
                  <Users class="w-4 h-4 mr-1" />
                  子账号
                </UiButton>
                <UiButton variant="ghost" size="sm" @click="openEditDialog(tenant)">
                  <Pencil class="w-4 h-4" />
                </UiButton>
                <UiButton
                  :variant="tenant.status === 'active' ? 'outline' : 'default'"
                  size="sm"
                  @click="toggleStatus(tenant)"
                >
                  {{ tenant.status === 'active' ? '禁用' : '启用' }}
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="sm"
                  class="text-destructive hover:text-destructive"
                  @click="confirmDelete(tenant)"
                >
                  <Trash2 class="w-4 h-4" />
                </UiButton>
              </div>
            </td>
          </tr>
          <tr v-if="filteredTenants.length === 0 && !loading">
            <td colspan="8" class="p-8 text-center text-muted-foreground">
              暂无数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Card View -->
    <div class="lg:hidden space-y-2">
      <div v-for="tenant in filteredTenants" :key="tenant._id" class="border rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Building2 class="w-4 h-4 text-muted-foreground" />
            <span class="font-medium">{{ tenant.name }}</span>
          </div>
          <UiBadge :variant="tenant.status === 'active' ? 'default' : 'destructive'">
            {{ tenant.status === 'active' ? '活跃' : '已暂停' }}
          </UiBadge>
        </div>
        <div class="text-sm text-muted-foreground space-y-1 mb-3">
          <div class="flex justify-between">
            <span>编码: {{ tenant.code }}</span>
            <span>{{ planLabels[tenant.plan] || tenant.plan }}</span>
          </div>
          <div class="flex justify-between">
            <span>用户: {{ tenant.userCount }} / {{ tenant.maxUsers }}</span>
            <span>{{ formatDate(tenant.createDate) }}</span>
          </div>
          <div>最近活跃: {{ formatDateTime(tenant.lastActiveAt) }}</div>
        </div>
        <div class="flex gap-2">
          <UiButton variant="outline" size="sm" class="flex-1" @click="viewUsers(tenant)">
            <Users class="w-4 h-4 mr-1" />
            子账号
          </UiButton>
          <UiButton variant="outline" size="sm" @click="openEditDialog(tenant)">
            <Pencil class="w-4 h-4" />
          </UiButton>
          <UiButton
            :variant="tenant.status === 'active' ? 'outline' : 'default'"
            size="sm"
            class="flex-1"
            @click="toggleStatus(tenant)"
          >
            {{ tenant.status === 'active' ? '禁用' : '启用' }}
          </UiButton>
          <UiButton
            variant="outline"
            size="sm"
            class="text-destructive"
            @click="confirmDelete(tenant)"
          >
            <Trash2 class="w-4 h-4" />
          </UiButton>
        </div>
      </div>
      <div v-if="filteredTenants.length === 0 && !loading" class="py-8 text-center text-muted-foreground">
        暂无数据
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center text-muted-foreground">
      加载中...
    </div>

    <!-- 子账号 Dialog -->
    <UiDialog v-model:open="showUsersDialog">
      <UiDialogContent class="max-w-2xl">
        <UiDialogHeader>
          <UiDialogTitle>{{ usersDialogTenant?.name }} - 子账号列表</UiDialogTitle>
          <UiDialogDescription>
            编码: {{ usersDialogTenant?.code }} | 用户数: {{ tenantUsers.length }} / {{ usersDialogTenant?.maxUsers }}
          </UiDialogDescription>
        </UiDialogHeader>

        <div v-if="usersLoading" class="py-8 text-center text-muted-foreground">
          加载中...
        </div>

        <div v-else class="max-h-96 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50 sticky top-0">
              <tr>
                <th class="p-2 text-left">
                  用户名
                </th>
                <th class="p-2 text-left">
                  姓名
                </th>
                <th class="p-2 text-center">
                  角色
                </th>
                <th class="p-2 text-center">
                  状态
                </th>
                <th class="p-2 text-left">
                  最后登录
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in tenantUsers" :key="u._id" class="border-t hover:bg-muted/30">
                <td class="p-2">
                  {{ u.userid }}
                </td>
                <td class="p-2">
                  {{ u.profile?.name || '-' }}
                </td>
                <td class="p-2 text-center">
                  <UiBadge variant="secondary">
                    {{ u.role === 'owner' ? '主账号' : '成员' }}
                  </UiBadge>
                </td>
                <td class="p-2 text-center">
                  <UiBadge :variant="u.status === 'active' ? 'default' : 'destructive'">
                    {{ u.status === 'active' ? '正常' : '禁用' }}
                  </UiBadge>
                </td>
                <td class="p-2 text-muted-foreground">
                  {{ formatDateTime(u.lastLoginAt) }}
                </td>
              </tr>
              <tr v-if="tenantUsers.length === 0">
                <td colspan="5" class="p-8 text-center text-muted-foreground">
                  暂无用户
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" @click="showUsersDialog = false">
            关闭
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 新建/编辑公司 Dialog -->
    <UiDialog v-model:open="showFormDialog">
      <UiDialogContent class="w-[95vw] lg:w-[65vw] sm:max-w-none">
        <UiDialogHeader>
          <UiDialogTitle>{{ formMode === 'add' ? '新建公司' : '编辑公司' }}</UiDialogTitle>
          <UiDialogDescription v-if="formMode === 'add'">
            创建新公司并设置主账号，主账号初始密码为
            <span class="text-destructive font-medium">123456</span>
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
          <!-- 公司信息 -->
          <div class="text-sm font-semibold text-muted-foreground">
            公司信息
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- 公司编码 -->
            <div class="grid gap-2">
              <label class="text-sm font-medium">公司编码 <span class="text-destructive">*</span></label>
              <UiInput
                v-model="tenantForm.code"
                placeholder="如 NLSW"
                :disabled="formMode === 'edit'"
              />
            </div>

            <!-- 公司名称 -->
            <div class="grid gap-2">
              <label class="text-sm font-medium">公司名称 <span class="text-destructive">*</span></label>
              <UiInput v-model="tenantForm.name" placeholder="请输入公司名称" />
            </div>
          </div>

          <!-- 全称 -->
          <div class="grid gap-2">
            <label class="text-sm font-medium">公司全称</label>
            <UiInput v-model="tenantForm.fullName" placeholder="请输入公司全称（选填）" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- 套餐 -->
            <div class="grid gap-2">
              <label class="text-sm font-medium">套餐</label>
              <UiSelect v-model="tenantForm.plan">
                <UiSelectTrigger>
                  <UiSelectValue placeholder="请选择套餐" />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem v-for="opt in planOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </UiSelectItem>
                </UiSelectContent>
              </UiSelect>
            </div>

            <!-- 最大用户数 -->
            <div class="grid gap-2">
              <label class="text-sm font-medium">最大用户数</label>
              <UiInput v-model.number="tenantForm.maxUsers" type="number" min="1" />
            </div>
          </div>

          <!-- 联系信息 -->
          <div class="text-sm font-semibold text-muted-foreground mt-2">
            联系信息
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <label class="text-sm font-medium">联系人</label>
              <UiInput v-model="tenantForm.contact.name" placeholder="联系人姓名" />
            </div>
            <div class="grid gap-2">
              <label class="text-sm font-medium">联系电话</label>
              <UiInput v-model="tenantForm.contact.phone" placeholder="联系电话" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <label class="text-sm font-medium">邮箱</label>
              <UiInput v-model="tenantForm.contact.email" placeholder="邮箱地址" />
            </div>
            <div class="grid gap-2">
              <label class="text-sm font-medium">地址</label>
              <UiInput v-model="tenantForm.contact.address" placeholder="公司地址" />
            </div>
          </div>

          <!-- 主账号信息 -->
          <div class="text-sm font-semibold text-muted-foreground mt-2">
            主账号信息
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <label class="text-sm font-medium">
                用户名
                <span v-if="formMode === 'add'" class="text-destructive">*</span>
              </label>
              <UiInput
                v-model="ownerForm.userid"
                placeholder="主账号登录用户名"
                :disabled="formMode === 'edit'"
              />
            </div>
            <div class="grid gap-2">
              <label class="text-sm font-medium">
                姓名
                <span v-if="formMode === 'add'" class="text-destructive">*</span>
              </label>
              <UiInput v-model="ownerForm.name" placeholder="主账号姓名" />
            </div>
          </div>

          <div class="grid gap-2">
            <label class="text-sm font-medium">手机号</label>
            <UiInput v-model="ownerForm.phone" placeholder="主账号手机号（选填）" />
          </div>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" @click="showFormDialog = false">
            取消
          </UiButton>
          <UiButton :disabled="!canSubmitForm || formLoading" @click="handleFormSubmit">
            {{ formLoading ? '提交中...' : '确定' }}
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- 删除确认 Dialog -->
    <UiAlertDialog v-model:open="showDeleteDialog">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>确认删除公司</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            确定要删除公司「{{ deletingTenant?.name }}」({{ deletingTenant?.code }}) 吗？
            该操作将禁用该公司下所有用户账号。此操作不可恢复。
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel @click="showDeleteDialog = false">
            取消
          </UiAlertDialogCancel>
          <UiAlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDelete"
          >
            确认删除
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
  requiresPlatformUser: true
</route>
