<script setup lang="ts">
import type { AppEntry } from "../lib/types";
import RowLayout from "./RowLayout.vue";
import SourceBadge from "./SourceBadge.vue";

const props = defineProps<{
  app: AppEntry;
  selected: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  remove: [];
}>();

function firstChar(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
</script>

<template>
  <RowLayout variant="flat" :selected="selected">
    <template #lead>
      <input
        type="checkbox"
        class="size-4 accent-indigo-500"
        :checked="selected"
        :aria-label="`选择「${app.name}」`"
        @change="emit('toggle')"
      />
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

    <template #name>
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="truncate" :title="app.exePath || app.launchPath">{{ app.name }}</span>
        <SourceBadge :source="app.source" />
      </span>
    </template>

    <template #context>
      <span class="block truncate text-xs text-slate-500" :title="app.exePath || app.launchPath">
        {{ app.exePath || app.launchPath }}
      </span>
    </template>

    <template #actions>
      <button
        type="button"
        class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-400 transition hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
        :aria-label="`删除「${app.name}」`"
        @click.stop="emit('remove')"
      >
        删除
      </button>
    </template>
  </RowLayout>
</template>
