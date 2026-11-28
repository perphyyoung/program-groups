import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";
import { launchApp, makeWorkdir, NOTEPAD_PATH } from "./e2e-helper";

test("绿色软件目录：全部 exe 收录，可手动忽略并提取图标", async () => {
  const base = await makeWorkdir("pg-green-e2e-");
  const appData = join(base, "appdata");
  const scanDir = join(base, "scan");
  const greenDir = join(base, "green");
  mkdirSync(appData, { recursive: true });
  mkdirSync(scanDir, { recursive: true });
  mkdirSync(join(greenDir, "Alpha"), { recursive: true });
  mkdirSync(join(greenDir, "Beta"), { recursive: true });
  const notepad = NOTEPAD_PATH;
  copyFileSync(notepad, join(greenDir, "Alpha", "Alpha.exe"));
  copyFileSync(notepad, join(greenDir, "Alpha", "helper.exe"));
  copyFileSync(notepad, join(greenDir, "Beta", "Beta.exe"));

  const { app, page } = await launchApp(appData, scanDir, [greenDir]);
  try {
    /* 默认栏是近期变化，先切到未分组 */
    await page.getByRole("button", { name: "未分组", exact: true }).click();
    await expect(page.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "helper", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Beta", exact: true })).toBeVisible();
    await expect(page.getByText(/^扫描完成：新增 3，缺失 0，忽略 0，重复 0$/u)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Alpha", exact: true }).getByText("green", {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "手动忽略「helper」", exact: true }).click();
    await expect(page.getByRole("button", { name: "helper", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "绿色软件", exact: true })).toBeVisible();
    await expect(page.getByText(greenDir, { exact: true })).toBeVisible();
    await expect(page.getByText("1 / 5", { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: "green", exact: true }).check();
    await page.getByRole("button", { name: "更新图标缓存", exact: true }).click();
    await expect(page.getByText(/^图标缓存已更新：新增 3，复用 0，失败 0$/u)).toBeVisible();

    await page.getByRole("button", { name: "未分组", exact: true }).click();
    await expect(page.getByRole("img", { name: "Alpha", exact: true })).toHaveAttribute(
      "src",
      /^pg-icon:\/\//u,
    );

    /* 移除目录需要确认；取消或 Esc 保留，确认后删除该目录下的应用 */
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const removeButton = page.getByRole("button", {
      name: `移除 ${greenDir}`,
      exact: true,
    });
    const confirmDialog = page.getByRole("dialog", {
      name: "移除绿色软件目录？",
      exact: true,
    });

    await removeButton.click();
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
    await confirmDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByText("1 / 5", { exact: true })).toBeVisible();

    await removeButton.click();
    await expect(confirmDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByText("1 / 5", { exact: true })).toBeVisible();

    await removeButton.click();
    await confirmDialog.getByRole("button", { name: "移除目录", exact: true }).click();
    await expect(page.getByText("未选择目录", { exact: true })).toBeVisible();
    await expect(page.getByText(/^已移除绿色软件目录，删除 3 个应用$/u)).toBeVisible();
    await page.getByRole("button", { name: "未分组", exact: true }).click();
    await expect(page.getByRole("button", { name: "Alpha", exact: true })).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(base, { recursive: true, force: true });
  }
});
