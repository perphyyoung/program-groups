import { copyFileSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  createShortcuts,
  launchApp,
  makeWorkdir,
  NOTEPAD_PATH,
  refreshLibrary,
} from "./e2e-helper";
import { expect, test } from "./fixtures";

test("缺失应用：查看、逐个 / 勾选批量删除", async () => {
  const base = await makeWorkdir("pg-missing-e2e-");
  const appData = join(base, "appdata");
  const scanDir = join(base, "scan");
  const targets = join(base, "targets");
  const greenDir = join(base, "green");
  mkdirSync(appData, { recursive: true });
  mkdirSync(targets, { recursive: true });
  mkdirSync(greenDir, { recursive: true });
  const notepad = NOTEPAD_PATH;
  /* 三个快捷方式指向不同 exe，否则同应用会被去重成一个 */
  const shortcuts = ["缺失甲", "缺失乙", "缺失丙"].map((name) => {
    const target = join(targets, `${name}.exe`);
    copyFileSync(notepad, target);
    return { name, target };
  });
  createShortcuts(scanDir, shortcuts);
  /* green 缺失项用于验证来源筛选：扫描后删除 exe */
  copyFileSync(notepad, join(greenDir, "缺失绿.exe"));

  const { app, page } = await launchApp(appData, scanDir, [greenDir]);
  try {
    await expect(page.getByRole("button", { name: "缺失甲", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "缺失绿", exact: true })).toBeVisible();
    for (const name of ["缺失甲", "缺失乙", "缺失丙"]) {
      unlinkSync(join(scanDir, `${name}.lnk`));
    }
    unlinkSync(join(greenDir, "缺失绿.exe"));
    await refreshLibrary(page);
    await expect(page.getByText(/^扫描完成：新增 0，缺失 4，忽略 0，重复 0$/u)).toBeVisible();

    const missingNav = page.getByRole("button", { name: "缺失应用", exact: true });
    await missingNav.click();
    await expect(page.getByRole("heading", { name: "缺失应用", exact: true })).toBeVisible();
    await expect(page.getByText("共 4 个缺失应用", { exact: true })).toBeVisible();
    /* 数据库存规范化小写路径，用锚定正则忽略大小写 */
    await expect(page.getByText(/targets\\缺失甲\.exe$/iu)).toBeVisible();

    /* 来源筛选：全选只作用于当前筛选结果 */
    await page.getByRole("button", { name: "green 1", exact: true }).click();
    await expect(page.getByText("共 1 个缺失应用", { exact: true })).toBeVisible();
    await expect(page.getByText("缺失绿", { exact: true })).toBeVisible();
    await expect(page.getByText("缺失甲", { exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "全选缺失应用", exact: true }).check();
    await expect(page.getByText("已选 1 项", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "删除所选", exact: true }).click();
    const filteredDialog = page.getByRole("dialog", {
      name: "删除 1 个缺失应用？",
      exact: true,
    });
    await filteredDialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText(/^已删除 1 个缺失应用$/u)).toBeVisible();
    await expect(page.getByText("共 3 个缺失应用", { exact: true })).toBeVisible();

    /* 逐个删除：确认框默认聚焦取消，取消保留 */
    const firstDialog = page.getByRole("dialog", {
      name: "删除缺失应用「缺失甲」？",
      exact: true,
    });
    await page.getByRole("button", { name: "删除「缺失甲」", exact: true }).click();
    await expect(firstDialog).toBeVisible();
    await expect(firstDialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
    await firstDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(firstDialog).toBeHidden();
    await expect(page.getByText("缺失甲", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "删除「缺失甲」", exact: true }).click();
    await firstDialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText("共 2 个缺失应用", { exact: true })).toBeVisible();
    await expect(page.getByText("缺失甲", { exact: true })).toHaveCount(0);

    /* 批量删除：勾选后从底部选择栏删除 */
    await page.getByRole("checkbox", { name: "选择「缺失乙」", exact: true }).check();
    await expect(page.getByText("已选 1 项", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "删除所选", exact: true }).click();
    const batchDialog = page.getByRole("dialog", {
      name: "删除 1 个缺失应用？",
      exact: true,
    });
    await batchDialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText("缺失乙", { exact: true })).toHaveCount(0);
    await expect(page.getByText("共 1 个缺失应用", { exact: true })).toBeVisible();

    /* 清空剩余：全选后删除所选 */
    await page.getByRole("checkbox", { name: "全选缺失应用", exact: true }).check();
    await expect(page.getByText("已选 1 项", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "删除所选", exact: true }).click();
    const allDialog = page.getByRole("dialog", {
      name: "删除 1 个缺失应用？",
      exact: true,
    });
    await expect(allDialog.getByText(/不会删除磁盘文件/u)).toBeVisible();
    await allDialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText("没有缺失应用", { exact: true })).toBeVisible();
    await expect(page.getByText("共 0 个缺失应用", { exact: true })).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(base, { recursive: true, force: true });
  }
});
