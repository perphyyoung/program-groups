import type { IgnoreReason, IgnoredItem } from "./types";

export const IGNORE_REASON_LABELS: Record<IgnoreReason, string> = {
  uninstall: "卸载入口",
  help: "帮助/说明",
  website: "官网/更新",
  system: "系统工具",
  installer: "安装程序",
  "store-auto-ignore": "Store 自动忽略应用",
  unreadable: "快捷方式无法解析",
  "invalid-target": "目标不是可执行文件",
  "missing-target": "目标文件不存在",
  "invalid-name": "名称为空",
  duplicate: "重复快捷方式",
};

/** 对象字面量的键序即分组展示顺序；重复项固定最后 */
const REASON_ORDER = Object.keys(IGNORE_REASON_LABELS) as IgnoreReason[];

export interface IgnoreGroup {
  reason: IgnoreReason;
  label: string;
  items: IgnoredItem[];
}

/** 已忽略项的全局搜索：匹配名称、目标路径与备注，按名称排序 */
export function filterIgnoredItems(
  items: IgnoredItem[],
  keyword: string,
  noteOf?: (item: IgnoredItem) => string | undefined,
): IgnoredItem[] {
  const normalized = keyword.trim().toLowerCase();
  return items
    .filter((item) => {
      if (!normalized) return true;
      return `${item.name}\n${item.target}\n${noteOf?.(item) ?? ""}`
        .toLowerCase()
        .includes(normalized);
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/** 按忽略原因归类；关键字只保留命中的条目，空组不返回 */
export function groupIgnoredItems(
  items: IgnoredItem[],
  keyword: string,
  noteOf?: (item: IgnoredItem) => string | undefined,
): IgnoreGroup[] {
  const buckets = new Map<IgnoreReason, IgnoredItem[]>();

  for (const item of filterIgnoredItems(items, keyword, noteOf)) {
    const bucket = buckets.get(item.reason);
    if (bucket) bucket.push(item);
    else buckets.set(item.reason, [item]);
  }

  const groups: IgnoreGroup[] = [];
  for (const reason of REASON_ORDER) {
    const groupItems = buckets.get(reason);
    if (!groupItems || groupItems.length === 0) continue;
    groups.push({
      reason,
      label: IGNORE_REASON_LABELS[reason],
      items: groupItems,
    });
  }
  return groups;
}
