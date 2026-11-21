import { nextTick, ref } from "vue";

type NoteInput = { readonly value: HTMLInputElement | null };

/** 行内单行备注编辑：Enter 保存、Esc 取消、失焦保存，并避开输入法确认键 */
export function useNoteEditor(
  note: () => string | undefined,
  save: (note: string) => void,
  inputRef: NoteInput,
) {
  const editing = ref(false);
  const draft = ref("");

  async function startEdit(): Promise<void> {
    const value = note();
    if (value === undefined) return;
    draft.value = value;
    editing.value = true;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  }

  function commit(): void {
    if (!editing.value) return;
    editing.value = false;
    const next = draft.value.trim();
    if (next !== (note() ?? "")) save(next);
  }

  function cancel(): void {
    editing.value = false;
  }

  function onEnter(event: KeyboardEvent): void {
    event.preventDefault();
    if (event.isComposing || event.keyCode === 229) return;
    commit();
  }

  return { editing, draft, startEdit, commit, cancel, onEnter };
}
