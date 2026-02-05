<script setup lang="ts">
// @ts-nocheck
import { ref, watch, computed } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { toast } from 'vue-sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { upsertVesselFixedCost, getVesselFixedCost, type VesselFixedCost } from '@/services/api/vessel-fixed-cost.api'
import { getVehicles } from '@/services/api/data-dict.api'
import AsyncCombobox from '@/components/common/AsyncCombobox.vue'

const props = defineProps<{
  open: boolean
  editData?: VesselFixedCost | null
  isVehicle?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const formSchema = toTypedSchema(z.object({
  month: z.string().min(1, '请选择月份'),
  name: z.string().min(1, '请选择车船名'),
  // Vehicle fields
  fittings: z.number({ coerce: true }).optional(),
  repair: z.number({ coerce: true }).optional(),
  annual_survey: z.number({ coerce: true }).optional(),
  salary: z.number({ coerce: true }).optional(),
  oil: z.number({ coerce: true }).optional(),
  toll: z.number({ coerce: true }).optional(),
  fine: z.number({ coerce: true }).optional(),
  // Vessel fields
  ic: z.number({ coerce: true }).optional(),
  hc: z.number({ coerce: true }).optional(),
  pcc: z.number({ coerce: true }).optional(),
  aux: z.number({ coerce: true }).optional(),
  // Common fields
  other: z.number({ coerce: true }).optional(),
  total: z.number({ coerce: true }).optional(),
}))

const { handleSubmit, resetForm, setValues, values } = useForm({
  validationSchema: formSchema,
  initialValues: {
    month: '',
    name: '',
    fittings: 0,
    repair: 0,
    annual_survey: 0,
    salary: 0,
    oil: 0,
    toll: 0,
    fine: 0,
    ic: 0,
    hc: 0,
    pcc: 0,
    aux: 0,
    other: 0,
    total: 0,
  },
})

const isEdit = ref(false)

// Calculate total automatically
const calculatedTotal = computed(() => {
  const v = values
  let sum = 0
  if (props.isVehicle) {
    sum += (v.fittings || 0) + (v.repair || 0) + (v.annual_survey || 0) + (v.salary || 0) + (v.oil || 0) + (v.toll || 0) + (v.fine || 0)
  } else {
    sum += (v.ic || 0) + (v.hc || 0) + (v.pcc || 0) + (v.aux || 0)
  }
  sum += (v.other || 0)
  return parseFloat(sum.toFixed(2))
})

// Sync calculated total to form
watch(calculatedTotal, (newVal) => {
  setValues({ total: newVal })
})

watch(() => props.open, (newVal) => {
  if (newVal) {
    if (props.editData) {
      isEdit.value = true
      setValues({
        ...props.editData
      })
    } else {
      isEdit.value = false
      resetForm()
      const now = new Date()
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setValues({ 
        month: monthStr, 
        name: props.isVehicle ? '' : 'chuan',
        fittings: 0, repair: 0, annual_survey: 0, salary: 0, oil: 0, toll: 0, fine: 0,
        ic: 0, hc: 0, pcc: 0, aux: 0, other: 0, total: 0
      })
    }
  }
})

// Search vehicles
async function searchVehicles(keyword: string) {
  const res = await getVehicles({ search: keyword, type: '车', limit: 20 })
  if (res.ok) {
    return res.data.map(v => ({ label: v.name, value: v.name }))
  }
  return []
}

// Check if exists
async function checkExists(name: string, month: string) {
  if (isEdit.value && name === props.editData?.name && month === props.editData?.month) return false
  
  try {
    const res = await getVesselFixedCost(name, month)
    return res.ok && !!res.data
  } catch (error) {
    return false
  }
}

const onSubmit = handleSubmit(async (values) => {
  try {
    if (!isEdit.value) {
      const exists = await checkExists(values.name, values.month)
      if (exists) {
        toast.error(`记录已存在！车船名: ${values.name}, 月份: ${values.month}`)
        return
      }
    }

    const payload = {
      ...values,
      vv_type: props.isVehicle ? 'che' : 'chuan',
      total: calculatedTotal.value
    }

    // @ts-ignore
    const res = await upsertVesselFixedCost(payload)
    if (res.ok) {
      toast.success(isEdit.value ? '更新成功' : '添加成功')
      emit('update:open', false)
      emit('success')
    } else {
      toast.error('操作失败')
    }
  } catch (error: any) {
    toast.error('操作失败', { description: error.message })
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[700px]">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? '修改' : '新增' }}车船固定费用</DialogTitle>
        <DialogDescription>
          请输入月份及对应的费用明细。
        </DialogDescription>
      </DialogHeader>
      
      <form @submit="onSubmit" class="space-y-4 py-4">
        <div class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="month">
            <FormItem>
              <FormLabel>月份</FormLabel>
              <FormControl>
                <Input type="month" v-bind="componentField" :disabled="isEdit" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-if="isVehicle" v-slot="{ componentField }" name="name">
            <FormItem>
              <FormLabel>车船名</FormLabel>
              <FormControl>
                <AsyncCombobox
                  :model-value="values.name"
                  @update:model-value="setValues({ name: $event })"
                  :search-fn="searchVehicles"
                  placeholder="选择车船"
                  :disabled="isEdit"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div v-if="isVehicle" class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="fittings">
            <FormItem>
              <FormLabel>配件</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="repair">
            <FormItem>
              <FormLabel>修理费</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="annual_survey">
            <FormItem>
              <FormLabel>年检二维费用</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="salary">
            <FormItem>
              <FormLabel>驾驶员工资</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="oil">
            <FormItem>
              <FormLabel>油费</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="toll">
            <FormItem>
              <FormLabel>过路费</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="fine">
            <FormItem>
              <FormLabel>罚款</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
        </div>

        <div v-else class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="ic">
            <FormItem>
              <FormLabel>保险费用</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="hc">
            <FormItem>
              <FormLabel>吊装</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="pcc">
            <FormItem>
              <FormLabel>港口建设费</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="aux">
            <FormItem>
              <FormLabel>辅料</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="other">
            <FormItem>
              <FormLabel>其它</FormLabel>
              <FormControl><Input type="number" step="0.01" v-bind="componentField" /></FormControl>
            </FormItem>
          </FormField>
          <FormField name="total">
            <FormItem>
              <FormLabel>合计</FormLabel>
              <FormControl>
                <div class="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm text-red-500 font-bold">
                  {{ calculatedTotal.toFixed(2) }}
                </div>
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" @click="$emit('update:open', false)">
            取消
          </Button>
          <Button type="submit">确定</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
