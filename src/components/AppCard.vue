<script setup lang="ts">
import type { AppEntry } from "../lib/types";

defineProps<{
  app: AppEntry;
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
    class="group relative flex cursor-default flex-col items-center gap-2 rounded-xl border p-3 transition select-none"
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
      class="absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none"
      :class="
        selected
          ? 'border-indigo-300 bg-indigo-500 text-white opacity-100'
          : 'border-white/20 text-transparent opacity-0 group-hover:opacity-100'
      "
      aria-hidden="true"
    >
      ✓
    </div>

    <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white/5">
      <img
        v-if="app.iconUrl"
        :src="app.iconUrl"
        :alt="app.name"
        class="h-9 w-9 object-contain"
        draggable="false"
      />
      <span v-else class="text-lg font-semibold text-slate-300">{{ firstChar(app.name) }}</span>
    </div>

    <div class="line-clamp-2 min-h-8 w-full text-center text-xs leading-4 text-slate-200">
      {{ app.name }}
    </div>

    <div v-if="groupNames.length > 0" class="flex max-w-full flex-wrap justify-center gap-1">
      <span
        v-for="name in groupNames.slice(0, 2)"
        :key="name"
        class="max-w-20 truncate rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400"
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
