import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

let dataDir = "";
let scanDir = "";
let app: ElectronApplication | null = null;
let page: Page | null = null;

function e2eEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env["ELECTRON_RENDERER_URL"];
  return { ...env, ...extra };
}

function createShortcut(directory: string, name: string, target: string): void {
  mkdirSync(directory, { recursive: true });
  const shortcutPath = join(directory, `${name}.lnk`);
  const escapedPath = shortcutPath.replace(/'/gu, "''");
  const escapedTarget = target.replace(/'/gu, "''");
  const script =
    "$ws = New-Object -ComObject WScript.Shell; " +
    `$s = $ws.CreateShortcut('${escapedPath}'); ` +
    `$s.TargetPath = '${escapedTarget}'; ` +
    "$s.Save()";
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
}

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await electron.launch({
    args: ["."],
    env: e2eEnv({ E2E: "1", PG_DATA_DIR: dataDir, PG_SCAN_DIRS: scanDir }),
  });
  const firstWindow = await launched.firstWindow();
  return { app: launched, page: firstWindow };
}

test.beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "pg-e2e-data-"));
  scanDir = mkdtempSync(join(tmpdir(), "pg-e2e-scan-"));
  const target = join(process.env["WINDIR"] ?? "C:\\Windows", "System32", "notepad.exe");
  createShortcut(scanDir, "测试应用", target);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scanDir, { recursive: true, force: true });
});

test("扫描、分组、多组与重启持久化", async () => {
  test.setTimeout(60_000);
  const launched = await launch();
  app = launched.app;
  page = launched.page;

  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appCard).toBeVisible();

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await page.getByLabel("分组名").fill("测试组");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "未分组", exact: true }).click();
  await appCard.click();
  await page.getByLabel("选择分组").selectOption({ label: "测试组" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toContainText("1");

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await page.getByLabel("分组名").fill("常用");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  await appCard.click();
  await page.getByLabel("选择分组").selectOption({ label: "常用" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "常用", exact: true })).toContainText("1");
  await expect(appCard).toContainText("测试组");
  await expect(appCard).toContainText("常用");

  await launched.app.close();
  app = null;
  page = null;

  const relaunched = await launch();
  app = relaunched.app;
  page = relaunched.page;
  await expect(page.getByRole("button", { name: "全部应用", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试应用", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "常用", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "测试应用", exact: true })).toContainText("测试组");
});
