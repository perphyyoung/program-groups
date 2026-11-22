<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { isGroupSortMode, moveGroupOrder, toStoredOrder } from "../lib/group-order";
import type { RowContextRequest } from "../lib/row-menu";
import type { AppScope, GroupEntry, GroupSortDirection, GroupSortMode } from "../lib/types";

const props = defineProps<{
  groups: GroupEntry[];
  sortMode: GroupSortMode;
  sortDirection: GroupSortDirection;
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
  sortModeChange: [mode: GroupSortMode];
  sortDirectionChange: [direction: GroupSortDirection];
  reorder: [ids: string[]];
  dropApps: [groupId: string, appIds: string[]];
}>();

const overGroupId = ref<string | null>(null);
const ungroupedButton = useTemplateRef<HTMLButtonElement>("ungroupedButton");
const navRef = useTemplateRef<HTMLElement>("navRef");
const sortable = computed(() => props.sortMode === "manual" && props.groups.length > 1);

const pendingDrag = ref<{ id: string; pointerId: number; startY: number } | null>(null);
const sortingGroupId = ref<string | null>(null);
const dropIndex = ref<number | null>(null);
const marker = ref<{ left: number; top: number; width: number } | null>(null);
const sortAnnouncement = ref("");
let autoScrollFrame: number | null = null;
let autoScrollEdge = 0;
let lastPointerY = 0;
let announceTimer: ReturnType<typeof setTimeout> | null = null;

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

function onSortModeChange(event: Event): void {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  const mode = select.value;
  if (isGroupSortMode(mode)) emit("sortModeChange", mode);
}

function announce(message: string): void {
  if (announceTimer) clearTimeout(announceTimer);
  sortAnnouncement.value = "";
  announceTimer = setTimeout(() => {
    sortAnnouncement.value = message;
  }, 50);
}

function announceMove(name: string, index: number): void {
  announce(`「${name}」已移到第 ${index + 1} 位`);
}

function onDirectionClick(): void {
  const next = props.sortDirection === "asc" ? "desc" : "asc";
  emit("sortDirectionChange", next);
  announce(next === "desc" ? "已切换为倒序" : "已切换为正序");
}

async function focusGrip(id: string): Promise<void> {
  await nextTick();
  const grip = navRef.value?.querySelector<HTMLElement>(`[data-group-grip="${CSS.escape(id)}"]`);
  grip?.scrollIntoView({ block: "nearest" });
  grip?.focus({ preventScroll: true });
}

function updateDropSpot(pointerY: number): void {
  const nav = navRef.value;
  const id = sortingGroupId.value;
  if (!nav || !id) return;
  const rows = Array.from(nav.querySelectorAll<HTMLElement>("[data-group-row-container]"));
  if (rows.length === 0) return;
  const sourceIndex = props.groups.findIndex((group) => group.id === id);
  if (sourceIndex < 0) return;

  let insertIndex = rows.length;
  for (let i = 0; i < rows.length; i += 1) {
    const rect = rows[i].getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex === sourceIndex || insertIndex === sourceIndex + 1) {
    dropIndex.value = null;
    marker.value = null;
    return;
  }

  const firstRect = rows[0].getBoundingClientRect();
  const lastRect = rows[rows.length - 1].getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();
  const markerTop =
    insertIndex < rows.length
      ? rows[insertIndex].getBoundingClientRect().top - 2
      : lastRect.bottom + 2;

  dropIndex.value = insertIndex;
  marker.value = {
    left: firstRect.left,
    top: Math.max(navRect.top, Math.min(markerTop, navRect.bottom - 2)),
    width: firstRect.width,
  };
}

function stopAutoScroll(): void {
  if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = null;
  autoScrollEdge = 0;
}

