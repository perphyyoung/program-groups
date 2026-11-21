<script setup lang="ts">
import { useTemplateRef } from "vue";
import type { RowContextRequest } from "../lib/row-menu";
import type { AppEntry } from "../lib/types";
import { useNoteEditor } from "../lib/use-note-editor";
import RowLayout from "./RowLayout.vue";

const props = defineProps<{
  app: AppEntry;
  selected: boolean;
  dragging: boolean;
  groupNames: string[];
  note?: string;
  variant?: "card" | "flat";
}>();

const emit = defineEmits<{
  select: [event: MouseEvent];
  toggle: [];
  run: [];
  contextmenu: [request: RowContextRequest];
  dragstart: [event: DragEvent];
  dragend: [];
  saveNote: [note: string];
}>();

const inputRef = useTemplateRef<HTMLInputElement>("noteInput");

const {
  editing,
  draft,
  startEdit,
  commit,
  cancel,
  onEnter: onNoteEnter,
} = useNoteEditor(
  () => props.note,
  (note) => emit("saveNote", note),
  inputRef,
);

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
  <RowLayout
    data-app-row
    class="select-none"
    :variant="variant"
    :selected="selected"
    :dragging="dragging"
    :title="`${app.name}\n${app.exePath}\n拖动左侧握把可归组；右键查看更多`"
    role="button"
    tabindex="0"
    :aria-label="app.name"
    @click="emit('select', $event)"
    @keydown.enter.self.prevent="emit('toggle')"
    @keydown.space.self.prevent="emit('toggle')"
    @contextmenu="emit('contextmenu', $event)"
  >
    <template #lead>
      <span
        aria-hidden="true"
        :title="`拖动「${app.name}」到分组`"
        draggable="true"
        class="flex cursor-grab items-center rounded p-1 text-slate-600 transition group-hover:text-slate-400 active:cursor-grabbing motion-reduce:transition-none"
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
    </template>

    <template #icon>
      <img
        v-if="app.iconUrl"
        :src="app.iconUrl"
        :alt="app.name"
        class="h-6 w-6 object-contain"
        draggable="false"
      />
      <span v-else class="text-base font-semibold text-slate-300">{{ firstChar(app.name) }}</span>
    </template>

    <template #name>{{ app.name }}</template>

    <template #context>
      <form
        v-if="editing"
        class="flex min-w-0 items-center"
        @submit.prevent="commit"
        @click.stop
        @dblclick.stop
        @keydown.stop
      >
        <input
          ref="noteInput"
          v-model="draft"
          maxlength="10"
          placeholder="备注"
          :aria-label="`备注「${app.name}」`"
          class="h-6 w-full min-w-0 max-w-[8.25rem] rounded border border-indigo-400/50 bg-white/5 px-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400"
          @keydown.enter="onNoteEnter"
          @keydown.esc.stop.prevent="cancel"
          @blur="commit"
        />
        <button type="submit" class="sr-only">保存备注</button>
      </form>
      <div v-else class="flex min-w-0 items-center text-xs">
        <button
          v-if="note"
          type="button"
          class="max-w-[10em] shrink-0 truncate text-left text-slate-400 transition hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 motion-reduce:transition-none"
          :title="note"
          :aria-label="`编辑「${app.name}」的备注`"
          @click.stop="startEdit"
          @dblclick.stop
          @keydown.stop
        >
          {{ note }}
        </button>
        <button
          v-else
          type="button"
          class="pointer-events-none max-w-[10em] shrink-0 truncate text-left text-slate-500 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-slate-300 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 motion-reduce:transition-none"
          :aria-label="`添加「${app.name}」的备注`"
          @click.stop="startEdit"
          @dblclick.stop
          @keydown.stop
        >
          ＋ 备注
        </button>
      </div>
    </template>

    <template #meta>
      <div
        v-if="groupNames.length > 0"
        class="flex max-w-[18rem] items-center justify-end gap-1 overflow-hidden"
      >
        <span
          v-for="name in groupNames.slice(0, 2)"
          :key="name"
          class="max-w-24 truncate rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400"
        >
          {{ name }}
        </span>
        <span
          v-if="groupNames.length > 2"
          class="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-500"
        >
          +{{ groupNames.length - 2 }}
        </span>
      </div>
    </template>

    <template #actions>
      <slot name="actions" />
      <button
        type="button"
        class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/10"
        :aria-label="`启动「${app.name}」`"
        @click.stop="emit('run')"
      >
        启动
      </button>
    </template>
  </RowLayout>
</template>
