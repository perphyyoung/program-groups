<script setup lang="ts">
import type { AppView } from "../lib/types";

defineProps<{
  app: AppView;
  selected: boolean;
  groupNames: string[];
}>();

const emit = defineEmits<{
  select: [event: MouseEvent];
  open: [];
  dragstart: [event: DragEvent];
}>();

function firstChar(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
</script>

<template>
  <div
    class="group flex cursor-default items-center gap-3 rounded-lg border px-3 py-2 transition select-none"
    :class="
      selected
        ? 'border-indigo-400/80 bg-indigo-500/10'
        : 'border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]'
    "
    :title="`${app.name}\n${app.exePath}\n双击打开`"
    role="button"
    tabindex="0"
    :aria-label="app.name"
    draggable="true"
    @click="emit('select', $event)"
    @dblclick="emit('open')"
    @keydown.enter="emit('open')"
    @dragstart="emit('dragstart', $event)"
  >
    <div
      class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5"
    >
      <img
        v-if="app.iconUrl"
        :src="app.iconUrl"
        :alt="app.name"
        class="h-6 w-6 object-contain"
        draggable="false"
      />
      <span v-else class="text-base font-semibold text-slate-300">{{ firstChar(app.name) }}</span>
    </div>

    <div class="min-w-0 flex-1 truncate text-sm text-slate-200">{{ app.name }}</div>

    <div v-if="groupNames.length > 0" class="flex max-w-[45%] flex-wrap justify-end gap-1">
      <span
        v-for="name in groupNames.slice(0, 2)"
        :key="name"
        class="max-w-24 truncate rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400"
      >
        {{ name }}
      </span>
      <span
        v-if="groupNames.length > 2"
        class="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500"
      >
        +{{ groupNames.length - 2 }}
      </span>
    </div>
  </div>
</template>
