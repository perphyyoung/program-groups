import type { AppEntry } from "./types";

/** 近期变化类型：新增 / 恢复（重新出现）/ 缺失 */
export type ChangeKind = "added" | "restored" | "missing";

export const RECENT_WINDOW_MIN = 1;
export const RECENT_WINDOW_MAX = 365;
export const DEFAULT_RECENT_WINDOW_DAYS = 7;

export interface RecentChangeGroups {
  added: AppEntry[];
  restored: AppEntry[];
  missing: AppEntry[];
}

/** n 天滚动窗口（n×24h）的起点；ISO 字符串等长，可直接字典序比较 */
export function recentCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isRecentWindowDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RECENT_WINDOW_MIN &&
    value <= RECENT_WINDOW_MAX
  );
}

/** 天数输入校验：非负整数且在窗口范围内；非法返回 null */
export function parseRecentWindowDays(value: string): number | null {
  if (!/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return isRecentWindowDays(parsed) ? parsed : null;
}

function byChangeTime(list: AppEntry[], timeOf: (app: AppEntry) => string): AppEntry[] {
  return list.toSorted(
    (a, b) => timeOf(b).localeCompare(timeOf(a)) || a.name.localeCompare(b.name, "zh-CN"),
  );
}

/**
 * 窗口内的三类变化；一个应用只归一类，判定优先级：新增 > 恢复 > 缺失。
 * 口径与全部应用栏一致：apps 已由调用方排除手动忽略，missing 只含 entry_type = 'app'。
 */
export function recentChanges(
  apps: AppEntry[],
  missingApps: AppEntry[],
  windowDays: number,
  now: Date = new Date(),
): RecentChangeGroups {
  const cutoff = recentCutoff(now, windowDays);
  const added: AppEntry[] = [];
  const restored: AppEntry[] = [];
  for (const app of apps) {
    if (app.firstSeenAt >= cutoff) added.push(app);
    else if (app.statusChangedAt !== null && app.statusChangedAt >= cutoff) restored.push(app);
  }
  const missing = missingApps.filter(
    (app) => app.statusChangedAt !== null && app.statusChangedAt >= cutoff,
  );
  return {
    added: byChangeTime(added, (app) => app.firstSeenAt),
    restored: byChangeTime(restored, (app) => app.statusChangedAt ?? ""),
    missing: byChangeTime(missing, (app) => app.statusChangedAt ?? ""),
  };
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** 行内展示的变化日期；解析失败返回空串 */
export function formatChangeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
