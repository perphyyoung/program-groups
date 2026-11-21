import { describe, expect, it } from "vitest";
import {
  buildRowMenu,
  type RowMenuActions,
  type RowMenuExists,
  type RowMenuPaths,
} from "./row-menu";

const actions: RowMenuActions = {
  run: () => undefined,
  revealTarget: () => undefined,
  revealLink: () => undefined,
};

const paths: RowMenuPaths = {
  run: "C:\\Start\\测试应用.lnk",
  target: "C:\\Apps\\测试应用.exe",
  link: "C:\\Start\\测试应用.lnk",
};

const exists: RowMenuExists = { run: true, target: true, link: true };

describe("buildRowMenu", () => {
  it("按启动、目标路径、链接路径的顺序生成，并在启动后分隔", () => {
    const items = buildRowMenu(paths, exists, actions);
    expect(items.map((item) => item.label)).toEqual(["启动", "打开目标路径", "打开链接路径"]);
    expect(items.every((item) => !item.disabled)).toBe(true);
    expect(items[0]?.separatorAfter).toBe(true);
  });

  it("没有链接路径时禁用并说明原因", () => {
    const items = buildRowMenu({ ...paths, link: null }, exists, actions);
    expect(items[2]).toMatchObject({ disabled: true, title: "该行没有链接路径" });
  });

  it("目标路径不存在时禁用并说明原因", () => {
    const items = buildRowMenu(paths, { ...exists, target: false }, actions);
    expect(items[1]).toMatchObject({ disabled: true, title: "目标路径不存在" });
  });

  it("启动路径不存在时禁用并说明原因", () => {
    const items = buildRowMenu(paths, { ...exists, run: false }, actions);
    expect(items[0]).toMatchObject({ disabled: true, title: "启动路径不存在" });
  });
});
