<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AppCard from "./components/AppCard.vue";
import AppSidebar from "./components/AppSidebar.vue";
import { filterApps } from "./lib/app-filter";
import type {
  AppView,
  AppViewFilter,
  GroupView,
  IgnoredItem,
  IgnoreReason,
  ScanProgress,
} from "./lib/types";

type DialogState =
  | { kind: "create"; value: string }
  | { kind: "rename"; group: GroupView; value: string }
  | { kind: "delete"; group: GroupView };

const apps = ref<AppView[]>([]);
const groups = ref<GroupView[]>([]);
const missingCount = ref(0);
const ignoredItems = ref<IgnoredItem[]>([]);
const view = ref<AppViewFilter>({ kind: "ungrouped" });
const search = ref("");
const selected = ref<Set<string>>(new Set());
const lastSelectedIndex = ref<number | null>(null);
const scanning = ref(false);
const scanText = ref("");
const targetGroupId = ref("");
const toast = ref<{ message: string; kind: "info" | "error" } | null>(null);
const dialog = ref<DialogState | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeScan: (() => void) | null = null;

const ungroupedCount = computed(
  () => apps.value.filter((item) => item.groupIds.length === 0).length,
);
const selectedCount = computed(() => selected.value.size);
const ignoredCount = computed(() => ignoredItems.value.length);

const viewApps = computed(() => filterApps(apps.value, view.value, ""));
const filteredApps = computed(() => filterApps(apps.value, view.value, search.value));

const filteredIgnored = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return ignoredItems.value
    .filter(
      (item) =>
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.target.toLowerCase().includes(keyword),
    )
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
});

const headerCount = computed(() =>
  view.value.kind === "ignored" ? filteredIgnored.value.length : viewApps.value.length,
);
const headerUnit = computed(() => (view.value.kind === "ignored" ? "项" : "个应用"));

const currentTitle = computed(() => {
  const current = view.value;
  if (current.kind === "all") return "全部应用";
  if (current.kind === "ungrouped") return "未分组";
  if (current.kind === "ignored") return "已忽略";
  return groups.value.find((group) => group.id === current.groupId)?.name ?? "分组";
});

