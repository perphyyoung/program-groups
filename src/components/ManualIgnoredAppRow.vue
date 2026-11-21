<script setup lang="ts">
import { useTemplateRef } from "vue";
import type { AppEntry } from "../lib/types";
import { useNoteEditor } from "../lib/use-note-editor";
import RowLayout from "./RowLayout.vue";

const props = defineProps<{
  app: AppEntry;
  note?: string;
}>();

const emit = defineEmits<{
  saveNote: [note: string];
  restore: [];
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
</script>

<template>
  <RowLayout variant="flat" :title="app.exePath">
    <template #icon>
      <img v-if="app.iconUrl" :src="app.iconUrl" :alt="app.name" class="h-6 w-6 object-contain" />
      <span v-else class="text-xs font-semibold text-slate-300">{{ firstChar(app.name) }}</span>
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
      <span
        class="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400"
      >
        手动忽略
      </span>
    </template>

    <template #actions>
      <button
        type="button"
        class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/10"
        :aria-label="`取消忽略「${app.name}」`"
        @click="emit('restore')"
      >
        取消忽略
      </button>
    </template>
  </RowLayout>
</template>
