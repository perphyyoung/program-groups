import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
/** 测试目标 exe：Windows 自带记事本，稳定存在 */
export const NOTEPAD_PATH = join(process.env["WINDIR"] ?? "C:\\Windows", "System32", "notepad.exe");
/** 复制当前环境变量，并剔除会让应用走 dev 模式的变量 */
export function e2eEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env["ELECTRON_RENDERER_URL"];
  return { ...env, ...extra };
}

/** 建一次性工作目录，由调用方负责清理 */
export function makeWorkdir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** 用 WScript.Shell 生成 .lnk，供扫描 fixture 使用 */
export function createShortcut(directory: string, name: string, target: string): void {
  createShortcuts(directory, [{ name, target }]);
}

/** 一次 PowerShell 调用创建多个快捷方式，避免逐条启动进程 */
export function createShortcuts(
  directory: string,
  shortcuts: { name: string; target: string }[],
): void {
  if (shortcuts.length === 0) return;
  mkdirSync(directory, { recursive: true });
  const steps = shortcuts
    .map(({ name, target }) => {
      const shortcutPath = join(directory, `${name}.lnk`).replace(/'/gu, "''");
      const escapedTarget = target.replace(/'/gu, "''");
      return (
        `$s = $ws.CreateShortcut('${shortcutPath}'); ` +
        `$s.TargetPath = '${escapedTarget}'; ` +
        "$s.Save()"
      );
    })
    .join("; ");
  const script = `$ws = New-Object -ComObject WScript.Shell; ${steps}`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

/**
 * 点「刷新」并等按钮恢复可用：扫描期间按钮 disabled，
 * 扫描中守卫会直接 return，连发第二次刷新会被吞，必须等 enabled 再继续。
 */
export async function refreshLibrary(page: Page): Promise<void> {
  const refreshButton = page.getByRole("button", { name: "刷新", exact: true });
  await refreshButton.click();
  await expect(refreshButton).toBeEnabled();
}

/**
 * 启动应用。args 必须是 "."：
 * 传 out/main/main.js 会让 app.getAppPath() 指向 out/main，preload 路径拼错。
 */
export async function launchApp(
  appData: string,
  scanDir: string,
  greenDirs: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: ["."],
    env: e2eEnv({
      E2E: "1",
      PG_DATA_DIR: appData,
      PG_SCAN_DIRS: scanDir,
      PG_STORE_JSON: "[]",
      PG_GREEN_DIRS: greenDirs.join(";"),
      ...extraEnv,
    }),
  });
  const page = await app.firstWindow();
  return { app, page };
}

/** 分组行没有独立角色，顺序本身是断言对象，用 data-group-row 读取 aria-label */
export async function groupOrder(page: Page): Promise<string[]> {
  return page
    .getByRole("navigation")
    .locator("[data-group-row]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label") ?? ""));
}