const emptyText = computed(() => {
  if (search.value.trim()) return "没有匹配的应用";
  if (view.value.kind === "ungrouped") return "所有应用都已归类";
  if (view.value.kind === "ignored") return "没有被忽略的应用";
  if (view.value.kind === "group") return "这个分组还没有应用，把应用拖进来";
  return "没有找到可启动的应用，点击刷新重试";
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showToast(message: string, kind: "info" | "error"): void {
  toast.value = { message, kind };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2600);
}

function groupName(groupId: string): string {
  return groups.value.find((group) => group.id === groupId)?.name ?? "分组";
}

function groupNamesOf(app: AppView): string[] {
  return app.groupIds
    .map((groupId) => groups.value.find((group) => group.id === groupId)?.name)
    .filter((name): name is string => Boolean(name));
}

const REASON_LABELS: Record<IgnoreReason, string> = {
  uninstall: "卸载入口",
  help: "帮助/说明",
  website: "官网/更新",
  system: "系统工具",
  installer: "安装程序",
  duplicate: "重复快捷方式",
  unreadable: "快捷方式无法解析",
  "invalid-target": "目标不是可执行文件",
  "missing-target": "目标文件不存在",
  "invalid-name": "名称为空",
};

function reasonLabel(reason: IgnoreReason): string {
  return REASON_LABELS[reason];
}

function firstChar(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function selectView(next: AppViewFilter): void {
  view.value = next;
  clearSelection();
}

async function load(): Promise<void> {
  const data = await window.api.loadLibrary();
  apps.value = data.apps;
  groups.value = data.groups;
  missingCount.value = data.missingCount;
  if (!targetGroupId.value || !data.groups.some((group) => group.id === targetGroupId.value)) {
    targetGroupId.value = data.groups[0]?.id ?? "";
  }
}

async function scan(): Promise<void> {
  if (scanning.value) return;
  scanning.value = true;
  scanText.value = "扫描中…";
  try {
    const summary = await window.api.scanLibrary();
    ignoredItems.value = summary.ignoredItems;
    await load();
    showToast(
      `扫描完成：新增 ${summary.added}，缺失 ${summary.missing}，忽略 ${summary.ignored}`,
      "info",
    );
  } catch (error) {
    showToast(`扫描失败：${errorMessage(error)}`, "error");
  } finally {
    scanning.value = false;
    scanText.value = "";
  }
}

function onScanProgress(progress: ScanProgress): void {
  if (progress.phase === "start-menu") {
    scanText.value = `扫描开始菜单 ${progress.done}/${progress.total}`;
  } else if (progress.phase === "icons") {
    scanText.value = `提取图标 ${progress.done}/${progress.total}`;
  } else {
    scanText.value = "整理完成";
  }
}

function clearSelection(): void {
  selected.value = new Set();
  lastSelectedIndex.value = null;
}

function onSelect(app: AppView, event: MouseEvent): void {
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

async function launch(app: AppView): Promise<void> {
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
    await load();
    showToast(`已加入「${name}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function removeFromCurrentGroup(): Promise<void> {
  if (view.value.kind !== "group" || selected.value.size === 0) return;
  try {
    await window.api.removeMembers(Array.from(selected.value), view.value.groupId);
    clearSelection();
    await load();
    showToast("已移出分组", "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function onDropApps(groupId: string, appIds: string[]): Promise<void> {
  try {
    await window.api.addMembers(appIds, groupId);
    clearSelection();
    await load();
    showToast(`已加入「${groupName(groupId)}」`, "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

function onDragStart(app: AppView, event: DragEvent): void {
  const ids = selected.value.has(app.id) ? Array.from(selected.value) : [app.id];
  if (!selected.value.has(app.id)) selected.value = new Set([app.id]);
  event.dataTransfer?.setData("application/x-pg-apps", JSON.stringify(ids));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function openCreate(): void {
  dialog.value = { kind: "create", value: "" };
}

function openRename(group: GroupView): void {
  dialog.value = { kind: "rename", group, value: group.name };
}

function openDelete(group: GroupView): void {
  dialog.value = { kind: "delete", group };
}

async function submitDialog(): Promise<void> {
  const current = dialog.value;
  if (!current) return;
  try {
    if (current.kind === "create") {
      const created = await window.api.createGroup(current.value);
      await load();
      view.value = { kind: "group", groupId: created.id };
      targetGroupId.value = created.id;
    } else if (current.kind === "rename") {
      await window.api.renameGroup(current.group.id, current.value);
      await load();
    } else {
      await window.api.deleteGroup(current.group.id);
      if (view.value.kind === "group" && view.value.groupId === current.group.id) {
        view.value = { kind: "ungrouped" };
      }
      await load();
      showToast(`已删除分组「${current.group.name}」`, "info");
    }
    dialog.value = null;
  } catch (error) {
    showToast(errorMessage(error), "error");
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
});
</script>

<template>
  <div class="flex h-full flex-col bg-[#0b0d12]">
    <div class="flex min-h-0 flex-1">
      <AppSidebar
        :groups="groups"
        :total-count="apps.length"
        :ungrouped-count="ungroupedCount"
        :ignored-count="ignoredCount"
        :active="view"
        :scanning="scanning"
        @select="selectView"
        @create="openCreate"
        @rename="openRename"
        @delete="openDelete"
        @drop-apps="onDropApps"
      />

      <main class="relative flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-4 border-b border-white/10 px-5 py-3">
          <div class="min-w-0">
            <h1 class="truncate text-base font-semibold text-slate-100">{{ currentTitle }}</h1>
            <p class="mt-0.5 text-xs text-slate-500">{{ headerCount }} {{ headerUnit }}</p>
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
              class="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
              :disabled="scanning"
              @click="scan"
            >
              {{ scanning ? scanText || "扫描中…" : "刷新" }}
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <div v-if="view.kind === 'ignored'" class="h-full">
            <div
              v-if="filteredIgnored.length > 0"
              class="overflow-hidden rounded-xl border border-white/10"
            >
              <div
                v-for="(item, index) in filteredIgnored"
                :key="`${item.reason}-${index}`"
                class="flex items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
              >
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-semibold text-slate-300"
                >
                  {{ firstChar(item.name) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm text-slate-200">
                    {{ item.name || "（无名称）" }}
                  </div>
                  <div class="mt-0.5 truncate text-xs text-slate-500" :title="item.target">
                    {{ item.target || "（无目标）" }}
                  </div>
                </div>
                <span
                  class="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400"
                >
                  {{ reasonLabel(item.reason) }}
                </span>
              </div>
            </div>
            <div v-else class="flex h-full items-center justify-center text-sm text-slate-500">
              {{ emptyText }}
            </div>
          </div>

          <template v-else>
            <div
              v-if="filteredApps.length > 0"
              class="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3"
              @click.self="clearSelection"
            >
              <AppCard
                v-for="app in filteredApps"
                :key="app.id"
                :app="app"
                :selected="selected.has(app.id)"
                :group-names="groupNamesOf(app)"
                @select="onSelect(app, $event)"
                @open="launch(app)"
                @dragstart="onDragStart(app, $event)"
              />
            </div>
            <div v-else class="flex h-full items-center justify-center text-sm text-slate-500">
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
          <span v-if="scanning">{{ scanText }}</span>
        </footer>

        <div
          v-if="selectedCount > 0 && view.kind !== 'ignored'"
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
                class="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-200 outline-none"
              >
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
              v-if="view.kind === 'group'"
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

    <div
      v-if="dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="dialog = null"
    >
      <form
        v-if="dialog.kind !== 'delete'"
        class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b25] p-5 shadow-2xl"
        @submit.prevent="submitDialog"
      >
        <h2 class="text-base font-semibold text-slate-100">
          {{ dialog.kind === "create" ? "新建分组" : "重命名分组" }}
        </h2>
        <input
          v-model="dialog.value"
          aria-label="分组名"
          maxlength="30"
          class="mt-4 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60"
          placeholder="例如：看图、开发、常用"
        />
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="h-8 rounded-lg px-3 text-sm text-slate-400 transition hover:text-slate-200"
            @click="dialog = null"
          >
            取消
          </button>
          <button
            type="submit"
            class="h-8 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            确定
          </button>
        </div>
      </form>

      <div
        v-else
        class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b25] p-5 shadow-2xl"
      >
        <h2 class="text-base font-semibold text-slate-100">删除「{{ dialog.group.name }}」？</h2>
        <p class="mt-2 text-sm text-slate-400">只删除分组，不会卸载应用。</p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            class="h-8 rounded-lg px-3 text-sm text-slate-400 transition hover:text-slate-200"
            @click="dialog = null"
          >
            取消
          </button>
          <button
            class="h-8 rounded-lg bg-rose-500 px-4 text-sm font-medium text-white transition hover:bg-rose-400"
            @click="submitDialog"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="toast"
      class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm shadow-2xl"
      :class="
        toast.kind === 'error'
          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
      "
    >
      {{ toast.message }}
    </div>
  </div>
</template>
