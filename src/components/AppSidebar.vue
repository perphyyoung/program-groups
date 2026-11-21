<script setup lang="ts">
import { ref, useTemplateRef, watch } from "vue";
import type { RowContextRequest } from "../lib/row-menu";
import type { AppScope, GroupEntry } from "../lib/types";

const props = defineProps<{
  groups: GroupEntry[];
  totalCount: number;
  ungroupedCount: number;
  ignoredCount: number;
  active: AppScope;
  scanning: boolean;
  dragging: boolean;
  menuOpenGroupId?: string | null;
}>();

const emit = defineEmits<{
  select: [scope: AppScope];
  create: [];
  menu: [group: GroupEntry, request: RowContextRequest];
  dropApps: [groupId: string, appIds: string[]];
}>();

const overGroupId = ref<string | null>(null);
const ungroupedButton = useTemplateRef<HTMLButtonElement>("ungroupedButton");

function focusUngrouped(): void {
  ungroupedButton.value?.focus({ preventScroll: true });
}

defineExpose({ focusUngrouped });

watch(
  () => props.dragging,
  (dragging) => {
    if (!dragging) overGroupId.value = null;
  },
);

function isActive(active: AppScope, groupId: string): boolean {
  return active.kind === "group" && active.groupId === groupId;
}

function groupActionClass(groupId: string): string {
  if (props.menuOpenGroupId === groupId) return "pointer-events-auto opacity-100";
  return "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";
}

function onGroupAction(group: GroupEntry, event: MouseEvent): void {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) return;
  const rect = button.getBoundingClientRect();
  button.focus({ preventScroll: true });
  emit("menu", group, { x: rect.left, y: rect.bottom + 4, anchor: button });
}

function onGroupContextMenu(group: GroupEntry, event: MouseEvent): void {
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;
  const row = container.querySelector<HTMLButtonElement>("[data-group-row]");
  if (!row) return;
  row.focus({ preventScroll: true });
  let x = event.clientX;
  let y = event.clientY;
  if (x === 0 && y === 0) {
    const rect = row.getBoundingClientRect();
    x = rect.left + 8;
    y = rect.top + Math.min(rect.height, 28);
  }
  emit("menu", group, { x, y, anchor: row });
}

function onDragEnter(event: DragEvent, groupId: string): void {
  if (!event.dataTransfer?.types.includes("application/x-pg-apps")) return;
  overGroupId.value = groupId;
}

function onDragLeave(event: DragEvent, groupId: string): void {
  const next = event.relatedTarget;
  const current = event.currentTarget;
  if (next instanceof Node && current instanceof Node && current.contains(next)) return;
  if (overGroupId.value === groupId) overGroupId.value = null;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, groupId: string): void {
  event.preventDefault();
  overGroupId.value = null;
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
        ref="ungroupedButton"
        aria-label="未分组"
        class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
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
        @dragenter="onDragEnter($event, group.id)"
        @dragleave="onDragLeave($event, group.id)"
        @dragover="onDragOver"
        @drop="onDrop($event, group.id)"
        @contextmenu.prevent.stop="onGroupContextMenu(group, $event)"
      >
        <button
          data-group-row
          :aria-label="group.name"
          :title="group.name"
          class="flex w-full items-center justify-between rounded-lg py-2 pl-3 pr-10 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 motion-reduce:transition-none"
          :class="
            overGroupId === group.id
              ? 'bg-indigo-500/20 text-indigo-100 outline-2 outline-indigo-400'
              : isActive(active, group.id)
                ? 'bg-indigo-500/15 text-indigo-200'
                : 'text-slate-300 hover:bg-white/5'
          "
          @click="emit('select', { kind: 'group', groupId: group.id })"
        >
          <span class="min-w-0 flex-1 truncate">{{ group.name }}</span>
          <span class="shrink-0 pl-2 text-xs text-slate-500">{{ group.count }}</span>
        </button>
        <button
          v-if="!dragging"
          type="button"
          class="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-base leading-none text-slate-500 transition hover:bg-white/10 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 motion-reduce:transition-none"
          :class="groupActionClass(group.id)"
          :aria-label="`分组操作「${group.name}」`"
          aria-haspopup="menu"
          :aria-expanded="menuOpenGroupId === group.id"
          @click.stop="onGroupAction(group, $event)"
        >
          <span aria-hidden="true" class="-translate-y-px">⋯</span>
        </button>
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
