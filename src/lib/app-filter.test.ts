import { describe, expect, it } from "vitest";
import { filterApps, matchesSearch } from "./app-filter";
import type { AppView } from "./types";

function app(id: string, name: string, groupIds: string[] = []): AppView {
  return {
    id,
    name,
    launchPath: `C:\\Apps\\${name}.lnk`,
    launchKind: "lnk",
    exePath: `C:\\Apps\\${name}.exe`,
    iconFile: null,
    status: "active",
    firstSeenAt: "2026-11-20T00:00:00.000Z",
    lastSeenAt: "2026-11-20T00:00:00.000Z",
    groupIds,
    iconUrl: null,
  };
}

const apps = [app("1", "看图王"), app("2", "VLC", ["media"]), app("3", "记事本", ["office"])];

describe("filterApps", () => {
  it("全部视图按名称排序", () => {
    expect(filterApps(apps, { kind: "all" }, "").map((item) => item.name)).toEqual([
      "记事本",
      "看图王",
      "VLC",
    ]);
  });

  it("未分组只保留没有归属的应用", () => {
    expect(filterApps(apps, { kind: "ungrouped" }, "").map((item) => item.id)).toEqual(["1"]);
  });

  it("分组视图只保留该组应用", () => {
    expect(
      filterApps(apps, { kind: "group", groupId: "media" }, "").map((item) => item.id),
    ).toEqual(["2"]);
  });

  it("搜索名称与 exe 文件名，不区分大小写", () => {
    expect(matchesSearch(apps[1]!, "vlc")).toBe(true);
    expect(matchesSearch(apps[1]!, "vlc.exe")).toBe(true);
    expect(matchesSearch(apps[0]!, "记事")).toBe(false);
  });
});
