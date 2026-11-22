import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IgnoredItem, ScannedApp } from "../src/lib/types";
import { classifyStoreApps, parseStoreApps } from "../src/lib/store-apps";
import { log } from "./logger";

const execFileAsync = promisify(execFile);

const STORE_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$packages = @{}
foreach ($pkg in @(Get-AppxPackage)) {
  if (-not $pkg) { continue }
  $current = $packages[$pkg.PackageFamilyName]
  if (-not $current -or ($current.IsFramework -and -not $pkg.IsFramework)) {
    $packages[$pkg.PackageFamilyName] = $pkg
  }
}
$apps = foreach ($app in @(Get-StartApps | Where-Object { $_.AppID -like '*!*' })) {
  $family = ($app.AppID -split '!', 2)[0]
  $pkg = $packages[$family]
  [pscustomobject]@{
    Name = [string]$app.Name
    AppID = [string]$app.AppID
    SignatureKind = if ($pkg) { [string]$pkg.SignatureKind } else { "未知" }
  }
}
ConvertTo-Json -InputObject @($apps) -Compress
`;

export interface StoreScanResult {
  ok: boolean;
  apps: ScannedApp[];
  ignored: IgnoredItem[];
}

export async function scanStoreApps(): Promise<StoreScanResult> {
  const fixture = process.env["PG_STORE_JSON"];
  if (fixture !== undefined) {
    try {
      const result = classifyStoreApps(parseStoreApps(JSON.parse(fixture)));
      return { ok: true, ...result };
    } catch (error) {
      log.warn(
        `[scan] Store fixture 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, apps: [], ignored: [] };
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", STORE_SCRIPT],
      { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    const result = classifyStoreApps(parseStoreApps(JSON.parse(stdout.trim())));
    return { ok: true, ...result };
  } catch (error) {
    log.warn(`[scan] Store 扫描失败: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, apps: [], ignored: [] };
  }
}
