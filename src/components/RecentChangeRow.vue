<script setup lang="ts">
import { computed } from "vue";
import type { RowContextRequest } from "../lib/row-menu";
import { formatChangeDate, type ChangeKind } from "../lib/recent-changes";
import type { AppEntry } from "../lib/types";
import RowLayout from "./RowLayout.vue";
import SourceBadge from "./SourceBadge.vue";

const props = defineProps<{
  app: AppEntry;
  kind: ChangeKind;
}>();

const emit = defineEmits<{
  run: [];
  remove: [];
  contextmenu: [request: RowContextRequest];
}>();

function firstChar(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

const changedAt = computed(() =>
  props.kind === "added" ? props.app.firstSeenAt : (props.app.statusChangedAt ?? ""),
);

const dateLabel = computed(() => formatChangeDate(changedAt.value));
const pathText = computed(() => props.app.exePath || props.app.launchPath);
</script>

<template>
  <RowLayout
    variant="card"
    :title="`${app.name}\n${pathText}\n变化日期：${changedAt}`"
    :aria-label="app.name"
    @contextmenu="kind !== 'missing' && emit('contextmenu', $event)"
  >
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
        <span class="truncate" :title="pathText">{{ app.name }}</span>
        <SourceBadge :source="app.source" />
      </span>
    </template>

    <template #context>
      <span class="block truncate text-xs text-slate-500" :title="pathText">
        {{ pathText }}
      </span>
    </template>

    <template #meta>
      <span class="shrink-0 text-xs tabular-nums text-slate-500" :title="changedAt">
        {{ dateLabel }}
      </span>
    </template>

    <template #actions>
      <button
        v-if="kind === 'missing'"
        type="button"
        class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-400 transition hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
        :aria-label="`删除「${app.name}」`"
        @click.stop="emit('remove')"
      >
        删除
      </button>
      <button
        v-else
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
