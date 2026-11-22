<script setup lang="ts">
import { computed, ref } from "vue";
import type { IconSettings, IconSource, IconUpdateProgress } from "../lib/types";

const props = defineProps<{
  settings: IconSettings | null;
  busy: boolean;
  progress: IconUpdateProgress | null;
}>();

const emit = defineEmits<{
  update: [force: boolean];
  sourcesChange: [sources: IconSource[]];
}>();

const force = ref(false);
const selected = computed(() => new Set<IconSource>(props.settings?.sources ?? ["start"]));
const totals = computed(() => {
  const stats = props.settings?.stats;
  if (!stats) return null;
  let cached = 0;
  let total = 0;
  for (const source of selected.value) {
    cached += stats[source].cached;
    total += stats[source].total;
  }
  return { cached, total };
});
const missing = computed(() =>
  totals.value ? Math.max(0, totals.value.total - totals.value.cached) : 0,
);
const percent = computed(() => {
  if (!totals.value || totals.value.total === 0) return 0;
  return Math.round((totals.value.cached / totals.value.total) * 100);
});
const canUpdate = computed(() => !props.busy && selected.value.size > 0);

function toggleSource(source: IconSource, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const next = new Set(selected.value);
  if (target.checked) next.add(source);
  else next.delete(source);
  emit("sourcesChange", Array.from(next));
}

function startUpdate(): void {
  if (!canUpdate.value) return;
  emit("update", force.value);
}
</script>

<template>
  <section class="w-full pt-5" aria-labelledby="settings-icon-title">
    <div class="w-full rounded-xl border border-white/10 bg-[#0f131a] px-6 py-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 id="settings-icon-title" class="text-sm font-semibold text-slate-100">图标缓存</h2>
          <p class="mt-1 text-sm text-slate-400">扫描只读取已缓存图标，提取单独进行。</p>
        </div>
        <button
          type="button"
          class="h-9 min-w-[128px] shrink-0 rounded-lg border border-slate-600/70 bg-white/5 text-sm text-slate-300 transition hover:border-slate-500 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canUpdate"
          :aria-busy="busy"
          :title="selected.size === 0 ? '至少选择一个图标来源' : undefined"
          @click="startUpdate"
        >
          {{ busy ? "更新中…" : force ? "重建图标缓存" : "更新图标缓存" }}
        </button>
      </div>

      <div
        role="group"
        aria-label="图标来源"
        class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4"
      >
        <span class="text-xs text-slate-400">图标来源</span>
        <label class="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            class="size-4 accent-indigo-500"
            :checked="selected.has('start')"
            :disabled="busy"
            @change="toggleSource('start', $event)"
          />
          start
        </label>
        <label class="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            class="size-4 accent-indigo-500"
            :checked="selected.has('store')"
            :disabled="busy"
            @change="toggleSource('store', $event)"
          />
          store
        </label>
        <label
          class="flex w-fit cursor-not-allowed items-center gap-2 text-sm text-slate-500"
          title="绿色软件扫描未实现"
        >
          <input type="checkbox" class="size-4" disabled />
          green
        </label>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-4 border-b border-white/10 pb-4">
        <div>
          <div class="text-xs text-slate-400">已缓存</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {{ totals ? totals.cached : "—" }}
          </div>
        </div>
        <div>
          <div class="text-xs text-slate-400">未缓存</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {{ totals ? missing : "—" }}
          </div>
        </div>
        <div>
          <div class="text-xs text-slate-400">覆盖率</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {{ totals ? `${percent}%` : "—" }}
          </div>
        </div>
      </div>

      <progress
        v-if="totals && totals.total > 0"
        aria-label="图标缓存进度"
        :value="totals.cached"
        :max="totals.total"
        class="mt-4 h-1.5 w-full overflow-hidden rounded-full accent-indigo-500 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-indigo-500"
      ></progress>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <label class="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              v-model="force"
              type="checkbox"
              class="size-4 accent-indigo-500"
              :disabled="busy"
            />
            全量重建
          </label>
          <span class="group relative inline-flex">
            <button
              type="button"
              aria-label="全量重建说明"
              aria-describedby="full-rebuild-tip"
              class="flex size-4 items-center justify-center rounded-full border border-slate-600/70 text-xs leading-none text-slate-400 transition hover:border-slate-500 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-400"
            >
              ?
            </button>
            <span
              id="full-rebuild-tip"
              role="tooltip"
              class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#151b25] px-2 py-1 text-xs text-slate-300 shadow-xl group-hover:block group-focus-within:block"
            >
              忽略缓存，重新提取全部图标
            </span>
          </span>
        </div>
        <p
          v-if="busy && progress"
          role="status"
          aria-live="polite"
          class="text-sm tabular-nums text-slate-400"
        >
          <template v-if="progress.total === 0">
            {{ progress.detail ?? "读取 Store 应用" }}…
          </template>
          <template v-else>
            已处理 {{ progress.done }} / {{ progress.total }} · 新增 {{ progress.extracted }} · 复用
            {{ progress.cached }} · 失败 {{ progress.failed }}
          </template>
        </p>
      </div>
    </div>
  </section>
</template>
