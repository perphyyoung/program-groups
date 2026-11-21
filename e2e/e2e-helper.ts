import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
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

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

/**
 * 启动应用。args 必须是 "."：
 * 传 out/main/main.js 会让 app.getAppPath() 指向 out/main，preload 路径拼错。
 */
export async function launchApp(appData: string, scanDir: string): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: ["."],
    env: e2eEnv({ E2E: "1", PG_DATA_DIR: appData, PG_SCAN_DIRS: scanDir }),
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
