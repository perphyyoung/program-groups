<script setup lang="ts">
defineProps<{
  count: number;
  active?: boolean;
}>();
</script>

<template>
  <span
    class="min-w-7 rounded-md px-1.5 py-1 text-center text-xs font-semibold tabular-nums"
    :class="active ? 'bg-indigo-400/25 text-white' : 'bg-white/10 text-slate-100'"
  >
    {{ count.toLocaleString("zh-CN") }}
  </span>
</template>
