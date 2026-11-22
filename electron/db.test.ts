import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMembers,
  clearIconFiles,
  closeDatabase,
  countIconStats,
  countGreenAppsUnder,
  countMissing,
  createGroup,
  deleteGreenAppsUnder,
  deleteGroup,
  getGreenDirs,
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
  setEntryTypes,
  setGroupSortDirection,
  setGroupSortMode,
  setGreenDirs,
  setIconFiles,
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
    source: "start",
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

  it("图标缓存：只更新已存在应用，统计跟随", () => {
    reconcile([app("a", "看图王"), app("b", "VLC")], "2026-11-20T00:00:00.000Z");
    expect(countIconStats().start).toEqual({ cached: 0, total: 2 });
    expect(setIconFiles([{ id: "a", iconFile: "icons/a.png" }])).toBe(1);
    expect(countIconStats().start).toEqual({ cached: 1, total: 2 });
    expect(listActiveApps().find((item) => item.id === "a")?.iconFile).toBe("icons/a.png");
    expect(setIconFiles([{ id: "missing", iconFile: "icons/x.png" }])).toBe(0);
    clearIconFiles();
    expect(countIconStats().start).toEqual({ cached: 0, total: 2 });
    expect(listActiveApps().find((item) => item.id === "a")?.iconFile).toBeNull();
  });

  it("绿色软件目录：最多保存 5 个，JSON 往返", () => {
    expect(getGreenDirs()).toEqual([]);
    const dirs = ["C:\\a;b", "C:\\c", "C:\\d", "C:\\e", "C:\\f", "C:\\g"];
    setGreenDirs(dirs);
    expect(getGreenDirs()).toEqual(dirs.slice(0, 5));
    setGreenDirs([]);
    expect(getGreenDirs()).toEqual([]);
  });

  it("green 来源计入图标统计", () => {
    reconcile([{ ...app("g", "绿色工具"), source: "green" }], "2026-11-20T00:00:00.000Z");
    expect(countIconStats().green).toEqual({ cached: 0, total: 1 });
    expect(setIconFiles([{ id: "g", iconFile: "icons/green_g.png" }])).toBe(1);
    expect(countIconStats().green).toEqual({ cached: 1, total: 1 });
  });

  it("移除绿色目录：只删该目录下应用、备注与归属", () => {
    const ts = "2026-11-20T00:00:00.000Z";
    const green = (id: string, name: string, exePath: string): DiscoveredApp => ({
      ...app(id, name),
      exePath,
      launchPath: exePath,
      launchKind: "exe",
      source: "green",
    });
    reconcile(
      [
        green("g1", "One", "C:\\Green\\A\\One.exe"),
        green("g2", "Two", "C:\\Green\\AB\\Two.exe"),
        green("g3", "Three", "C:\\Green\\B\\Three.exe"),
        { ...app("s1", "Start"), exePath: "c:\\green\\a\\start.exe" },
      ],
      ts,
    );
    setNote("app:g1", "a");
    setNote("app:g2", "b");
    const group = createGroup("组");
    addMembers(["g1"], group.id);

    expect(countGreenAppsUnder("C:\\Green\\A")).toBe(1);
    expect(deleteGreenAppsUnder("C:\\Green\\A")).toBe(1);
    expect(
      listActiveApps()
        .map((item) => item.id)
        .toSorted(),
    ).toEqual(["g2", "g3", "s1"]);
    expect(listNotes()["app:g1"]).toBeUndefined();
    expect(listNotes()["app:g2"]).toBe("b");
    expect(listMemberships().filter((item) => item.appId === "g1")).toHaveLength(0);
  });

  it("entry_type：排除项不计入活动与缺失，有效发现后恢复", () => {
    reconcile([app("a", "看图王"), app("b", "VLC")], "2026-11-20T00:00:00.000Z");
    expect(setEntryTypes([{ id: "a", type: "uninstaller" }])).toBe(1);
    expect(setEntryTypes([{ id: "a", type: "uninstaller" }])).toBe(0);
    expect(
      listActiveApps()
        .map((item) => item.id)
        .toSorted(),
    ).toEqual(["b"]);
    expect(countMissing()).toBe(0);

    const second = reconcile([app("b", "VLC")], "2026-11-20T01:00:00.000Z");
    expect(second.missing).toBe(1);
    expect(countMissing()).toBe(0);

    const third = reconcile([app("a", "看图王"), app("b", "VLC")], "2026-11-20T02:00:00.000Z");
    expect(third.changed).toBe(true);
    expect(
      listActiveApps()
        .map((item) => item.id)
        .toSorted(),
    ).toEqual(["a", "b"]);
    expect(countMissing()).toBe(0);
  });

  it("旧库自动补 entry_type 列", () => {
    closeDatabase();
    const path = join(dir, "old.db");
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE apps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        launch_path TEXT NOT NULL,
        launch_kind TEXT NOT NULL,
        exe_path TEXT NOT NULL,
        icon_file TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `);
    old.close();

    openDatabase(path);
    closeDatabase();
    const check = new DatabaseSync(path);
    const columns = check.prepare("PRAGMA table_info(apps)").all() as unknown as { name: string }[];
    check.close();
    expect(columns.some((column) => column.name === "entry_type")).toBe(true);
    expect(columns.some((column) => column.name === "source")).toBe(true);
  });

  it("来源扫描失败不误标 missing", () => {
    const start = app("a", "看图王");
    const store: DiscoveredApp = {
      id: "store:s",
      name: "计算器",
      launchPath: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
      launchKind: "aumid",
      exePath: "",
      source: "store",
      iconFile: null,
    };

    reconcile([start, store], "2026-11-20T00:00:00.000Z", new Set(["start", "store"]));
    expect(countMissing()).toBe(0);

    reconcile([start], "2026-11-20T01:00:00.000Z", new Set(["start"]));
    expect(countMissing()).toBe(0);
    expect(
      listActiveApps()
        .map((item) => item.id)
        .toSorted(),
    ).toEqual(["a", "store:s"]);

    reconcile([start], "2026-11-20T02:00:00.000Z", new Set(["start", "store"]));
    expect(countMissing()).toBe(1);
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
