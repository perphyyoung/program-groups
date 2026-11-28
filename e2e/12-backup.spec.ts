import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createShortcut, launchApp, NOTEPAD_PATH, refreshLibrary } from "./e2e-helper";
import { expect, test } from "./fixtures";

/* 固定路径跨用例共享（retry 可能换 worker，模块变量不可靠；zip 落磁盘传递）：
   base/work 为每条用例的实例工作区，base/backup 存导出的 zip */
const base = join(tmpdir(), "pg-backup-e2e");
const backupDir = join(base, "backup");
const zipPath = join(backupDir, "pg-backup-e2e.zip");

function resetWorkDir(): { appData: string; scanDir: string } {
  const work = join(base, "work");
  rmSync(work, { recursive: true, force: true });
  const appData = join(work, "appdata");
  const scanDir = join(work, "scan");
  mkdirSync(appData, { recursive: true });
  mkdirSync(scanDir, { recursive: true });
  return { appData, scanDir };
}

test("导出：设置页导出备份 zip", async () => {
  const { appData, scanDir } = resetWorkDir();
  createShortcut(scanDir, "备份应用", NOTEPAD_PATH);
  mkdirSync(backupDir, { recursive: true });

  const { app, page } = await launchApp(appData, scanDir, [], { PG_BACKUP_DIR: backupDir });
  try {
    await refreshLibrary(page);
    await page.getByRole("button", { name: "新建分组", exact: true }).click();
    await page.getByLabel("分组名", { exact: true }).fill("备份组");
    await page.getByRole("button", { name: "创建分组", exact: true }).click();
    await expect(page.getByRole("button", { name: "备份组", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "导出备份", exact: true }).click();
    await expect(page.getByText("备份已导出", { exact: true })).toBeVisible();

    await expect.poll(() => existsSync(zipPath)).toBe(true);
    /* ZIP 文件头为 PK */
    expect(readFileSync(zipPath).subarray(0, 2).toString("latin1")).toBe("PK");
  } finally {
    await app.close().catch(() => undefined);
  }
});

test("导入：覆盖分组数据并恢复", async () => {
  /* 依赖 test1 导出的 zip（固定路径，跨 worker 稳定） */
  expect(existsSync(zipPath), "依赖导出用例的备份 zip").toBe(true);

  /* 破坏当前库：SQL 删分组（分组删除本身由 03 号覆盖），再启动确认已消失 */
  const db = new DatabaseSync(join(base, "work", "appdata", "pg.db"));
  db.exec("DELETE FROM groups");
  db.close();

  const { appData, scanDir } = resetWorkDir();
  createShortcut(scanDir, "备份应用", NOTEPAD_PATH);
  const { app, page } = await launchApp(appData, scanDir, [], { PG_BACKUP_DIR: backupDir });
  try {
    await expect(page.getByRole("button", { name: "备份组", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "导入备份", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "导入备份？", exact: true });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/备份包含应用 1 个、分组 1 个/u)).toBeVisible();
    await expect(confirm.getByRole("button", { name: "取消", exact: true })).toBeFocused();
    await confirm.getByRole("button", { name: "导入备份", exact: true }).click();

    /* 结果导向断言：分组恢复；「备份已导入」提示会被导入后自动扫描的完成提示覆盖，不断言 */
    await page.getByRole("button", { name: "未分组", exact: true }).click();
    await expect(page.getByRole("button", { name: "备份组", exact: true })).toBeVisible();
    await expect(page.getByText(/^扫描完成：/u)).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
  }
});
