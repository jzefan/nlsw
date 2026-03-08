<script setup lang="ts">
import dayjs from 'dayjs'
import { Upload as UploadIcon, X as XIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as settleApi from '@/services/api/settle.api'

const emit = defineEmits(['confirm'])

const visible = ref(false)
const saving = ref(false)
const isBatchMode = ref(false)
interface ExistingImage {
  id: string
  filename: string
  original_filename: string
  file_size: number
  mime_type: string
  uploader: string
  upload_time: string
}

const invoiceData = ref<any>(null)
const innerNo = ref('')
const previewImages = ref<Array<{ file: File, url: string }>>([])
const uploadedFiles = ref<File[]>([])
const existingImages = ref<ExistingImage[]>([])
const loadingExistingImages = ref(false)
const dayManualChanged = ref(false)
const batchWnoList = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement>()

const MAX_FILES = 9
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const totalImagesCount = computed(() => existingImages.value.length + uploadedFiles.value.length)

// 上传图片后自动勾选回执（仅在新增图片时自动勾选，不限制用户手动操作）

const formData = ref({
  chargeCash: '0',
  chargeOil: '0',
  unshipDate: '',
  delayDay: '0',
  receiptChecked: false,
  remark: '',
})

const dialogTitle = computed(() => {
  if (isBatchMode.value) {
    return `批量预付设置 (${batchWnoList.value.length} 条记录)`
  }
  return '结算信息填写'
})

// 打开对话框 - 单条记录模式
async function open(invoice: any, forVessel: boolean, inner?: string) {
  invoiceData.value = invoice
  innerNo.value = inner || ''
  isBatchMode.value = false
  resetForm()

  if (forVessel || !inner) {
    // 主运单
    formData.value.chargeCash = (invoice.charge_cash || 0).toString()
    formData.value.chargeOil = (invoice.charge_oil || 0).toString()
    formData.value.delayDay = (invoice.delay_day || 0).toString()
    formData.value.unshipDate = invoice.unship_date ? dayjs(invoice.unship_date).format('YYYY-MM-DD') : ''
    formData.value.receiptChecked = invoice.receipt === 1
    formData.value.remark = invoice.remark || ''
  }
  else {
    // 内部车辆
    const vehObj = makeVehInfo(invoice)
    if (vehObj && vehObj[inner]) {
      const tmp = vehObj[inner]
      formData.value.chargeCash = (tmp.charge_cash || 0).toString()
      formData.value.chargeOil = (tmp.charge_oil || 0).toString()
      formData.value.delayDay = (tmp.delay_day || 0).toString()
      formData.value.unshipDate = tmp.unship_date ? dayjs(tmp.unship_date).format('YYYY-MM-DD') : ''
      formData.value.receiptChecked = tmp.receipt === 1
      formData.value.remark = tmp.remark || ''
    }
  }

  visible.value = true

  // 加载已上传的图片
  await loadExistingImages()
}

// 加载已上传的图片（只获取元数据，图片由浏览器直接加载）
async function loadExistingImages() {
  const wno = innerNo.value || invoiceData.value?.waybill_no
  if (!wno) {
    return
  }

  loadingExistingImages.value = true
  try {
    const response = await settleApi.getReceiptImagesList(wno)
    if (response.ok && response.images && response.images.length > 0) {
      existingImages.value = response.images
    }
  }
  catch (error: any) {
    console.error('加载已上传图片失败:', error)
  }
  finally {
    loadingExistingImages.value = false
  }
}

// 打开对话框 - 批量模式
function openBatch(wnoList: string[]) {
  isBatchMode.value = true
  batchWnoList.value = wnoList
  resetForm()
  visible.value = true
}

function resetForm() {
  formData.value = {
    chargeCash: '0',
    chargeOil: '0',
    unshipDate: '',
    delayDay: '0',
    receiptChecked: false,
    remark: '',
  }
  previewImages.value = []
  uploadedFiles.value = []
  existingImages.value = []
  dayManualChanged.value = false

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// 禁用发货日期之前的日期
function disabledDate(date: Date) {
  if (!invoiceData.value || !invoiceData.value.ship_date) {
    return false
  }
  // dayjs objects are immutable
  const shipDate = dayjs(invoiceData.value.ship_date).startOf('day')
  return dayjs(date).isBefore(shipDate)
}

// 卸船日期变化时自动计算滞留天数
function handleUnshipDateChange(value: string) {
  if (!value || !invoiceData.value || !invoiceData.value.ship_date || dayManualChanged.value) {
    return
  }

  const shipDate = dayjs(invoiceData.value.ship_date)
  const unshipDate = dayjs(value)
  const days = unshipDate.diff(shipDate, 'day') - 7

  if (days > 0) {
    formData.value.delayDay = days.toString()
  }
  else {
    formData.value.delayDay = '0'
  }
}

// 滞留天数手动输入时更新卸船日期
function handleDelayDayInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value
  const day = Number.parseInt(value)
  if (isNaN(day) || day <= 0 || !invoiceData.value || !invoiceData.value.ship_date) {
    return
  }

  dayManualChanged.value = true
  const shipDate = dayjs(invoiceData.value.ship_date)
  const unshipDate = shipDate.add(day + 7, 'day')
  formData.value.unshipDate = unshipDate.format('YYYY-MM-DD')

  // 重置标志，允许后续日期变化时自动计算
  setTimeout(() => {
    dayManualChanged.value = false
  }, 500)
}

// 回执状态变化（用户可自由切换，无需图片）
function handleReceiptChange(_checked: boolean) {
  // 回执状态与图片解耦，无需额外逻辑
}

// 文件选择
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])

  if (files.length === 0) {
    return
  }

  processFiles(files)
}

