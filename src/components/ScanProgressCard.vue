<script setup lang="ts">
import { computed } from "vue";
import type { ScanProgress } from "../lib/types";

const props = defineProps<{
  progress: ScanProgress | null;
}>();

const label = computed(() => {
  const progress = props.progress;
  if (!progress) return "准备扫描…";
  if (progress.phase === "green") {
    if (progress.total <= 0) return `扫描绿色软件 · ${progress.detail ?? "读取目录"}`;
    return `扫描绿色软件 ${progress.done}/${progress.total}`;
  }
  if (progress.total <= 0) return "准备扫描…";
  if (progress.phase === "start-menu") {
    return `扫描开始菜单 ${progress.done}/${progress.total}`;
  }
  if (progress.phase === "store") {
    const detail = progress.detail ? ` · ${progress.detail}` : "";
    return `扫描 Store 应用 ${progress.done}/${progress.total}${detail}`;
  }
  if (progress.phase === "icons") {
    return `检查图标 ${progress.done}/${progress.total} · 缓存 ${progress.cached ?? 0} · 提取 ${progress.extracted ?? 0}`;
  }
  return "整理完成";
});

const percent = computed(() => {
  const progress = props.progress;
  if (!progress || progress.total <= 0) return null;
  return Math.min(100, Math.round((progress.done / progress.total) * 100));
});
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-auto fixed bottom-6 right-6 z-40 w-[360px] max-w-[calc(100vw-3rem)] rounded-xl border border-white/10 bg-[#12151d] p-3 text-sm shadow-2xl"
  >
    <div class="flex items-center gap-2">
      <span
        class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-400/40 border-t-indigo-300"
      ></span>
      <span class="min-w-0 flex-1 truncate text-slate-200">{{ label }}</span>
    </div>
    <div v-if="percent !== null" class="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
      <div
        class="h-full rounded-full bg-indigo-400 transition-[width] duration-200"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
