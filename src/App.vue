<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import AccordionSection from "./components/AccordionSection.vue";
import AppRow from "./components/AppRow.vue";
import GroupDialog from "./components/GroupDialog.vue";
import IgnoredShortcutRow from "./components/IgnoredShortcutRow.vue";
import ManualIgnoredAppRow from "./components/ManualIgnoredAppRow.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppToast from "./components/AppToast.vue";
import RowContextMenu from "./components/RowContextMenu.vue";
import ScanProgressCard from "./components/ScanProgressCard.vue";
import { filterApps } from "./lib/app-filter";
import { filterIgnoredItems, groupIgnoredItems, IGNORE_REASON_LABELS } from "./lib/ignored-groups";
import { appNoteKey, shortcutNoteKey } from "./lib/note-keys";
import {
  buildRowMenu,
  type RowContextRequest,
  type RowMenuItem,
  type RowMenuSpec,
} from "./lib/row-menu";
import type {
  AppEntry,
  AppScope,
  GroupEntry,
  IgnoredItem,
  IgnoreReason,
  ScanProgress,
} from "./lib/types";

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; group: GroupEntry }
  | { kind: "delete"; group: GroupEntry };

const apps = ref<AppEntry[]>([]);
const groups = ref<GroupEntry[]>([]);
const missingCount = ref(0);
const ignoredItems = ref<IgnoredItem[]>([]);
const duplicateItems = ref<IgnoredItem[]>([]);
const openReasons = ref<Set<IgnoreReason>>(new Set());
const manualIgnored = ref<AppEntry[]>([]);
const manualOpen = ref(true);
const scope = ref<AppScope>({ kind: "ungrouped" });
const includeIgnored = ref(false);
const search = ref("");
const selected = ref<Set<string>>(new Set());
const lastSelectedIndex = ref<number | null>(null);
const dragIds = ref<string[]>([]);
const notes = ref<Record<string, string>>({});
const scanning = ref(false);
const scanProgress = ref<ScanProgress | null>(null);
const showScanProgress = ref(false);
const scanError = ref<string | null>(null);
const targetGroupId = ref("");
const toast = ref<{ message: string; kind: "info" | "error" } | null>(null);
const dialog = ref<DialogState | null>(null);
const dialogError = ref<string | null>(null);
const dialogBusy = ref(false);
const groupMenuId = ref<string | null>(null);
const sidebar = useTemplateRef<{ focusUngrouped: () => void }>("sidebar");
const menuItems = ref<RowMenuItem[]>([]);
const contextMenu = useTemplateRef<{
  openAt: (x: number, y: number, anchor: HTMLElement | null) => void;
  close: (restoreFocus?: boolean) => void;
}>("contextMenu");
let menuSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeScan: (() => void) | null = null;

const ungroupedCount = computed(
  () => apps.value.filter((item) => item.groupIds.length === 0).length,
);
const selectedCount = computed(() => selected.value.size);
const ignoredCount = computed(() => ignoredItems.value.length + manualIgnored.value.length);
const manualIgnoredIds = computed(() => new Set(manualIgnored.value.map((app) => app.id)));
const menuLabel = computed(() => (groupMenuId.value ? "分组操作" : "行操作"));

const filteredApps = computed(() =>
  filterApps(apps.value, scope.value, search.value, (app) => appNote(app.id)),
);

const ignoredGroups = computed(() =>
  groupIgnoredItems([...ignoredItems.value, ...duplicateItems.value], search.value, (item) =>
    shortcutNote(item.shortcutPath),
  ),
);

const manualIgnoredMatches = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return manualIgnored.value
    .filter(
      (app) =>
        !keyword ||
        app.name.toLowerCase().includes(keyword) ||
        app.exePath.toLowerCase().includes(keyword) ||
        appNote(app.id).toLowerCase().includes(keyword),
    )
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
});

