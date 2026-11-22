import { describe, expect, it } from "vitest";
import { entryTypesForIgnored } from "./entry-types";
import type { IgnoredItem } from "./types";

function ignored(target: string, reason: IgnoredItem["reason"]): IgnoredItem {
  const shortcutPath = `${target}.lnk`;
  return {
    name: reason,
    target,
    shortcutPath,
    reason,
    source: "start",
    launchKind: "lnk",
    launchPath: shortcutPath,
  };
}

describe("entryTypesForIgnored", () => {
  it("卸载器、安装器、系统工具分别映射", () => {
    expect(
      entryTypesForIgnored(
        [
          ignored("C:\\Apps\\unins000.exe", "uninstall"),
          ignored("C:\\Apps\\setup.exe", "installer"),
          ignored("C:\\Windows\\System32\\cmd.exe", "system"),
        ],
        new Set(),
      ).map((item) => item.type),
    ).toEqual(["uninstaller", "installer", "system"]);
  });

  it("同一 ID 多原因时卸载器优先", () => {
    const result = entryTypesForIgnored(
      [ignored("C:\\Apps\\unins000.exe", "system"), ignored("C:\\Apps\\unins000.exe", "uninstall")],
      new Set(),
    );
    expect(result).toEqual([{ id: expect.any(String), type: "uninstaller" }]);
  });

  it("本次有效发现的应用跳过", () => {
    const items = [ignored("C:\\Apps\\unins000.exe", "uninstall")];
    const id = entryTypesForIgnored(items, new Set())[0]?.id ?? "";
    expect(entryTypesForIgnored(items, new Set([id]))).toEqual([]);
  });

  it("缺失目标、重复、帮助类不写类型", () => {
    expect(
      entryTypesForIgnored(
        [
          ignored("C:\\Apps\\missing.exe", "missing-target"),
          ignored("C:\\Apps\\dup.exe", "duplicate"),
          ignored("C:\\Apps\\help.exe", "help"),
        ],
        new Set(),
      ),
    ).toEqual([]);
  });
});
