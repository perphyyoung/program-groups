<script setup lang="ts">
defineProps<{
  message: string;
  kind: "info" | "error";
}>();
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="fixed bottom-6 left-1/2 z-40 w-max max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-2xl"
    :class="
      kind === 'error'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
    "
  >
    {{ message }}
  </div>
</template>