function updateAutoScroll(pointerY: number): void {
  const nav = navRef.value;
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  const edge = 32;
  const overTop = Math.max(0, rect.top + edge - pointerY);
  const overBottom = Math.max(0, pointerY - (rect.bottom - edge));
  autoScrollEdge = overBottom > 0 ? overBottom : -overTop;
  if (autoScrollEdge === 0) {
    stopAutoScroll();
    return;
  }
  if (autoScrollFrame !== null) return;

  let last = performance.now();
  const step = (now: number): void => {
    const current = navRef.value;
    if (!current || !sortingGroupId.value || autoScrollEdge === 0) {
      autoScrollFrame = null;
      return;
    }
    const delta = Math.min(32, now - last) / 16.67;
    last = now;
    const strength = Math.min(12, Math.max(2, Math.abs(autoScrollEdge) / 4));
    current.scrollTop += Math.sign(autoScrollEdge) * strength * delta;
    updateDropSpot(lastPointerY);
    autoScrollFrame = requestAnimationFrame(step);
  };
  autoScrollFrame = requestAnimationFrame(step);
}

function cleanupDrag(): void {
  pendingDrag.value = null;
  sortingGroupId.value = null;
  dropIndex.value = null;
  marker.value = null;
  stopAutoScroll();
}

function cancelDrag(): void {
  cleanupDrag();
}

function onGripPointerDown(group: GroupEntry, event: PointerEvent): void {
  if (!sortable.value || event.button !== 0) return;
  if (pendingDrag.value || sortingGroupId.value) return;
  const grip = event.currentTarget;
  if (!(grip instanceof HTMLElement)) return;
  event.preventDefault();
  grip.focus({ preventScroll: true });
  grip.setPointerCapture(event.pointerId);
  pendingDrag.value = { id: group.id, pointerId: event.pointerId, startY: event.clientY };
}

function onGripPointerMove(event: PointerEvent): void {
  const pending = pendingDrag.value;
  if (!pending || event.pointerId !== pending.pointerId) return;
  if (!sortingGroupId.value) {
    if (Math.abs(event.clientY - pending.startY) < 4) return;
    sortingGroupId.value = pending.id;
  }
  event.preventDefault();
  lastPointerY = event.clientY;
  updateDropSpot(event.clientY);
  updateAutoScroll(event.clientY);
}

function onGripPointerUp(event: PointerEvent): void {
  const pending = pendingDrag.value;
  if (!pending || event.pointerId !== pending.pointerId) return;
  const id = sortingGroupId.value;
  const index = dropIndex.value;
  cleanupDrag();
  if (!id || index === null) return;

  const ids = props.groups.map((group) => group.id);
  const next = moveGroupOrder(ids, id, index);
  if (next.join("\0") === ids.join("\0")) return;
  const group = props.groups.find((item) => item.id === id);
  emit("reorder", toStoredOrder(next, props.sortMode, props.sortDirection));
  announceMove(group?.name ?? "", next.indexOf(id));
  void focusGrip(id);
}

function onGripKeydown(group: GroupEntry, event: KeyboardEvent): void {
  if (!sortable.value || !event.altKey) return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const index = props.groups.findIndex((item) => item.id === group.id);
  if (index < 0) return;
  if (event.key === "ArrowUp" && index === 0) return;
  if (event.key === "ArrowDown" && index === props.groups.length - 1) return;

  event.preventDefault();
  event.stopPropagation();
  const ids = props.groups.map((item) => item.id);
  const insertIndex = event.key === "ArrowUp" ? index - 1 : index + 2;
  const next = moveGroupOrder(ids, group.id, insertIndex);
  if (next.join("\0") === ids.join("\0")) return;
  emit("reorder", toStoredOrder(next, props.sortMode, props.sortDirection));
  announceMove(group.name, next.indexOf(group.id));
  void focusGrip(group.id);
}

function onNavScroll(): void {
  if (sortingGroupId.value) updateDropSpot(lastPointerY);
}

watch(
  () => [props.sortMode, props.sortDirection] as const,
  () => cleanupDrag(),
);

