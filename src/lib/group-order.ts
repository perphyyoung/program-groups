import type { GroupEntry, GroupSortMode } from "./types";

export function isGroupSortMode(value: unknown): value is GroupSortMode {
  return value === "manual" || value === "name" || value === "created";
}

/** 手动顺序来自 groups.sort；名称 / 创建顺序只改变展示，不覆盖手动顺序 */
export function sortGroups(groups: GroupEntry[], mode: GroupSortMode): GroupEntry[] {
  const list = [...groups];
  if (mode === "name") {
    list.sort(
      (a, b) =>
        a.name.localeCompare(b.name, "zh-CN") || a.sort - b.sort || a.id.localeCompare(b.id),
    );
  } else if (mode === "created") {
    list.sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.name.localeCompare(b.name, "zh-CN") ||
        a.id.localeCompare(b.id),
    );
  } else {
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN"));
  }
  return list;
}

/** 把 fromId 移动到插入点 insertIndex（基于原数组的插入位置），返回新顺序 */
export function moveGroupOrder(ids: string[], fromId: string, insertIndex: number): string[] {
  const from = ids.indexOf(fromId);
  if (from < 0) return [...ids];
  const without = ids.filter((id) => id !== fromId);
  const target = Math.max(
    0,
    Math.min(from < insertIndex ? insertIndex - 1 : insertIndex, without.length),
  );
  without.splice(target, 0, fromId);
  return without;
}
