<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { Ship, Truck } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as z from 'zod'

import { FormField } from '@/components/ui/form'
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '@/components/ui/tags-input'
import { useModal } from '@/composables/use-modal'
import { addVehicle, updateVehicle } from '@/services/api/data-dict.api'

function parseBoss(val: string | undefined): string[] {
  if (!val) return []
  return val
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const props = defineProps<{
  item?: any
}>()

const emit = defineEmits(['close', 'refresh'])

const { Modal } = useModal()

const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, '请输入车船号'),
    veh_type: z.enum(['车', '船']),
    veh_category: z.string().optional(),
    boss: z.array(z.string()).default([]),
    contact_name: z.string().optional(),
    phone: z.string().optional(),
  }),
)

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: props.item?.name || '',
    veh_type: props.item?.veh_type || '车',
    veh_category: props.item?.veh_category || '外挂',
    boss: parseBoss(props.item?.boss),
    contact_name: props.item?.contact_name || '',
    phone: props.item?.phone || '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  const payload = { ...values, boss: values.boss.join(',') }
  try {
    if (props.item) {
      await updateVehicle(payload)
      toast.success('更新成功')
    } else {
      await addVehicle(payload)
      toast.success('添加成功')
    }
    emit('refresh')
    emit('close')
  } catch (e: any) {
    toast.error('操作失败', { description: e.message || '未知错误' })
  }
})
</script>

<template>
  <component :is="Modal.Header">
    <component :is="Modal.Title">
      {{ item ? '修改车船号' : '新增车船号' }}
    </component>
    <component :is="Modal.Description">
      {{ item ? '修改车船基本信息' : '填写车船基本信息以创建新记录' }}
    </component>
  </component>

  <form class="space-y-6 py-4" @submit="onSubmit">
    <!-- 基本信息 -->
    <div class="space-y-4">
      <FormField v-slot="{ componentField }" name="name">
        <UiFormItem>
          <UiFormLabel>车船号</UiFormLabel>
          <UiFormControl>
            <UiInput v-bind="componentField" :disabled="!!item" placeholder="请输入车船号" />
          </UiFormControl>
          <UiFormMessage />
        </UiFormItem>
      </FormField>

      <div class="grid grid-cols-2 gap-4">
        <FormField v-slot="{ componentField }" name="veh_type">
          <UiFormItem>
            <UiFormLabel>类型</UiFormLabel>
            <UiFormControl>
              <UiRadioGroup v-bind="componentField" class="flex gap-3 pt-1">
                <label
                  class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <UiRadioGroupItem value="车" class="sr-only" />
                  <Truck class="size-4 text-muted-foreground" />
                  <span class="text-sm font-medium">车</span>
                </label>
                <label
                  class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <UiRadioGroupItem value="船" class="sr-only" />
                  <Ship class="size-4 text-muted-foreground" />
                  <span class="text-sm font-medium">船</span>
                </label>
              </UiRadioGroup>
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="veh_category">
          <UiFormItem>
            <UiFormLabel>分类</UiFormLabel>
            <UiFormControl>
              <UiRadioGroup v-bind="componentField" class="flex gap-3 pt-1">
                <label
                  class="flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <UiRadioGroupItem value="自有" class="sr-only" />
                  <span class="text-sm font-medium">自有</span>
                </label>
                <label
                  class="flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <UiRadioGroupItem value="外挂" class="sr-only" />
                  <span class="text-sm font-medium">外挂</span>
                </label>
              </UiRadioGroup>
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </FormField>
      </div>
    </div>

    <UiSeparator />

    <!-- 联系信息 -->
    <div class="space-y-4">
      <FormField v-slot="{ value, setValue }" name="boss">
        <UiFormItem>
          <UiFormLabel>承运单位</UiFormLabel>
          <UiFormControl>
            <TagsInput :model-value="value" class="min-h-10" @update:model-value="setValue">
              <TagsInputItem v-for="tag in value" :key="tag" :value="tag">
                <TagsInputItemText />
                <TagsInputItemDelete />
              </TagsInputItem>
              <TagsInputInput placeholder="输入后回车添加" />
            </TagsInput>
          </UiFormControl>
          <UiFormMessage />
        </UiFormItem>
      </FormField>

      <div class="grid grid-cols-2 gap-8">
        <FormField v-slot="{ componentField }" name="contact_name">
          <UiFormItem>
            <UiFormLabel>联系人</UiFormLabel>
            <UiFormControl>
              <UiInput v-bind="componentField" placeholder="请输入联系人" />
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="phone">
          <UiFormItem>
            <UiFormLabel>电话</UiFormLabel>
            <UiFormControl>
              <UiInput v-bind="componentField" placeholder="请输入电话号码" />
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </FormField>
      </div>
    </div>

    <component :is="Modal.Footer" class="px-0">
      <UiButton type="button" variant="outline" @click="$emit('close')"> 取消 </UiButton>
      <UiButton type="submit" :disabled="isSubmitting"> 保存 </UiButton>
    </component>
  </form>
</template>
