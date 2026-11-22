import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScannedApp } from "../src/lib/types";
import { parseStoreApps, toStoreApps } from "../src/lib/store-apps";
import { log } from "./logger";

const execFileAsync = promisify(execFile);

const STORE_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$apps = @(Get-StartApps | Where-Object { $_.AppID -like '*!*' } | Select-Object Name,AppID)
ConvertTo-Json -InputObject $apps -Compress
`;

export async function scanStoreApps(): Promise<{ ok: boolean; apps: ScannedApp[] }> {
  const fixture = process.env["PG_STORE_JSON"];
  if (fixture !== undefined) {
    try {
      return { ok: true, apps: toStoreApps(parseStoreApps(JSON.parse(fixture))) };
    } catch (error) {
      log.warn(
        `[scan] Store fixture 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, apps: [] };
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", STORE_SCRIPT],
      { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    return { ok: true, apps: toStoreApps(parseStoreApps(JSON.parse(stdout.trim()))) };
  } catch (error) {
    log.warn(`[scan] Store 扫描失败: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, apps: [] };
  }
}
