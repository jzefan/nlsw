<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import * as z from 'zod'

import { FormField } from '@/components/ui/form'
import { useModal } from '@/composables/use-modal'
import { addVehicle, updateVehicle } from '@/services/api/data-dict.api'

const props = defineProps<{
  item?: any
}>()

const emit = defineEmits(['close', 'refresh'])

const { Modal } = useModal()

const formSchema = toTypedSchema(z.object({
  name: z.string().min(1, 'Name is required'),
  veh_type: z.enum(['车', '船']),
  veh_category: z.string().optional(),
  boss: z.string().optional(),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
}))

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: props.item?.name || '',
    veh_type: props.item?.veh_type || '车',
    veh_category: props.item?.veh_category || '',
    boss: props.item?.boss || '',
    contact_name: props.item?.contact_name || '',
    phone: props.item?.phone || '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  try {
    if (props.item) {
      await updateVehicle(values)
      toast.success('更新成功')
    }
    else {
      await addVehicle(values)
      toast.success('添加成功')
    }
    emit('refresh')
    emit('close')
  }
  catch (e: any) {
    toast.error('操作失败', { description: e.message || '未知错误' })
  }
})
</script>

<template>
  <component :is="Modal.Header">
    <component :is="Modal.Title">
      {{ item ? '修改车船号' : '新增车船号' }}
    </component>
  </component>

  <form class="space-y-4 py-4" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <UiFormItem>
        <UiFormLabel>名称</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" :disabled="!!item" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="veh_type">
      <UiFormItem>
        <UiFormLabel>类型</UiFormLabel>
        <UiFormControl>
          <UiRadioGroup v-bind="componentField" class="flex gap-4">
            <UiFormItem class="flex items-center space-y-0 gap-2">
              <UiFormControl>
                <UiRadioGroupItem value="车" />
              </UiFormControl>
              <UiFormLabel class="font-normal">
                车
              </UiFormLabel>
            </UiFormItem>
            <UiFormItem class="flex items-center space-y-0 gap-2">
              <UiFormControl>
                <UiRadioGroupItem value="船" />
              </UiFormControl>
              <UiFormLabel class="font-normal">
                船
              </UiFormLabel>
            </UiFormItem>
          </UiRadioGroup>
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="veh_category">
      <UiFormItem>
        <UiFormLabel>分类</UiFormLabel>
        <UiSelect v-bind="componentField">
          <UiFormControl>
            <UiSelectTrigger>
              <UiSelectValue placeholder="请选择分类" />
            </UiSelectTrigger>
          </UiFormControl>
          <UiSelectContent>
            <UiSelectItem value="自有">
              自有
            </UiSelectItem>
            <UiSelectItem value="外挂">
              外挂
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="boss">
      <UiFormItem>
        <UiFormLabel>老板</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="contact_name">
      <UiFormItem>
        <UiFormLabel>联系人</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="phone">
      <UiFormItem>
        <UiFormLabel>电话</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <div class="flex justify-end gap-2">
      <UiButton type="button" variant="outline" @click="$emit('close')">
        取消
      </UiButton>
      <UiButton type="submit" :disabled="isSubmitting">
        保存
      </UiButton>
    </div>
  </form>
</template>