/** 全部应用栏的已忽略项：只在勾选后参与展示与搜索，重复项不列入 */
const ignoredMatches = computed(() =>
  includeIgnored.value && scope.value.kind === "all"
    ? filterIgnoredItems(ignoredItems.value, search.value, (item) =>
        shortcutNote(item.shortcutPath),
      )
    : [],
);

/** 全部应用栏勾选后展示的已忽略项总数：规则过滤项 + 手动忽略应用 */
const allIgnoredTotal = computed(() =>
  includeIgnored.value && scope.value.kind === "all"
    ? ignoredMatches.value.length + manualIgnoredMatches.value.length
    : 0,
);

const currentTitle = computed(() => {
  const current = scope.value;
  if (current.kind === "all") return "全部应用";
  if (current.kind === "ungrouped") return "未分组";
  if (current.kind === "ignored") return "已忽略";
  return groups.value.find((group) => group.id === current.groupId)?.name ?? "分组";
});

const emptyText = computed(() => {
  if (search.value.trim()) {
    return includeIgnored.value && scope.value.kind === "all"
      ? "没有匹配的应用或已忽略项"
      : "没有匹配的应用";
  }
  if (scope.value.kind === "ungrouped") return "所有应用都已归类";
  if (scope.value.kind === "ignored") return "没有被忽略的应用";
  if (scope.value.kind === "group") return "这个分组还没有应用，把应用拖进来";
  return "没有找到可启动的应用，点击刷新重试";
});

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  /* Electron IPC 会把主进程错误包成 "Error invoking remote method 'x': Error: ..." */
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, "");
}

function showToast(message: string, kind: "info" | "error"): void {
  toast.value = { message, kind };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 3600);
}

function groupName(groupId: string): string {
  return groups.value.find((group) => group.id === groupId)?.name ?? "分组";
}

function groupNamesOf(app: AppEntry): string[] {
  return app.groupIds
    .map((groupId) => groups.value.find((group) => group.id === groupId)?.name)
    .filter((name): name is string => Boolean(name));
}

/** 搜索时强制展开命中组，清空搜索后恢复手动状态 */
function isGroupOpen(reason: IgnoreReason): boolean {
  return search.value.trim() !== "" || openReasons.value.has(reason);
}

function toggleGroup(reason: IgnoreReason): void {
  const next = new Set(openReasons.value);
  if (next.has(reason)) next.delete(reason);
  else next.add(reason);
  openReasons.value = next;
}

