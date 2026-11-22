import type { AppEntry, AppScope } from "./types";

export function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/u);
  return parts[parts.length - 1] ?? filePath;
}

export function matchesSearch(
  app: AppEntry,
  keyword: string,
  noteOf?: (app: AppEntry) => string | undefined,
): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  return (
    app.name.toLowerCase().includes(kw) ||
    fileBaseName(app.exePath).toLowerCase().includes(kw) ||
    (noteOf?.(app) ?? "").toLowerCase().includes(kw)
  );
}

export function inScope(app: AppEntry, scope: AppScope): boolean {
  if (scope.kind === "ungrouped") return app.groupIds.length === 0;
  if (scope.kind === "group") return app.groupIds.includes(scope.groupId);
  if (scope.kind === "ignored" || scope.kind === "settings") return false;
  return true;
}

/** 当前栏 + 搜索，按名称排序；渲染层只使用这一套过滤口径 */
export function filterApps(
  apps: AppEntry[],
  scope: AppScope,
  keyword: string,
  noteOf?: (app: AppEntry) => string | undefined,
): AppEntry[] {
  return apps
    .filter((app) => inScope(app, scope) && matchesSearch(app, keyword, noteOf))
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
