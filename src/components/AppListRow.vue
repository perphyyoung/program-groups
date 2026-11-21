<script setup lang="ts">
import type { AppEntry } from "../lib/types";

defineProps<{
  app: AppEntry;
  selected: boolean;
  dragging: boolean;
  groupNames: string[];
}>();

const emit = defineEmits<{
  select: [event: MouseEvent];
  open: [];
  dragstart: [event: DragEvent];
  dragend: [];
}>();

function firstChar(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function onHandleDragStart(event: DragEvent): void {
  const handle = event.currentTarget;
  const row = handle instanceof Element ? handle.closest("[data-app-row]") : null;
  if (row instanceof HTMLElement) {
    const rect = row.getBoundingClientRect();
    event.dataTransfer?.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
  }
  emit("dragstart", event);
}
</script>

<template>
  <div
    data-app-row
    class="group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 motion-reduce:transition-none"
    :class="{
      'border-indigo-400/40 bg-indigo-500/5 opacity-40': dragging,
      'border-indigo-400/80 bg-indigo-500/10': !dragging && selected,
      'border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]':
        !dragging && !selected,
    }"
    :title="`${app.name}\n${app.exePath}\n双击打开，拖动左侧握把可归组`"
    role="button"
    tabindex="0"
    :aria-label="app.name"
    @click="emit('select', $event)"
    @dblclick="emit('open')"
    @keydown.enter="emit('open')"
  >
    <span
      aria-hidden="true"
      :title="`拖动「${app.name}」到分组`"
      draggable="true"
      class="-ml-1 flex shrink-0 cursor-grab items-center rounded p-1 text-slate-600 transition group-hover:text-slate-400 active:cursor-grabbing motion-reduce:transition-none"
      @dragstart="onHandleDragStart"
      @dragend="emit('dragend')"
    >
      <svg viewBox="0 0 8 14" class="h-3.5 w-2 fill-current">
        <circle cx="2" cy="2" r="1.1" />
        <circle cx="6" cy="2" r="1.1" />
        <circle cx="2" cy="7" r="1.1" />
        <circle cx="6" cy="7" r="1.1" />
        <circle cx="2" cy="12" r="1.1" />
        <circle cx="6" cy="12" r="1.1" />
      </svg>
    </span>
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

    <slot name="actions" />
  </div>
</template>
