import { describe, expect, it, vi } from "vitest";
import { useNoteEditor } from "./use-note-editor";

function keyboardEvent(init: { isComposing?: boolean; keyCode?: number }): KeyboardEvent {
  return {
    preventDefault: vi.fn(),
    isComposing: init.isComposing ?? false,
    keyCode: init.keyCode ?? 13,
  } as unknown as KeyboardEvent;
}

describe("useNoteEditor", () => {
  it("输入法组合中的 Enter 只阻止默认行为，不保存", async () => {
    const saved: string[] = [];
    const editor = useNoteEditor(
      () => "旧备注",
      (note) => saved.push(note),
      { value: null },
    );
    await editor.startEdit();
    editor.draft.value = "新备注";
    const event = keyboardEvent({ isComposing: true });
    editor.onEnter(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(editor.editing.value).toBe(true);
  });

  it("普通 Enter 保存并退出编辑，keyCode 229 仍视为组合中", async () => {
    const saved: string[] = [];
    const editor = useNoteEditor(
      () => "旧备注",
      (note) => saved.push(note),
      { value: null },
    );
    await editor.startEdit();
    editor.draft.value = "新备注";
    editor.onEnter(keyboardEvent({ keyCode: 229 }));
    expect(saved).toEqual([]);
    expect(editor.editing.value).toBe(true);
    editor.onEnter(keyboardEvent({}));
    expect(saved).toEqual(["新备注"]);
    expect(editor.editing.value).toBe(false);
  });
});
