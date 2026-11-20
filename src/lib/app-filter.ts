import type { AppView, AppViewFilter } from "./types";

export function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/u);
  return parts[parts.length - 1] ?? filePath;
}

export function matchesSearch(app: AppView, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  return (
    app.name.toLowerCase().includes(kw) || fileBaseName(app.exePath).toLowerCase().includes(kw)
  );
}

export function inView(app: AppView, view: AppViewFilter): boolean {
  if (view.kind === "ungrouped") return app.groupIds.length === 0;
  if (view.kind === "group") return app.groupIds.includes(view.groupId);
  return true;
}

/** 当前视图 + 搜索，按名称排序；渲染层只使用这一套过滤口径 */
export function filterApps(apps: AppView[], view: AppViewFilter, keyword: string): AppView[] {
  return apps
    .filter((app) => inView(app, view) && matchesSearch(app, keyword))
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
