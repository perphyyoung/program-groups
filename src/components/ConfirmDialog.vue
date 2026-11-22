<script setup lang="ts">
import { useId, useTemplateRef, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const dialogEl = useTemplateRef<HTMLDialogElement>("dialogEl");
const id = useId();
const titleId = `confirm-title-${id}`;
const descriptionId = `confirm-description-${id}`;

watch(
  () => props.open,
  (open) => {
    const dialog = dialogEl.value;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  },
  { immediate: true, flush: "post" },
);

function onCancel(event: Event): void {
  if (props.busy) {
    event.preventDefault();
    return;
  }
  emit("cancel");
}

function onConfirm(): void {
  if (props.busy) return;
  emit("confirm");
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="m-auto w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-white/10 bg-[#151b25] p-5 text-slate-200 shadow-2xl"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    @cancel="onCancel"
  >
    <form @submit.prevent="onConfirm">
      <h2 :id="titleId" class="text-base font-semibold text-slate-100">{{ title }}</h2>
      <p :id="descriptionId" class="mt-2 text-sm leading-6 text-slate-400">{{ description }}</p>

      <p class="mt-1 min-h-5 text-xs text-rose-300" role="alert">{{ error }}</p>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          autofocus
          :disabled="busy"
          class="h-9 rounded-lg border border-white/10 text-sm text-slate-300 transition hover:bg-white/10 active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="busy"
          :aria-busy="busy"
          class="h-9 rounded-lg bg-rose-500 text-sm font-medium text-white transition hover:bg-rose-400 active:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          {{ busy ? (busyLabel ?? "处理中…") : (confirmLabel ?? "确认") }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
dialog::backdrop {
  background: rgb(0 0 0 / 60%);
  overflow: hidden;
  overscroll-behavior: contain;
}

dialog:modal {
  overscroll-behavior: contain;
}
</style>