onBeforeUnmount(() => {
  cleanupDrag();
  if (announceTimer) clearTimeout(announceTimer);
});

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

    <nav ref="navRef" class="flex-1 overflow-y-auto px-2" @scroll="onNavScroll">
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

      <button
        aria-label="设置"
        class="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
        :class="
          active.kind === 'settings'
            ? 'bg-indigo-500/15 text-indigo-200'
            : 'text-slate-300 hover:bg-white/5'
        "
        @click="emit('select', { kind: 'settings' })"
      >
        <span>设置</span>
      </button>

      <div class="mt-4 flex items-center justify-between gap-1 px-3">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-600">分组</span>
        <div class="flex items-center gap-1">
          <select
            v-if="groups.length > 0"
            :value="sortMode"
            aria-label="分组排序方式"
            class="h-6 w-[5.5rem] rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-slate-400 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
            @change="onSortModeChange"
          >
            <!-- 用 component 渲染 button：HTML 规范不允许 button 直接作为 select 子元素 -->
            <component :is="'button'" type="button">
              <selectedcontent></selectedcontent>
              <span aria-hidden="true" class="text-[10px] leading-none text-slate-500">▾</span>
            </component>
            <option value="manual">手动排序</option>
            <option value="name">名称排序</option>
            <option value="created">创建顺序</option>
          </select>
          <button
            v-if="groups.length > 1"
            type="button"
            data-testid="group-sort-direction"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-slate-400 transition hover:border-white/20 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 motion-reduce:transition-none"
            :class="
              sortDirection === 'desc'
                ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                : 'border-white/10 bg-white/5'
            "
            :aria-label="sortDirection === 'asc' ? '当前正序，切换为倒序' : '当前倒序，切换为正序'"
            :title="sortDirection === 'asc' ? '切换为倒序' : '切换为正序'"
            :aria-pressed="sortDirection === 'desc'"
            @click="onDirectionClick"
          >
            <svg
              v-if="sortDirection === 'asc'"
              viewBox="0 0 16 16"
              class="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 13V3" />
              <path d="M4 7l4-4 4 4" />
            </svg>
            <svg
              v-else
              viewBox="0 0 16 16"
              class="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 3v10" />
              <path d="M4 9l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      <div
        v-for="group in groups"
        :key="group.id"
        data-group-row-container
        class="group relative mt-1 flex items-center gap-0.5 transition-opacity motion-reduce:transition-none"
        :class="{ 'opacity-40': sortingGroupId === group.id }"
        @dragenter="onDragEnter($event, group.id)"
        @dragleave="onDragLeave($event, group.id)"
        @dragover="onDragOver"
        @drop="onDrop($event, group.id)"
        @contextmenu.prevent.stop="onGroupContextMenu(group, $event)"
      >
        <button
          v-if="sortable && !dragging"
          type="button"
          :data-group-grip="group.id"
          class="flex h-8 w-4 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-slate-600 transition hover:text-slate-400 focus-visible:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 active:cursor-grabbing motion-reduce:transition-none"
          :aria-label="`拖动排序「${group.name}」，Alt+加方向键调整顺序`"
          :title="`拖动排序「${group.name}」；Alt+↑/↓ 调整`"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          @pointerdown="onGripPointerDown(group, $event)"
          @pointermove="onGripPointerMove"
          @pointerup="onGripPointerUp"
          @pointercancel="cleanupDrag"
          @lostpointercapture="cleanupDrag"
          @keydown="onGripKeydown(group, $event)"
          @keydown.esc.stop.prevent="cancelDrag"
          @click.stop
        >
          <svg viewBox="0 0 8 14" class="h-3.5 w-2 fill-current" aria-hidden="true">
            <circle cx="2" cy="2" r="1.1" />
            <circle cx="6" cy="2" r="1.1" />
            <circle cx="2" cy="7" r="1.1" />
            <circle cx="6" cy="7" r="1.1" />
            <circle cx="2" cy="12" r="1.1" />
            <circle cx="6" cy="12" r="1.1" />
          </svg>
        </button>
        <span v-else class="h-8 w-4 shrink-0" aria-hidden="true"></span>

        <button
          data-group-row
          :aria-label="group.name"
          :title="group.name"
          class="flex min-w-0 flex-1 items-center justify-between rounded-lg py-2 pl-2 pr-10 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 motion-reduce:transition-none"
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
          v-if="!dragging && !sortingGroupId"
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

    <div
      v-if="marker"
      data-testid="group-drop-marker"
      class="pointer-events-none fixed z-30 h-0.5 rounded-full bg-indigo-400"
      :style="{ left: `${marker.left}px`, top: `${marker.top}px`, width: `${marker.width}px` }"
    />
    <p class="sr-only" role="status">{{ sortAnnouncement }}</p>
  </aside>
</template>
