import type { EntryType, IgnoreReason, IgnoredItem } from "./types";
import { appIdForExe } from "./scan-rules";

/** 扫描忽略原因中，能确定“不是应用”的类型 */
const TYPE_BY_REASON: Partial<Record<IgnoreReason, EntryType>> = {
  uninstall: "uninstaller",
  installer: "installer",
  system: "system",
};

const PRIORITY: Record<EntryType, number> = {
  app: 0,
  system: 1,
  installer: 2,
  uninstaller: 3,
};

/** 把本次忽略项换算成已有应用行的入口类型；有效发现的应用跳过 */
export function entryTypesForIgnored(
  items: IgnoredItem[],
  discoveredIds: ReadonlySet<string>,
): { id: string; type: EntryType }[] {
  const byId = new Map<string, EntryType>();
  for (const item of items) {
    const type = TYPE_BY_REASON[item.reason];
    if (!type || !item.target) continue;
    const id = appIdForExe(item.target);
    if (discoveredIds.has(id)) continue;
    const current = byId.get(id);
    if (!current || PRIORITY[type] > PRIORITY[current]) byId.set(id, type);
  }
  return Array.from(byId, ([id, type]) => ({ id, type }));
}
