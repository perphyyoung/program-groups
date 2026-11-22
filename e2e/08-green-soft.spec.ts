import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";
import { launchApp, makeWorkdir } from "./e2e-helper";

test("绿色软件目录：全部 exe 收录，可手动忽略并提取图标", async () => {
  const base = await makeWorkdir("pg-green-e2e-");
  const appData = join(base, "appdata");
  const scanDir = join(base, "scan");
  const greenDir = join(base, "green");
  mkdirSync(appData, { recursive: true });
  mkdirSync(scanDir, { recursive: true });
  mkdirSync(join(greenDir, "Alpha"), { recursive: true });
  mkdirSync(join(greenDir, "Beta"), { recursive: true });
  const notepad = join(process.env["WINDIR"] ?? "C:\\Windows", "System32", "notepad.exe");
  copyFileSync(notepad, join(greenDir, "Alpha", "Alpha.exe"));
  copyFileSync(notepad, join(greenDir, "Alpha", "helper.exe"));
  copyFileSync(notepad, join(greenDir, "Beta", "Beta.exe"));

  const { app, page } = await launchApp(appData, scanDir, [greenDir]);
  try {
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
  } finally {
    await app.close().catch(() => undefined);
    rmSync(base, { recursive: true, force: true });
  }
});
