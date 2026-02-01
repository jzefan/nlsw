<script setup lang="ts">
import { Check, ChevronsUpDown } from 'lucide-vue-next'
import { ref } from 'vue'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  options: string[]
  placeholder?: string
  class?: string
}>()

const emit = defineEmits(['update:modelValue'])

const open = ref(false)

function handleSelect(currentValue: string) {
  // If clicking the selected one, usually we might want to keep it or deselect.
  // Element plus 'clearable' allows clearing.
  // Here we can deselect if clicked again, or just select.
  // Let's implement toggle behavior for now to allow "clearing" by re-selecting,
  // or we can add a clear button. Toggle is simpler.
  emit('update:modelValue', currentValue === props.modelValue ? '' : currentValue)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :aria-expanded="open"
        :class="cn('w-full justify-between font-normal px-3', !modelValue && 'text-muted-foreground', props.class)"
      >
        <span class="truncate">{{ modelValue || placeholder || "请选择..." }}</span>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[--reka-popover-trigger-width] p-0">
      <Command>
        <CommandInput placeholder="搜索..." />
        <CommandEmpty>未找到.</CommandEmpty>
        <CommandList>
          <CommandGroup>
            <CommandItem
              v-for="option in options"
              :key="option"
              :value="option"
              @select="handleSelect(option)"
            >
              <Check
                :class="cn(
                  'mr-2 h-4 w-4',
                  modelValue === option ? 'opacity-100' : 'opacity-0',
                )"
              />
              {{ option }}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
