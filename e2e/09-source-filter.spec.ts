import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createShortcut, launchApp, makeWorkdir, NOTEPAD_PATH } from "./e2e-helper";
import { expect, test } from "./fixtures";

test("未分组栏按来源筛选", async () => {
  const base = await makeWorkdir("pg-source-e2e-");
  const appData = join(base, "appdata");
  const scanDir = join(base, "scan");
  const greenDir = join(base, "green");
  mkdirSync(appData, { recursive: true });
  mkdirSync(scanDir, { recursive: true });
  mkdirSync(greenDir, { recursive: true });
  const notepad = NOTEPAD_PATH;
  createShortcut(scanDir, "开始应用", notepad);
  copyFileSync(notepad, join(greenDir, "绿色应用.exe"));

  const { app, page } = await launchApp(appData, scanDir, [greenDir]);
  try {
    /* 默认栏是近期变化，先切到未分组 */
    await page.getByRole("button", { name: "未分组", exact: true }).click();
    const startRow = page.getByRole("button", { name: "开始应用", exact: true });
    const greenRow = page.getByRole("button", { name: "绿色应用", exact: true });
    await expect(startRow).toBeVisible();
    await expect(greenRow).toBeVisible();
    await expect(page.getByText(/^扫描完成：新增 2，缺失 0，忽略 0，重复 0$/u)).toBeVisible();

    const filter = page.getByRole("group", { name: "按来源筛选", exact: true });
    const allChip = filter.getByRole("button", { name: "全部 2", exact: true });
    const startChip = filter.getByRole("button", { name: "start 1", exact: true });
    const greenChip = filter.getByRole("button", { name: "green 1", exact: true });
    await expect(allChip).toHaveAttribute("aria-pressed", "true");
    await expect(startChip).toBeVisible();
    await expect(greenChip).toBeVisible();

    await startChip.click();
    await expect(startChip).toHaveAttribute("aria-pressed", "true");
    await expect(startRow).toBeVisible();
    await expect(greenRow).toHaveCount(0);

    await greenChip.click();
    await expect(greenRow).toBeVisible();
    await expect(startRow).toHaveCount(0);

    const search = page.getByRole("searchbox", { name: "搜索应用", exact: true });
    await search.fill("开始");
    await expect(page.getByText("没有匹配的应用", { exact: true })).toBeVisible();
    await search.fill("绿色");
    await expect(greenRow).toBeVisible();
    await search.fill("");

    await allChip.click();
    await expect(startRow).toBeVisible();
    await expect(greenRow).toBeVisible();

    /* 切到其他栏再回来，来源筛选重置为全部 */
    await greenChip.click();
    await expect(startRow).toHaveCount(0);
    await page.getByRole("button", { name: "全部应用", exact: true }).click();
    await page.getByRole("button", { name: "未分组", exact: true }).click();
    await expect(allChip).toHaveAttribute("aria-pressed", "true");
    await expect(startRow).toBeVisible();
    await expect(greenRow).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(base, { recursive: true, force: true });
  }
});
