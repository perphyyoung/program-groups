<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import type { GroupEntry } from "../lib/types";

const props = defineProps<{
  mode: "create" | "rename" | "delete" | null;
  group: GroupEntry | null;
  error: string | null;
  busy: boolean;
}>();

const emit = defineEmits<{
  confirm: [name: string];
  cancel: [];
  closed: [];
  input: [];
}>();

const dialogEl = useTemplateRef<HTMLDialogElement>("dialogEl");
const nameInput = useTemplateRef<HTMLInputElement>("nameInput");
const cancelButton = useTemplateRef<HTMLButtonElement>("cancelButton");
const name = ref("");

const trimmedName = computed(() => name.value.trim());

const title = computed(() => {
  if (props.mode === "create") return "新建分组";
  if (props.mode === "rename") return "重命名分组";
  if (props.mode === "delete" && props.group) return `删除分组「${props.group.name}」？`;
  return "";
});

const canSubmit = computed(() => {
  if (props.busy || !props.mode) return false;
  if (props.mode === "delete") return true;
  if (!trimmedName.value) return false;
  return props.mode !== "rename" || trimmedName.value !== (props.group?.name ?? "");
});

const primaryLabel = computed(() => {
  if (props.busy) return props.mode === "delete" ? "删除中…" : "保存中…";
  if (props.mode === "create") return "创建分组";
  if (props.mode === "rename") return "保存";
  return "删除分组";
});

const deleteDescription = computed(() => {
  const count = props.group?.count ?? 0;
  if (count > 0) {
    return `组内 ${count} 个应用会失去这个分组；只属于它的应用会回到未分组。应用不会被卸载，其他分组不受影响。`;
  }
  return "这个分组还没有应用，删除后不可恢复。";
});

function submit(): void {
  if (!canSubmit.value) return;
  emit("confirm", props.mode === "delete" ? "" : trimmedName.value);
}

function onCancel(event: Event): void {
  if (props.busy) {
    event.preventDefault();
    return;
  }
  emit("cancel");
}

watch(
  () => props.mode,
  (mode) => {
    if (!mode) {
      if (dialogEl.value?.open) dialogEl.value.close();
      return;
    }
    name.value = mode === "rename" ? (props.group?.name ?? "") : "";
    void nextTick(() => {
      if (props.mode !== mode) return;
      if (!dialogEl.value?.open) dialogEl.value?.showModal();
      if (mode === "delete") cancelButton.value?.focus();
      else {
        nameInput.value?.focus();
        nameInput.value?.select();
      }
    });
  },
  { flush: "post" },
);

watch(
  () => props.error,
  (error) => {
    if (!error || props.mode === "delete") return;
    nameInput.value?.focus();
    nameInput.value?.select();
  },
  { flush: "post" },
);
</script>

<template>
  <dialog
    ref="dialogEl"
    class="m-auto w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-white/10 bg-[#151b25] p-5 text-slate-200 shadow-2xl"
    :aria-labelledby="mode ? 'group-dialog-title' : undefined"
    :aria-describedby="mode === 'delete' ? 'group-dialog-description' : undefined"
    @cancel="onCancel"
    @close="emit('closed')"
  >
    <form v-if="mode" @submit.prevent="submit">
      <h2 id="group-dialog-title" class="text-base font-semibold text-slate-100">{{ title }}</h2>

      <p
        v-if="mode === 'delete'"
        id="group-dialog-description"
        class="mt-2 text-sm leading-6 text-slate-400"
      >
        {{ deleteDescription }}
      </p>

      <template v-else>
        <label for="group-dialog-name" class="mt-4 block text-xs text-slate-400">分组名</label>
        <input
          id="group-dialog-name"
          ref="nameInput"
          v-model="name"
          maxlength="30"
          autofocus
          :aria-invalid="Boolean(error)"
          aria-describedby="group-dialog-error"
          class="mt-1.5 h-9 w-full rounded-lg border bg-white/5 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60"
          :class="error ? 'border-rose-400/60' : 'border-white/10'"
          placeholder="例如：看图、开发、常用"
          @input="emit('input')"
        />
      </template>

      <p id="group-dialog-error" class="mt-1 min-h-5 text-xs text-rose-300" role="alert">
        {{ error }}
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          ref="cancelButton"
          type="button"
          :autofocus="mode === 'delete'"
          :disabled="busy"
          class="h-9 rounded-lg border border-white/10 text-sm text-slate-300 transition hover:bg-white/10 active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="!canSubmit"
          :aria-busy="busy"
          class="h-9 rounded-lg text-sm font-medium text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          :class="
            mode === 'delete'
              ? 'bg-rose-500 hover:bg-rose-400 active:bg-rose-600'
              : 'bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600'
          "
        >
          {{ primaryLabel }}
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
