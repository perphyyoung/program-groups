import { spawn } from "node:child_process";
import type { IgnoredItem, ScanProgress, ScannedApp } from "../src/lib/types";
import { parseStoreProgressLine } from "../src/lib/store-progress";
import { classifyStoreApps, parseStoreApps } from "../src/lib/store-apps";
import { log } from "./logger";

const STORE_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Send-Progress([int]$done, [int]$total, [string]$detail) {
  [Console]::Out.WriteLine("PGPROGRESS $done $total $detail")
  [Console]::Out.Flush()
}
Send-Progress 0 3 "读取应用包"
$packages = @{}
foreach ($pkg in @(Get-AppxPackage)) {
  if (-not $pkg) { continue }
  $current = $packages[$pkg.PackageFamilyName]
  if (-not $current -or ($current.IsFramework -and -not $pkg.IsFramework)) {
    $packages[$pkg.PackageFamilyName] = $pkg
  }
}
Send-Progress 1 3 "读取 Store 启动项"
$startApps = @(Get-StartApps | Where-Object { $_.AppID -like '*!*' })
Send-Progress 2 3 "分类 Store 应用"
$apps = foreach ($app in $startApps) {
  $family = ($app.AppID -split '!', 2)[0]
  $pkg = $packages[$family]
  [pscustomobject]@{
    Name = [string]$app.Name
    AppID = [string]$app.AppID
    SignatureKind = if ($pkg) { [string]$pkg.SignatureKind } else { "未知" }
  }
}
Send-Progress 3 3 "完成"
[Console]::Out.WriteLine("PGRESULT " + (ConvertTo-Json -InputObject @($apps) -Compress))
`;

export interface StoreScanResult {
  ok: boolean;
  apps: ScannedApp[];
  ignored: IgnoredItem[];
}

const STORE_TIMEOUT_MS = 15000;

function runStoreScript(onProgress?: (progress: ScanProgress) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", STORE_SCRIPT],
      { windowsHide: true },
    );
    let buffer = "";
    let result = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (error: Error | null, value?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? "");
    };

    const handleLine = (line: string): void => {
      const parsed = parseStoreProgressLine(line);
      if (!parsed) return;
      if (parsed.kind === "result") {
        result = parsed.raw;
        return;
      }
      onProgress?.({
        phase: "store",
        done: parsed.done,
        total: parsed.total,
        detail: parsed.detail,
      });
    };

    timer = setTimeout(() => {
      child.kill();
      finish(new Error("Store 扫描超时"));
    }, STORE_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (!result) {
        const suffix = stderr.trim() ? `：${stderr.trim()}` : "";
        finish(new Error(`Store 扫描失败（退出码 ${code ?? "null"}）${suffix}`));
        return;
      }
      finish(null, result);
    });
  });
}

export async function scanStoreApps(
  onProgress?: (progress: ScanProgress) => void,
): Promise<StoreScanResult> {
  const fixture = process.env["PG_STORE_JSON"];
  if (fixture !== undefined) {
    onProgress?.({ phase: "store", done: 0, total: 1, detail: "读取 fixture" });
    try {
      const result = classifyStoreApps(parseStoreApps(JSON.parse(fixture)));
      onProgress?.({ phase: "store", done: 1, total: 1, detail: "完成" });
      return { ok: true, ...result };
    } catch (error) {
      log.warn(
        `[scan] Store fixture 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, apps: [], ignored: [] };
    }
  }

  try {
    const raw = await runStoreScript(onProgress);
    const result = classifyStoreApps(parseStoreApps(JSON.parse(raw)));
    return { ok: true, ...result };
  } catch (error) {
    log.warn(`[scan] Store 扫描失败: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, apps: [], ignored: [] };
  }
}
