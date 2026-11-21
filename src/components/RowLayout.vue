<script setup lang="ts">
import { computed } from "vue";
import type { RowContextRequest } from "../lib/row-menu";

const props = withDefaults(
  defineProps<{
    variant?: "card" | "flat";
    selected?: boolean;
    dragging?: boolean;
  }>(),
  { variant: "card", selected: false, dragging: false },
);

const emit = defineEmits<{
  contextmenu: [request: RowContextRequest];
}>();

const surface = computed(() => {
  if (props.dragging) return "border-indigo-400/40 bg-indigo-500/5 opacity-40";
  if (props.selected) return "border-indigo-400/80 bg-indigo-500/10";
  if (props.variant === "flat") return "border-white/5 hover:bg-white/[0.03]";
  return "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]";
});

function onContextMenu(event: MouseEvent): void {
  const target = event.target;
  /* 备注输入框内保留系统右键菜单，避免覆盖复制/粘贴 */
  if (target instanceof Element && target.closest("input, textarea, [contenteditable]")) return;
  event.preventDefault();
  const anchor = event.currentTarget;
  if (!(anchor instanceof HTMLElement)) return;

  let x = event.clientX;
  let y = event.clientY;
  /* 键盘（Shift+F10 / 菜单键）触发时坐标可能为 0，退回到行内左上角 */
  if (x === 0 && y === 0) {
    const rect = anchor.getBoundingClientRect();
    x = rect.left + 8;
    y = rect.top + Math.min(rect.height, 28);
  }

  anchor.focus({ preventScroll: true });
  emit("contextmenu", { x, y, anchor });
}
</script>

<template>
  <div
    class="group grid min-h-12 min-w-0 grid-cols-[1rem_2rem_minmax(8rem,12rem)_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 motion-reduce:transition-none"
    :class="[variant === 'card' ? 'rounded-lg border' : 'border-t', surface]"
    tabindex="-1"
    @contextmenu="onContextMenu"
  >
    <div class="flex items-center justify-center">
      <slot name="lead" />
    </div>
    <div class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white/5">
      <slot name="icon" />
    </div>
    <div class="min-w-0 truncate text-sm text-slate-200">
      <slot name="name" />
    </div>
    <div class="min-w-0">
      <slot name="context" />
    </div>
    <div class="flex items-center justify-end gap-1">
      <slot name="meta" />
    </div>
    <div class="flex items-center justify-end gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
