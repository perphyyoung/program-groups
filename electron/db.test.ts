import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMembers,
  closeDatabase,
  countMissing,
  createGroup,
  deleteGroup,
  getGroupSortDirection,
  getGroupSortMode,
  listActiveApps,
  listGroups,
  listManualIgnoredIds,
  listMemberships,
  listNotes,
  manualIgnoreApp,
  openDatabase,
  reconcile,
  removeMembers,
  renameGroup,
  reorderGroups,
  restoreManualApp,
  setGroupSortDirection,
  setGroupSortMode,
  setNote,
  type DiscoveredApp,
} from "./db";

let dir: string;

function app(id: string, name: string): DiscoveredApp {
  return {
    id,
    name,
    launchPath: `C:\\Start\\${name}.lnk`,
    launchKind: "lnk",
    exePath: `C:\\Apps\\${name}.exe`,
    targetPath: `C:\\Apps\\${name}.exe`,
    arguments: "",
    iconLocation: null,
    iconIndex: null,
    relativePath: `${name}.lnk`,
    iconFile: null,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-db-"));
  openDatabase(join(dir, "pg.db"));
});

afterEach(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe("database", () => {
  it("扫描对账：新增、更新、缺失", () => {
    const first = reconcile([app("a", "看图王"), app("b", "VLC")], "2026-11-20T00:00:00.000Z");
    expect(first).toEqual({ added: 2, updated: 0, missing: 0, changed: true });
    expect(listActiveApps()).toHaveLength(2);

    const second = reconcile([app("a", "看图王")], "2026-11-20T01:00:00.000Z");
    expect(second).toEqual({ added: 0, updated: 1, missing: 1, changed: true });
    expect(listActiveApps().map((item) => item.id)).toEqual(["a"]);
    expect(countMissing()).toBe(1);

    const third = reconcile([app("a", "看图王")], "2026-11-20T02:00:00.000Z");
    expect(third.changed).toBe(false);
  });

  it("分组与多对多归属；删组不删应用", () => {
    reconcile([app("a", "看图王"), app("b", "VLC")], "2026-11-20T00:00:00.000Z");
    const photo = createGroup("看图");
    const common = createGroup("常用");
    addMembers(["a"], photo.id);
    addMembers(["a", "b"], common.id);

    expect(listGroups().map((group) => group.name)).toEqual(["看图", "常用"]);
    expect(listMemberships()).toHaveLength(3);

    removeMembers(["a"], photo.id);
    expect(listMemberships().filter((item) => item.groupId === photo.id)).toHaveLength(0);

    deleteGroup(common.id);
    expect(listActiveApps()).toHaveLength(2);
    expect(listMemberships()).toHaveLength(0);
  });

  it("缺失后重新出现，归属保留", () => {
    reconcile([app("a", "看图王")], "2026-11-20T00:00:00.000Z");
    const group = createGroup("看图");
    addMembers(["a"], group.id);

    reconcile([], "2026-11-20T01:00:00.000Z");
    expect(countMissing()).toBe(1);

    reconcile([app("a", "看图王")], "2026-11-20T02:00:00.000Z");
    expect(countMissing()).toBe(0);
    expect(listMemberships()).toEqual([{ appId: "a", groupId: group.id }]);
  });

  it("分组改名；空名由主进程校验，DB 不重复校验", () => {
    const group = createGroup("看图");
    renameGroup(group.id, "图像");
    expect(listGroups()[0]?.name).toBe("图像");
  });

  it("手动忽略：记录持久化，加入分组后自动恢复", () => {
    reconcile([app("a", "看图王")], "2026-11-20T00:00:00.000Z");
    const group = createGroup("看图");

    manualIgnoreApp("a");
    expect(listManualIgnoredIds().has("a")).toBe(true);

    addMembers(["a"], group.id);
    expect(listManualIgnoredIds().has("a")).toBe(false);

    manualIgnoreApp("a");
    restoreManualApp("a");
    expect(listManualIgnoredIds().has("a")).toBe(false);
  });

  it("分组排序：手动顺序持久化，排序方式读写与校验", () => {
    const a = createGroup("A");
    const b = createGroup("B");
    const c = createGroup("C");

    expect(getGroupSortMode()).toBe("manual");
    setGroupSortMode("name");
    expect(getGroupSortMode()).toBe("name");
    setGroupSortMode("created");
    expect(getGroupSortMode()).toBe("created");

    expect(getGroupSortDirection()).toBe("asc");
    setGroupSortDirection("desc");
    expect(getGroupSortDirection()).toBe("desc");

    reorderGroups([c.id, a.id, b.id]);
    expect(listGroups().map((group) => group.name)).toEqual(["C", "A", "B"]);

    expect(() => reorderGroups([a.id, b.id])).toThrow("分组已变化");
    expect(() => reorderGroups([a.id, a.id, b.id])).toThrow("分组已变化");
    expect(() => reorderGroups([a.id, b.id, "missing"])).toThrow("分组已变化");
  });

  it("备注：写入、更新、清空", () => {
    setNote("app:a", "截图");
    setNote("shortcut:C:\\Start\\A.lnk", "帮助文档");
    expect(listNotes()).toEqual({
      "app:a": "截图",
      "shortcut:C:\\Start\\A.lnk": "帮助文档",
    });

    setNote("app:a", "看图");
    expect(listNotes()["app:a"]).toBe("看图");

    setNote("app:a", "");
    expect(listNotes()).toEqual({ "shortcut:C:\\Start\\A.lnk": "帮助文档" });
  });
});
