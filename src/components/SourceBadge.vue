<script setup lang="ts">
import { computed } from "vue";
import type { AppSource } from "../lib/types";

const props = defineProps<{
  source: AppSource;
}>();

const title = computed(() => {
  if (props.source === "store") return "来源：Microsoft Store";
  return "来源：开始菜单";
});

const tone = computed(() => {
  if (props.source === "store") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  return "border-slate-500/40 bg-slate-500/10 text-slate-400";
});
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded border px-1 py-px text-[10px] leading-none"
    :class="tone"
    :title="title"
  >
    {{ source }}
  </span>
</template>
