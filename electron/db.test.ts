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
  listActiveApps,
  listGroups,
  listMemberships,
  openDatabase,
  reconcile,
  removeMembers,
  renameGroup,
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
    expect(first).toEqual({ added: 2, updated: 0, missing: 0 });
    expect(listActiveApps()).toHaveLength(2);

    const second = reconcile([app("a", "看图王")], "2026-11-20T01:00:00.000Z");
    expect(second).toEqual({ added: 0, updated: 1, missing: 1 });
    expect(listActiveApps().map((item) => item.id)).toEqual(["a"]);
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
});