async function revealShortcutPath(path: string): Promise<void> {
  try {
    const result = await window.api.revealShortcut(path);
    if (!result.ok) showToast(`打开失败：${result.error ?? "未知错误"}`, "error");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function revealShortcut(item: IgnoredItem): Promise<void> {
  return revealShortcutPath(item.shortcutPath);
}

async function revealPath(path: string): Promise<void> {
  try {
    const result = await window.api.revealPath(path);
    if (!result.ok) showToast(`打开失败：${result.error ?? "未知错误"}`, "error");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function runShortcut(item: IgnoredItem): Promise<void> {
  try {
    const result = await window.api.launchShortcut(item.shortcutPath);
    if (!result.ok) showToast(`启动失败：${result.error ?? "未知错误"}`, "error");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function appMenuSpec(app: AppEntry): RowMenuSpec {
  return {
    paths: {
      run: app.launchPath,
      target: app.exePath,
      link: app.launchKind === "lnk" ? app.launchPath : null,
    },
    actions: {
      run: () => void launch(app),
      revealTarget: () => void revealPath(app.exePath),
      revealLink: () => {
        if (app.launchKind === "lnk") void revealShortcutPath(app.launchPath);
      },
    },
  };
}

function shortcutMenuSpec(item: IgnoredItem): RowMenuSpec {
  return {
    paths: {
      run: item.shortcutPath,
      target: item.target || null,
      link: item.shortcutPath,
    },
    actions: {
      run: () => void runShortcut(item),
      revealTarget: () => {
        if (item.target) void revealPath(item.target);
      },
      revealLink: () => void revealShortcut(item),
    },
  };
}

async function openRowMenu(request: RowContextRequest, spec: RowMenuSpec): Promise<void> {
  const seq = ++menuSeq;
  groupMenuId.value = null;
  contextMenu.value?.close(false);
  let exists = {
    run: spec.paths.run !== null,
    target: spec.paths.target !== null,
    link: spec.paths.link !== null,
  };
  try {
    exists = await window.api.checkPaths(spec.paths);
  } catch {
    /* 路径检查失败时按路径存在处理，点击后再给出失败提示 */
  }
  if (seq !== menuSeq) return;
  menuItems.value = buildRowMenu(spec.paths, exists, spec.actions);
  await nextTick();
  if (seq !== menuSeq) return;
  contextMenu.value?.openAt(request.x, request.y, request.anchor);
}

async function manualIgnore(app: AppEntry): Promise<void> {
  try {
    await window.api.manualIgnore(app.id);
    clearSelection();
    await load();
    showToast(`已手动忽略「${app.name}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function restoreManual(app: AppEntry): Promise<void> {
  try {
    await window.api.manualRestore(app.id);
    await load();
    showToast(`已恢复「${app.name}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function onManualDragStart(app: AppEntry, event: DragEvent): void {
  dragIds.value = [app.id];
  event.dataTransfer?.setData("application/x-pg-apps", JSON.stringify([app.id]));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragEnd(): void {
  dragIds.value = [];
}

function appNote(appId: string): string {
  return notes.value[appNoteKey(appId)] ?? "";
}

function shortcutNote(shortcutPath: string): string {
  return notes.value[shortcutNoteKey(shortcutPath)] ?? "";
}

async function saveNote(key: string, note: string): Promise<void> {
  try {
    await window.api.setNote(key, note);
    const next = { ...notes.value };
    if (note) next[key] = note;
    else delete next[key];
    notes.value = next;
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function saveAppNote(appId: string, note: string): Promise<void> {
  return saveNote(appNoteKey(appId), note);
}

function saveShortcutNote(shortcutPath: string, note: string): Promise<void> {
  return saveNote(shortcutNoteKey(shortcutPath), note);
}

function reasonLabel(reason: IgnoreReason): string {
  return IGNORE_REASON_LABELS[reason];
}

function selectScope(next: AppScope): void {
  scope.value = next;
  clearSelection();
}

async function load(): Promise<void> {
  const data = await window.api.loadLibrary();
  apps.value = data.apps;
  manualIgnored.value = data.manualIgnored;
  notes.value = data.notes;
  groups.value = data.groups;
  missingCount.value = data.missingCount;
  if (!targetGroupId.value || !data.groups.some((group) => group.id === targetGroupId.value)) {
    targetGroupId.value = data.groups[0]?.id ?? "";
  }
}

async function loadGroups(): Promise<void> {
  const data = await window.api.loadGroups();
  groups.value = data.groups;
  const groupIdsByApp = new Map<string, string[]>();
  for (const membership of data.memberships) {
    const ids = groupIdsByApp.get(membership.appId) ?? [];
    ids.push(membership.groupId);
    groupIdsByApp.set(membership.appId, ids);
  }
  apps.value = apps.value.map((app) => {
    app.groupIds = groupIdsByApp.get(app.id) ?? [];
    return app;
  });
}

async function scan(): Promise<void> {
  if (scanning.value) return;
  scanning.value = true;
  scanError.value = null;
  scanProgress.value = { phase: "start-menu", done: 0, total: 0 };
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    if (scanning.value) showScanProgress.value = true;
  }, 150);
  try {
    const summary = await window.api.scanLibrary();
    ignoredItems.value = summary.ignoredItems;
    duplicateItems.value = summary.duplicateItems;
    if (summary.changed) await load();
    showToast(
      `扫描完成：新增 ${summary.added}，缺失 ${summary.missing}，忽略 ${summary.ignored}，重复 ${summary.duplicate}`,
      "info",
    );
  } catch (error) {
    scanError.value = errorMessage(error);
  } finally {
    scanning.value = false;
    scanProgress.value = null;
    showScanProgress.value = false;
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = null;
  }
}

function onScanProgress(progress: ScanProgress): void {
  scanProgress.value = progress;
}

function clearSelection(): void {
  selected.value = new Set();
  lastSelectedIndex.value = null;
}

function onSelect(app: AppEntry, event: MouseEvent): void {
  const index = filteredApps.value.findIndex((item) => item.id === app.id);
  const next = new Set(selected.value);
  if (event.shiftKey && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    for (let i = start; i <= end; i += 1) {
      const item = filteredApps.value[i];
      if (item) next.add(item.id);
    }
    lastSelectedIndex.value = index;
  } else if (event.ctrlKey || event.metaKey) {
    if (next.has(app.id)) next.delete(app.id);
    else next.add(app.id);
    lastSelectedIndex.value = index;
  } else {
    next.clear();
    next.add(app.id);
    lastSelectedIndex.value = index;
  }
  selected.value = next;
}

function toggleSelect(app: AppEntry): void {
  const next = new Set(selected.value);
  if (next.has(app.id)) next.delete(app.id);
  else next.add(app.id);
  selected.value = next;
  lastSelectedIndex.value = filteredApps.value.findIndex((item) => item.id === app.id);
}

async function launch(app: AppEntry): Promise<void> {
  const result = await window.api.launchApp(app.id);
  if (!result.ok) {
    showToast(`启动失败：${result.error ?? "未知错误"}`, "error");
    await load();
  }
}

async function assignTo(groupId: string): Promise<void> {
  if (!groupId || selected.value.size === 0) return;
  try {
    await window.api.addMembers(Array.from(selected.value), groupId);
    const name = groupName(groupId);
    clearSelection();
    await loadGroups();
    showToast(`已加入「${name}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function removeFromCurrentGroup(): Promise<void> {
  if (scope.value.kind !== "group" || selected.value.size === 0) return;
  try {
    await window.api.removeMembers(Array.from(selected.value), scope.value.groupId);
    clearSelection();
    await loadGroups();
    showToast("已移出分组", "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function onDropApps(groupId: string, appIds: string[]): Promise<void> {
  try {
    const hadManual = appIds.some((id) => manualIgnoredIds.value.has(id));
    await window.api.addMembers(appIds, groupId);
    clearSelection();
    if (hadManual) await load();
    else await loadGroups();
    showToast(`已加入「${groupName(groupId)}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function onDragStart(app: AppEntry, event: DragEvent): void {
  const ids = selected.value.has(app.id) ? Array.from(selected.value) : [app.id];
  if (!selected.value.has(app.id)) selected.value = new Set([app.id]);
  dragIds.value = ids;
  event.dataTransfer?.setData("application/x-pg-apps", JSON.stringify(ids));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onMenuClose(): void {
  groupMenuId.value = null;
}

function openCreate(): void {
  dialogError.value = null;
  dialog.value = { kind: "create" };
}

function openRename(group: GroupEntry): void {
  dialogError.value = null;
  dialog.value = { kind: "rename", group };
}

function openDelete(group: GroupEntry): void {
  dialogError.value = null;
  dialog.value = { kind: "delete", group };
}

function closeDialog(): void {
  if (dialogBusy.value) return;
  dialog.value = null;
  dialogError.value = null;
}

function openGroupMenu(group: GroupEntry, request: RowContextRequest): void {
  menuSeq += 1;
  groupMenuId.value = group.id;
  menuItems.value = [
    {
      label: "重命名分组",
      disabled: false,
      separatorAfter: true,
      run: () => openRename(group),
    },
    {
      label: "删除分组",
      disabled: false,
      danger: true,
      run: () => openDelete(group),
    },
  ];
  void nextTick(() => contextMenu.value?.openAt(request.x, request.y, request.anchor));
}

async function confirmDialog(name: string): Promise<void> {
  const current = dialog.value;
  if (!current || dialogBusy.value) return;
  dialogBusy.value = true;
  dialogError.value = null;
  try {
    if (current.kind === "create") {
      const created = await window.api.createGroup(name);
      await loadGroups();
      targetGroupId.value = created.id;
    } else if (current.kind === "rename") {
      await window.api.renameGroup(current.group.id, name);
      await loadGroups();
    } else {
      await window.api.deleteGroup(current.group.id);
      if (scope.value.kind === "group" && scope.value.groupId === current.group.id) {
        scope.value = { kind: "ungrouped" };
        clearSelection();
      }
      await loadGroups();
      showToast(`已删除分组「${current.group.name}」`, "info");
    }
    dialog.value = null;
    if (current.kind === "delete") {
      await nextTick();
      sidebar.value?.focusUngrouped();
    }
  } catch (error) {
    dialogError.value = errorMessage(error);
  } finally {
    dialogBusy.value = false;
  }
}

onMounted(async () => {
  unsubscribeScan = window.api.onScanProgress(onScanProgress);
  try {
    await load();
  } catch (error) {
    showToast(`读取数据失败：${errorMessage(error)}`, "error");
  }
  await scan();
});

onBeforeUnmount(() => {
  unsubscribeScan?.();
  if (toastTimer) clearTimeout(toastTimer);
  if (progressTimer) clearTimeout(progressTimer);
});
</script>

<template>
  <div class="flex h-full flex-col bg-[#0b0d12]">
    <div v-if="scanError" role="alert" class="fixed inset-x-0 top-3 z-40 flex justify-center px-4">
      <div
        class="flex w-full max-w-xl items-start gap-3 rounded-xl border border-rose-500/40 bg-[#2a1216] px-4 py-3 text-sm text-rose-200 shadow-2xl"
      >
        <span class="min-w-0 flex-1">扫描失败：{{ scanError }}</span>
        <button
          type="button"
          class="shrink-0 rounded-md px-2 py-0.5 text-xs text-rose-300 transition hover:bg-white/10 hover:text-rose-100"
          @click="scanError = null"
        >
          关闭
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <AppSidebar
        ref="sidebar"
        :groups="groups"
        :total-count="apps.length"
        :ungrouped-count="ungroupedCount"
        :ignored-count="ignoredCount"
        :active="scope"
        :scanning="scanning"
        :dragging="dragIds.length > 0"
        :menu-open-group-id="groupMenuId"
        @select="selectScope"
        @create="openCreate"
        @menu="openGroupMenu"
        @drop-apps="onDropApps"
      />

      <main class="relative flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-4 border-b border-white/10 px-5 py-3">
          <div class="min-w-0">
            <h1 class="truncate text-base font-semibold text-slate-100">{{ currentTitle }}</h1>
            <label
              v-if="scope.kind === 'all'"
              class="mt-1 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-400"
            >
              <input v-model="includeIgnored" type="checkbox" class="accent-indigo-500" />
              包含已忽略项
            </label>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <input
              v-model="search"
              type="search"
              aria-label="搜索应用"
              placeholder="搜索当前列表"
              class="h-8 w-56 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60"
            />
            <button
              class="h-8 w-[68px] rounded-lg border border-white/10 bg-white/5 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="scanning"
              :aria-busy="scanning"
              @click="scan"
            >
              刷新
            </button>
          </div>
        </header>

        <div
          data-testid="main-scroll"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-12 px-5 pb-5 [scrollbar-gutter:stable]"
        >
          <div v-if="scope.kind === 'ignored'" class="h-full">
            <div
              v-if="ignoredGroups.length > 0 || manualIgnoredMatches.length > 0"
              class="space-y-2 pt-5"
            >
              <AccordionSection
                v-if="manualIgnoredMatches.length > 0"
                title="手动忽略"
                :count="manualIgnoredMatches.length"
                :open="manualOpen"
                @toggle="manualOpen = !manualOpen"
              >
                <div class="flex flex-col">
                  <AppRow
                    v-for="app in manualIgnoredMatches"
                    :key="app.id"
                    variant="flat"
                    :app="app"
                    :selected="false"
                    :dragging="dragIds.includes(app.id)"
                    :note="appNote(app.id)"
                    :group-names="groupNamesOf(app)"
                    @run="launch(app)"
                    @contextmenu="openRowMenu($event, appMenuSpec(app))"
                    @dragstart="onManualDragStart(app, $event)"
                    @dragend="onDragEnd"
                    @save-note="saveAppNote(app.id, $event)"
                  >
                    <template #actions>
                      <button
                        type="button"
                        class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/10"
                        :aria-label="`取消忽略「${app.name}」`"
                        @click.stop="restoreManual(app)"
                      >
                        取消忽略
                      </button>
                    </template>
                  </AppRow>
                </div>
              </AccordionSection>
              <AccordionSection
                v-for="group in ignoredGroups"
                :key="group.reason"
                :title="group.label"
                :count="group.items.length"
                :open="isGroupOpen(group.reason)"
                @toggle="toggleGroup(group.reason)"
              >
                <p
                  v-if="group.reason === 'duplicate'"
                  class="border-t border-white/5 px-4 py-2 text-xs text-slate-500"
                >
                  这些快捷方式指向已收录的应用，可直接删除
                </p>
                <IgnoredShortcutRow
                  v-for="item in group.items"
                  :key="item.shortcutPath"
                  :item="item"
                  :note="shortcutNote(item.shortcutPath)"
                  :meta-label="item.keptAs ? `已收录为「${item.keptAs}」` : undefined"
                  :meta-title="item.keptAs ? `已收录为「${item.keptAs}」` : undefined"
                  @save-note="saveShortcutNote(item.shortcutPath, $event)"
                  @run="runShortcut(item)"
                  @contextmenu="openRowMenu($event, shortcutMenuSpec(item))"
                />
              </AccordionSection>
            </div>
            <div v-else class="flex h-full items-center justify-center text-sm text-slate-500">
              {{ emptyText }}
            </div>
          </div>

          <template v-else>
            <div
              v-if="filteredApps.length > 0"
              data-testid="app-list"
              class="flex flex-col gap-1.5 pt-5"
              @click.self="clearSelection"
            >
              <AppRow
                v-for="app in filteredApps"
                :key="app.id"
                :app="app"
                :selected="selected.has(app.id)"
                :dragging="dragIds.includes(app.id)"
                :note="appNote(app.id)"
                :group-names="groupNamesOf(app)"
                @select="onSelect(app, $event)"
                @toggle="toggleSelect(app)"
                @run="launch(app)"
                @contextmenu="openRowMenu($event, appMenuSpec(app))"
                @dragstart="onDragStart(app, $event)"
                @dragend="onDragEnd"
                @save-note="saveAppNote(app.id, $event)"
              >
                <template #actions>
                  <button
                    type="button"
                    class="h-8 shrink-0 rounded-lg border border-white/10 px-2.5 text-xs text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-slate-200"
                    :aria-label="`手动忽略「${app.name}」`"
                    @click.stop="manualIgnore(app)"
                  >
                    忽略
                  </button>
                </template>
              </AppRow>
            </div>
            <section
              v-if="allIgnoredTotal > 0"
              data-testid="all-ignored"
              class="mt-5 overflow-hidden rounded-xl border border-white/10"
            >
              <div class="px-3 py-2 text-xs text-slate-500">已忽略项</div>
              <ManualIgnoredAppRow
                v-for="app in manualIgnoredMatches"
                :key="app.id"
                :app="app"
                :note="appNote(app.id)"
                @save-note="saveAppNote(app.id, $event)"
                @run="launch(app)"
                @contextmenu="openRowMenu($event, appMenuSpec(app))"
                @restore="restoreManual(app)"
              />
              <IgnoredShortcutRow
                v-for="item in ignoredMatches"
                :key="item.shortcutPath"
                :item="item"
                :note="shortcutNote(item.shortcutPath)"
                :meta-label="reasonLabel(item.reason)"
                @save-note="saveShortcutNote(item.shortcutPath, $event)"
                @run="runShortcut(item)"
                @contextmenu="openRowMenu($event, shortcutMenuSpec(item))"
              />
            </section>
            <div
              v-if="filteredApps.length === 0 && allIgnoredTotal === 0"
              class="flex h-full items-center justify-center text-sm text-slate-500"
            >
              {{ emptyText }}
            </div>
          </template>
        </div>

        <footer
          class="flex items-center justify-between border-t border-white/10 px-5 py-2 text-xs text-slate-500"
        >
          <span>
            共 {{ apps.length }} 个应用 · 未分组 {{ ungroupedCount }}
            <span v-if="missingCount > 0"> · 缺失 {{ missingCount }}</span>
          </span>
        </footer>

        <div
          v-if="selectedCount > 0 && scope.kind !== 'ignored'"
          class="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex justify-center px-4"
        >
          <div
            class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-[#151b25] px-4 py-2 text-sm text-slate-200 shadow-2xl"
          >
            <span class="text-xs text-slate-400">已选 {{ selectedCount }} 项</span>
            <template v-if="groups.length > 0">
              <select
                v-model="targetGroupId"
                aria-label="选择分组"
                :title="targetGroupId ? groupName(targetGroupId) : '加入分组…'"
                class="h-8 w-24 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-200 outline-none"
              >
                <!-- 用 component 渲染 button：HTML 规范不允许 button 直接作为 select 子元素，Vue 编译器会告警 -->
                <component :is="'button'" type="button">
                  <selectedcontent></selectedcontent>
                  <span aria-hidden="true" class="text-[10px] leading-none text-slate-400">▾</span>
                </component>
                <option value="" disabled>加入分组…</option>
                <option v-for="group in groups" :key="group.id" :value="group.id">
                  {{ group.name }}
                </option>
              </select>
              <button
                class="h-8 rounded-lg bg-indigo-500 px-3 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
                :disabled="!targetGroupId"
                @click="assignTo(targetGroupId)"
              >
                加入
              </button>
            </template>
            <button
              v-else
              class="h-8 rounded-lg bg-indigo-500 px-3 text-xs font-medium text-white transition hover:bg-indigo-400"
              @click="openCreate"
            >
              新建分组
            </button>
            <button
              v-if="scope.kind === 'group'"
              class="h-8 rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition hover:bg-white/10"
              @click="removeFromCurrentGroup"
            >
              移出本组
            </button>
            <button
              class="h-8 rounded-lg px-2 text-xs text-slate-500 transition hover:text-slate-200"
              @click="clearSelection"
            >
              取消
            </button>
          </div>
        </div>
      </main>
    </div>

    <GroupDialog
      :mode="dialog?.kind ?? null"
      :group="dialog && dialog.kind !== 'create' ? dialog.group : null"
      :error="dialogError"
      :busy="dialogBusy"
      @confirm="confirmDialog"
      @cancel="closeDialog"
      @closed="closeDialog"
      @input="dialogError = null"
    />

    <RowContextMenu ref="contextMenu" :items="menuItems" :label="menuLabel" @close="onMenuClose" />

    <AppToast v-if="toast" :message="toast.message" :kind="toast.kind" />

    <ScanProgressCard v-if="scanning && showScanProgress" :progress="scanProgress" />
  </div>
</template>
