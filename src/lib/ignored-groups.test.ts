import { describe, expect, it } from "vitest";
import { filterIgnoredItems, groupIgnoredItems, IGNORE_REASON_LABELS } from "./ignored-groups";
import type { IgnoredItem, IgnoreReason } from "./types";

function item(name: string, reason: IgnoreReason, target = "C:\\Apps\\tool.exe"): IgnoredItem {
  const shortcutPath = `C:\\Start Menu\\${name}.lnk`;
  return {
    name,
    target,
    shortcutPath,
    reason,
    source: "start",
    launchKind: "lnk",
    launchPath: shortcutPath,
  };
}

describe("groupIgnoredItems", () => {
  it("按固定原因顺序分组，空组不返回", () => {
    const groups = groupIgnoredItems([item("乙", "help"), item("甲", "uninstall")], "");
    expect(groups.map((group) => group.reason)).toEqual(["uninstall", "help"]);
  });

  it("同组内按名称排序", () => {
    const groups = groupIgnoredItems([item("B", "help"), item("A", "help")], "");
    expect(groups[0]?.items.map((entry) => entry.name)).toEqual(["A", "B"]);
  });

  it("重复项固定最后一组，并保留 keptAs", () => {
    const duplicate = item("副本", "duplicate");
    duplicate.keptAs = "主入口";
    const groups = groupIgnoredItems([duplicate, item("帮助", "help")], "");
    expect(groups.map((group) => group.reason)).toEqual(["help", "duplicate"]);
    expect(groups[1]?.items[0]?.keptAs).toBe("主入口");
  });

  it("关键字只保留命中条目，无命中时返回空数组", () => {
    const items = [item("金山文档", "help", "C:\\WPS\\wps.exe"), item("卸载工具", "uninstall")];
    expect(groupIgnoredItems(items, "wps")[0]?.items).toHaveLength(1);
    expect(groupIgnoredItems(items, "不存在的词")).toEqual([]);
  });

  it("全局过滤已忽略项：名称或目标命中，按名称排序", () => {
    const items = [item("B", "help", "C:\\WPS\\wps.exe"), item("A", "help")];
    expect(filterIgnoredItems(items, "").map((entry) => entry.name)).toEqual(["A", "B"]);
    expect(filterIgnoredItems(items, "wps").map((entry) => entry.name)).toEqual(["B"]);
    expect(filterIgnoredItems(items, "不存在的词")).toEqual([]);
  });

  it("搜索已忽略项备注", () => {
    const items = [item("A", "help"), item("B", "help")];
    const notes = new Map([["C:\\Start Menu\\A.lnk", "清理工具"]]);
    const noteOf = (entry: IgnoredItem) => notes.get(entry.launchPath);
    expect(filterIgnoredItems(items, "清理", noteOf).map((entry) => entry.name)).toEqual(["A"]);
    expect(groupIgnoredItems(items, "清理", noteOf)[0]?.items.map((entry) => entry.name)).toEqual([
      "A",
    ]);
  });

  it("非 Store 打包应用单独分组", () => {
    const groups = groupIgnoredItems(
      [item("系统应用", "store-other"), item("卸载工具", "uninstall")],
      "",
    );
    expect(groups.map((group) => group.reason)).toEqual(["uninstall", "store-other"]);
    expect(groups[1]?.label).toBe("非 Store 打包应用");
  });

  it("每个原因都有中文标签", () => {
    for (const reason of Object.keys(IGNORE_REASON_LABELS)) {
      expect(IGNORE_REASON_LABELS[reason as IgnoreReason]).not.toBe("");
    }
  });
});
