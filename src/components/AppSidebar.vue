<script setup lang="ts">
import type { AppScope, GroupEntry } from "../lib/types";

defineProps<{
  groups: GroupEntry[];
  totalCount: number;
  ungroupedCount: number;
  ignoredCount: number;
  active: AppScope;
  scanning: boolean;
}>();

const emit = defineEmits<{
  select: [scope: AppScope];
  create: [];
  rename: [group: GroupEntry];
  delete: [group: GroupEntry];
  dropApps: [groupId: string, appIds: string[]];
}>();

function isActive(active: AppScope, groupId: string): boolean {
  return active.kind === "group" && active.groupId === groupId;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, groupId: string): void {
  event.preventDefault();
  const raw = event.dataTransfer?.getData("application/x-pg-apps");
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const ids = parsed.filter((item): item is string => typeof item === "string");
    if (ids.length > 0) emit("dropApps", groupId, ids);
  } catch (error) {
    void window.api.log(
      "warn",
      `拖拽数据解析失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
</script>

<template>
  <aside class="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#0e1219]">
    <div class="px-4 pb-3 pt-5">
      <div class="text-sm font-semibold text-slate-100">Program Groups</div>
      <div class="mt-1 text-xs text-slate-500">已安装软件分组</div>
    </div>

    <nav class="flex-1 overflow-y-auto px-2">
      <button
        aria-label="全部应用"
        class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
        :class="
          active.kind === 'all'
            ? 'bg-indigo-500/15 text-indigo-200'
            : 'text-slate-300 hover:bg-white/5'
        "
        @click="emit('select', { kind: 'all' })"
      >
        <span>全部应用</span>
        <span class="text-xs text-slate-500">{{ totalCount }}</span>
      </button>

      <button
        aria-label="未分组"
        class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
        :class="
          active.kind === 'ungrouped'
            ? 'bg-indigo-500/15 text-indigo-200'
            : 'text-slate-300 hover:bg-white/5'
        "
        @click="emit('select', { kind: 'ungrouped' })"
      >
        <span>未分组</span>
        <span class="text-xs text-slate-500">{{ ungroupedCount }}</span>
      </button>

      <button
        aria-label="已忽略"
        class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
        :class="
          active.kind === 'ignored'
            ? 'bg-indigo-500/15 text-indigo-200'
            : 'text-slate-300 hover:bg-white/5'
        "
        @click="emit('select', { kind: 'ignored' })"
      >
        <span>已忽略</span>
        <span class="text-xs text-slate-500">{{ ignoredCount }}</span>
      </button>

      <div class="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-slate-600">分组</div>

      <div
        v-for="group in groups"
        :key="group.id"
        class="group relative mt-1"
        @dragover="onDragOver"
        @drop="onDrop($event, group.id)"
      >
        <button
          :aria-label="group.name"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 pr-14 text-left text-sm transition"
          :class="
            isActive(active, group.id)
              ? 'bg-indigo-500/15 text-indigo-200'
              : 'text-slate-300 hover:bg-white/5'
          "
          @click="emit('select', { kind: 'group', groupId: group.id })"
        >
          <span class="truncate">{{ group.name }}</span>
          <span class="text-xs text-slate-500">{{ group.count }}</span>
        </button>
        <div class="absolute right-2 top-1.5 hidden items-center gap-1 group-hover:flex">
          <button
            class="rounded px-1 text-xs text-slate-500 hover:text-slate-200"
            :aria-label="`重命名分组 ${group.name}`"
            @click.stop="emit('rename', group)"
          >
            改
          </button>
          <button
            class="rounded px-1 text-xs text-slate-500 hover:text-rose-300"
            :aria-label="`删除分组 ${group.name}`"
            @click.stop="emit('delete', group)"
          >
            删
          </button>
        </div>
      </div>

      <button
        class="mt-3 w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-left text-sm text-slate-400 transition hover:border-indigo-400/50 hover:text-indigo-200 disabled:opacity-40"
        :disabled="scanning"
        @click="emit('create')"
      >
        + 新建分组
      </button>
    </nav>
  </aside>
</template>
