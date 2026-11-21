<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type { RowMenuItem } from "../lib/row-menu";

const props = defineProps<{
  items: RowMenuItem[];
}>();

const menuRef = ref<HTMLDivElement | null>(null);
const groupRef = ref<HTMLDivElement | null>(null);
let anchor: HTMLElement | null = null;

function firstEnabled(): HTMLButtonElement | null {
  return groupRef.value?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? null;
}

function positionAt(x: number, y: number): void {
  const menu = menuRef.value;
  if (!menu) return;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = x + rect.width + margin > window.innerWidth ? x - rect.width : x;
  const top = y + rect.height + margin > window.innerHeight ? y - rect.height : y;
  menu.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))}px`;
}

function bindDismiss(): void {
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
  window.addEventListener("blur", dismiss);
  document.addEventListener("focusin", onFocusIn);
}

function unbindDismiss(): void {
  window.removeEventListener("scroll", dismiss, true);
  window.removeEventListener("resize", dismiss);
  window.removeEventListener("blur", dismiss);
  document.removeEventListener("focusin", onFocusIn);
}

function dismiss(): void {
  close(false);
}

function openAt(x: number, y: number, nextAnchor: HTMLElement | null): void {
  const menu = menuRef.value;
  if (!menu) return;
  anchor = nextAnchor;
  unbindDismiss();
  bindDismiss();

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  if (!menu.matches(":popover-open")) {
    /* source 只用于隐式锚点；定位仍由脚本夹取视口，避免不支持锚点定位时居中 */
    if (nextAnchor) menu.showPopover({ source: nextAnchor });
    else menu.showPopover();
  }
  positionAt(x, y);
  firstEnabled()?.focus({ preventScroll: true });
}

function close(restoreFocus = false): void {
  const menu = menuRef.value;
  const target = anchor;
  anchor = null;
  if (restoreFocus && target?.isConnected) target.focus({ preventScroll: true });
  if (menu?.matches(":popover-open")) menu.hidePopover();
  unbindDismiss();
}

function onToggle(event: Event): void {
  const newState = (event as Event & { newState?: string }).newState;
  if (newState !== "closed") return;
  const target = anchor;
  anchor = null;
  unbindDismiss();
  /* 浏览器自行关闭时，避免焦点留在已隐藏的菜单里 */
  if (document.activeElement instanceof Node && menuRef.value?.contains(document.activeElement)) {
    target?.focus({ preventScroll: true });
  }
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (target instanceof Node && menuRef.value?.contains(target)) return;
  close(false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Tab") {
    /* 焦点先回到行，再让浏览器按默认顺序移到下一个可聚焦元素，不困在菜单里 */
    const target = anchor;
    close(false);
    target?.focus({ preventScroll: true });
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }
  const items = Array.from(
    groupRef.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let next = 0;
  if (event.key === "End") next = items.length - 1;
  else if (event.key === "ArrowDown") next = (current + 1) % items.length;
  else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
  event.preventDefault();
  event.stopPropagation();
  items[next]?.focus({ preventScroll: true });
}

function onAction(item: RowMenuItem): void {
  if (item.disabled) return;
  close(true);
  item.run();
}

function onItemHover(event: PointerEvent): void {
  const item = event.currentTarget;
  if (item instanceof HTMLButtonElement && !item.disabled) item.focus({ preventScroll: true });
}

defineExpose({ openAt, close });

onBeforeUnmount(unbindDismiss);
</script>

<template>
  <div
    ref="menuRef"
    popover="auto"
    class="fixed inset-auto m-0 min-w-44 rounded-lg border border-white/10 bg-[#151b25] p-1 text-xs text-slate-200 shadow-2xl"
    @toggle="onToggle"
  >
    <div ref="groupRef" role="menu" aria-label="行操作" @keydown="onKeydown">
      <template v-for="(item, index) in props.items" :key="item.label">
        <button
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          :title="item.title"
          class="flex h-8 w-full items-center rounded px-2.5 text-left text-xs text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none"
          @pointerenter="onItemHover"
          @click="onAction(item)"
        >
          {{ item.label }}
        </button>
        <hr
          v-if="item.separatorAfter && index < props.items.length - 1"
          class="my-1 border-t border-white/10"
        />
      </template>
    </div>
  </div>
</template>