// 处理拖拽上传
function handleDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length > 0) {
    processFiles(files)
  }
}

// 处理文件列表
function processFiles(files: File[]) {
  // 检查总数是否超过限制（包括已上传的图片）
  const remainingSlots = MAX_FILES - totalImagesCount.value
  if (files.length > remainingSlots) {
    toast.warning(`最多只能上传${MAX_FILES}张图片，当前还可以添加${remainingSlots}张`)
    files = files.slice(0, remainingSlots)
  }

  for (const file of files) {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      toast.warning(`${file.name} 不是图片文件，已跳过`)
      continue
    }

    // 检查文件大小（最大5M）
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`${file.name} 超过5MB，已跳过`)
      continue
    }

    // 添加到选中列表
    uploadedFiles.value.push(file)

    // 读取文件并显示预览
    const reader = new FileReader()
    reader.onload = (e) => {
      previewImages.value.push({
        file,
        url: e.target?.result as string,
      })
    }
    reader.readAsDataURL(file)
  }
  // 上传图片后自动勾选回执
  if (uploadedFiles.value.length > 0) {
    formData.value.receiptChecked = true
  }
}

// 删除新上传的图片（尚未提交）
function handleRemoveImage(index: number) {
  uploadedFiles.value.splice(index, 1)
  previewImages.value.splice(index, 1)

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// 删除已上传的图片（服务器上的）
async function handleDeleteExistingImage(imageId: string) {
  try {
    await settleApi.deleteReceiptImage(imageId)
    existingImages.value = existingImages.value.filter(img => img.id !== imageId)
    toast.success('图片删除成功')
  }
  catch (error: any) {
    toast.error(error.message || '删除图片失败')
  }
}

async function handleConfirm() {
  try {
    saving.value = true

    const unshipData: any = {
      charge_cash: Number.parseFloat(formData.value.chargeCash) || 0,
      charge_oil: Number.parseFloat(formData.value.chargeOil) || 0,
    }

    let wnoList: string[] = []
    let partInd = 1 // 默认只更新预付信息

    if (isBatchMode.value) {
      // 批量模式：只更新预付信息
      if (batchWnoList.value.length === 0) {
        toast.warning('没有可更新的运单')
        return
      }
      wnoList = batchWnoList.value
      partInd = 1 // 只更新预付信息
    }
    else {
      // 单条记录模式：更新完整信息
      unshipData.unship_date = formData.value.unshipDate || null
      unshipData.delay_day = Number.parseInt(formData.value.delayDay) || 0
      unshipData.receipt = formData.value.receiptChecked ? 1 : 0
      unshipData.remark = formData.value.remark || ''

      const wno = innerNo.value || invoiceData.value.waybill_no
      wnoList = [wno]
      partInd = 0 // 更新完整信息

      // 如果有上传的图片，先上传图片
      if (uploadedFiles.value.length > 0) {
        await uploadReceiptImages(wno, uploadedFiles.value)
        unshipData.receipt = 1
      }
    }

    // 更新卸船滞留信息
    await settleApi.updateVesselDelayInfo({
      unshipData,
      wnoList,
      partInd,
    })

    toast.success('信息保存成功')
    visible.value = false
    emit('confirm')
  }
  catch (error: any) {
    toast.error(error.message || '保存失败')
  }
  finally {
    saving.value = false
  }
}

// 上传回执图片（支持多图）
async function uploadReceiptImages(wno: string, files: File[]) {
  const formData = new FormData()
  files.forEach(file => {
    formData.append('images', file)
  })
  formData.append('inv_no', wno)

  await settleApi.uploadReceiptImg(formData)
}

function handleClose(open: boolean) {
  if (!open && !saving.value) {
    visible.value = false
  }
}

// 生成车辆信息对象
function makeVehInfo(inv: any) {
  const allVehicles: any[] = []
  inv.bills?.forEach((bill: any) => {
    if (bill.vehicles) {
      allVehicles.push(...bill.vehicles)
    }
  })

  const vehObj: any = {}
  allVehicles.forEach((veh) => {
    if (vehObj[veh.inner_waybill_no]) {
      vehObj[veh.inner_waybill_no].num += veh.send_num
      vehObj[veh.inner_waybill_no].weight += veh.send_weight
    }
    else {
      vehObj[veh.inner_waybill_no] = {
        name: veh.veh_name,
        num: veh.send_num,
        weight: veh.send_weight,
        charge_cash: 0,
        charge_oil: 0,
        delay_day: 0,
        unship_date: null,
        receipt: 0,
        remark: '',
      }
    }
  })

  // 合并 inner_settle 信息
  if (inv.inner_settle && inv.inner_settle.length) {
    inv.inner_settle.forEach((innset: any) => {
      if (vehObj[innset.inner_waybill_no]) {
        Object.assign(vehObj[innset.inner_waybill_no], {
          charge_cash: innset.charge_cash || 0,
          charge_oil: innset.charge_oil || 0,
          delay_day: innset.delay_day || 0,
          unship_date: innset.unship_date,
          receipt: innset.receipt || 0,
          remark: innset.remark || '',
        })
      }
    })
  }

  return vehObj
}

defineExpose({ open, openBatch })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="sm:max-w-[700px] max-h-[90vh] flex flex-col">
      <DialogHeader class="shrink-0">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-4 overflow-y-auto flex-1">
        <div class="grid grid-cols-2 gap-4">
          <!-- 预付现金 -->
          <div class="space-y-2">
            <Label>预付现金</Label>
            <div class="flex items-center gap-2">
              <Input v-model="formData.chargeCash" type="number" placeholder="请输入预付现金" step="0.01" class="flex-1" />
              <span class="text-sm bg-muted px-3 py-2 rounded-md border">¥</span>
            </div>
          </div>

          <!-- 预付油卡 -->
          <div class="space-y-2">
            <Label>预付油卡</Label>
            <div class="flex items-center gap-2">
              <Input v-model="formData.chargeOil" type="number" placeholder="请输入预付油卡" step="0.01" class="flex-1" />
              <span class="text-sm bg-muted px-3 py-2 rounded-md border">¥</span>
            </div>
          </div>
        </div>

        <!-- 卸船日期和滞留天数（仅单条记录模式） -->
        <div v-if="!isBatchMode" class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>卸船日期</Label>
            <DatePicker
              v-model="formData.unshipDate"
              placeholder="选择卸船日期"
              :disabled-date="disabledDate"
              @update:model-value="handleUnshipDateChange"
            />
          </div>

          <div class="space-y-2">
            <Label>滞留天数</Label>
            <div class="flex items-center gap-2">
              <Input v-model="formData.delayDay" type="number" placeholder="滞留天数" class="flex-1" @input="handleDelayDayInput" />
              <span class="text-sm bg-muted px-3 py-2 rounded-md border">天</span>
            </div>
            <div class="text-[11px] text-muted-foreground">
              滞留天数 = 卸船日期 - 发货日期 - 7天
            </div>
          </div>
        </div>

        <!-- 回执信息（仅单条记录模式） -->
        <div v-if="!isBatchMode" class="space-y-3">
          <label
            class="flex items-center space-x-3 my-3 h-10 w-full px-3 rounded-md border transition-colors border-transparent hover:bg-muted/50 hover:border-muted-foreground/20 cursor-pointer"
          >
            <input
              id="receipt-checked"
              v-model="formData.receiptChecked"
              type="checkbox"
              class="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary shrink-0 cursor-pointer"
              @change="handleReceiptChange(formData.receiptChecked)"
            >
            <span class="text-sm font-medium">
              收到回执
            </span>
          </label>

          <div class="space-y-2">
            <Label>回执图片（最多{{ MAX_FILES }}张，每张最大5MB）</Label>

            <!-- 上传区域 -->
            <div
              v-if="totalImagesCount < MAX_FILES"
              class="border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-primary hover:bg-muted/50 border-muted-foreground/25 p-4"
              @click="() => fileInputRef?.click()"
              @dragover.prevent
              @drop.prevent="handleDrop"
            >
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                @change="handleFileSelect"
              >

              <UploadIcon class="h-8 w-8 text-primary mb-2" />
              <div class="text-center">
                <p class="text-sm font-medium text-foreground">
                  点击或拖拽上传图片
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  已有 {{ totalImagesCount }} / {{ MAX_FILES }} 张
                </p>
              </div>
            </div>

            <!-- 图片预览网格（已上传 + 新上传） -->
            <div v-if="existingImages.length > 0 || previewImages.length > 0" class="grid grid-cols-3 gap-2">
              <!-- 已上传的图片 -->
              <div
                v-for="existing in existingImages"
                :key="existing.id"
                class="relative aspect-square border rounded-lg overflow-hidden group"
              >
                <img
                  :src="settleApi.getReceiptImageUrl(existing.id)"
                  :alt="existing.original_filename"
                  class="w-full h-full object-cover"
                >

                <!-- 已上传标记 -->
                <div class="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                  已上传
                </div>

                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="destructive"
                    size="sm"
                    @click.stop="handleDeleteExistingImage(existing.id)"
                  >
                    <XIcon class="h-3 w-3 mr-1" />
                    删除
                  </Button>
                </div>
                <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                  {{ existing.original_filename }}
                </div>
              </div>

              <!-- 新上传的图片 -->
              <div
                v-for="(preview, index) in previewImages"
                :key="'new-' + index"
                class="relative aspect-square border rounded-lg overflow-hidden group"
              >
                <img
                  :src="preview.url"
                  :alt="preview.file.name"
                  class="w-full h-full object-cover"
                >

                <!-- 新上传标记 -->
                <div class="absolute top-1 right-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded">
                  新
                </div>

                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    variant="destructive"
                    size="sm"
                    @click.stop="handleRemoveImage(index)"
                  >
                    <XIcon class="h-3 w-3 mr-1" />
                    删除
                  </Button>
                </div>
                <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                  {{ preview.file.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 备注信息 -->
        <div class="space-y-2">
          <Label>备注信息</Label>
          <Input v-model="formData.remark" placeholder="请输入备注信息（可选）" />
        </div>
      </div>

      <DialogFooter class="shrink-0">
        <Button variant="outline" @click="visible = false">
          取消
        </Button>
        <Button :disabled="saving" @click="handleConfirm">
          <span v-if="saving" class="mr-2 animate-spin">⏳</span>
          确定
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
