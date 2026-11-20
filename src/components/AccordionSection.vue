<script setup lang="ts">
defineProps<{
  title: string;
  count: number;
  open: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <section class="rounded-xl border border-white/10">
    <!-- 吸顶组头：展开后向下滚动时仍可随时收起 -->
    <button
      type="button"
      class="sticky top-0 z-10 flex w-full items-center gap-2 rounded-t-xl bg-[#0b0d12] px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-[#12151d]"
      :aria-label="title"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <span class="w-3 text-xs text-slate-500" aria-hidden="true">{{ open ? "▾" : "▸" }}</span>
      <span class="flex-1">{{ title }}</span>
      <span class="text-xs text-slate-500">{{ count }}</span>
    </button>

    <div v-show="open">
      <slot />
    </div>
  </section>
</template>
