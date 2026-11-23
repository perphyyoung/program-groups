<script setup lang="ts">
import CountBadge from "./CountBadge.vue";

defineProps<{
  label: string;
  count: number;
  active?: boolean;
}>();

const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    :aria-label="`${label} ${count.toLocaleString('zh-CN')}`"
    class="inline-flex h-7 items-center gap-2 rounded-md border px-2 whitespace-nowrap text-xs transition"
    :class="
      active ? 'border-indigo-400/60 bg-indigo-500/15' : 'border-white/10 hover:border-slate-500'
    "
    @click="emit('select')"
  >
    <span :class="active ? 'text-indigo-100' : 'text-slate-400'">{{ label }}</span>
    <CountBadge :count="count" :active="active" />
  </button>
</template>
