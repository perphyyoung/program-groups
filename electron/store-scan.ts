import { spawn } from "node:child_process";
import type { IgnoredItem, ScanProgress, ScannedApp } from "../src/lib/types";
import { parseStoreProgressLine } from "../src/lib/store-progress";
import { classifyStoreApps, parseStoreApps } from "../src/lib/store-apps";
import { log } from "./logger";

const STORE_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$withIcons = __WITH_ICONS__

function Send-Progress([int]$done, [int]$total, [string]$detail) {
  [Console]::Out.WriteLine("PGPROGRESS $done $total $detail")
  [Console]::Out.Flush()
}

function Resolve-Logo([string]$install, [string]$logo) {
  if (-not $install -or -not $logo) { return "" }
  $full = Join-Path $install $logo
  $dir = [IO.Path]::GetDirectoryName($full)
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { return "" }
  $base = [IO.Path]::GetFileNameWithoutExtension($logo)

  function Find-Best([string]$targetDir, [string]$targetBase) {
    $escaped = [regex]::Escape($targetBase)
    $files = @(Get-ChildItem -LiteralPath $targetDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "(?i)^$escaped(?:\\.(?<q>.+))?\\.(png|jpg|jpeg)$" })
    $best = $null
    $bestScore = [int]::MaxValue
    foreach ($file in $files) {
      if ($file.Name -match "(?i)^$escaped\\.(?<q>.+)\\.(png|jpg|jpeg)$") {
        $qualifiers = $Matches['q']
      } else {
        $qualifiers = ""
      }
      $tokens = @($qualifiers -split '_' | Where-Object { $_ })
      if ($tokens -match '(?i)^contrast-') { continue }

      $unplated = @($tokens | Where-Object { $_ -eq 'altform-unplated' }).Count -gt 0
      $lightUnplated = @($tokens | Where-Object { $_ -match '(?i)^altform-lightunplated$' }).Count -gt 0
      $colorfulLight = @($tokens | Where-Object { $_ -match '(?i)^altform-colorful.*theme-light$' }).Count -gt 0

      $size = $null
      foreach ($token in $tokens) {
        if ($token -match '(?i)^targetsize-(\\d+)$') { $size = [int]$Matches[1]; break }
      }
      $scale = $null
      foreach ($token in $tokens) {
        if ($token -match '(?i)^scale-(\\d+)$') { $scale = [int]$Matches[1]; break }
      }

      $score = 0
      if ($null -ne $size) {
        $sizeRank = switch ($size) {
          48 { 0 } 44 { 1 } 32 { 2 } 256 { 3 } 96 { 4 } 64 { 5 }
          40 { 6 } 36 { 7 } 30 { 8 } 24 { 9 } 20 { 10 } 16 { 11 }
          default { 20 }
        }
        $score = $sizeRank * 10
      } elseif ($null -ne $scale) {
        $scaleRank = switch ($scale) {
          200 { 0 } 400 { 1 } 150 { 2 } 125 { 3 } 100 { 4 }
          default { 10 }
        }
        $score = 150 + $scaleRank
      } else {
        $score = 300
      }
      if (-not $unplated) { $score += 1 }
      if ($lightUnplated) { $score += 3 }
      if ($colorfulLight) { $score += 4 }

      if ($score -lt $bestScore) {
        $bestScore = $score
        $best = $file
      }
    }
    return $best
  }

  $pick = Find-Best $dir $base
  if (-not $pick) { $pick = Find-Best $dir "AppList" }
  if ($pick) { return $pick.FullName }
  return ""
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

$manifests = @{}
if ($withIcons) {
  $families = $startApps | ForEach-Object { ($_.AppID -split '!', 2)[0] } | Sort-Object -Unique
  foreach ($family in $families) {
    $pkg = $packages[$family]
    if (-not $pkg) { continue }
    try {
      $manifests[$family] = Get-AppxPackageManifest -Package $pkg.PackageFullName
    } catch { }
  }
}

Send-Progress 2 3 "分类 Store 应用"
$apps = foreach ($app in $startApps) {
  $family = ($app.AppID -split '!', 2)[0]
  $appPart = ($app.AppID -split '!', 2)[1]
  $pkg = $packages[$family]
  $icon = ""
  if ($withIcons -and $pkg) {
    $manifest = $manifests[$family]
    if ($manifest) {
      $nodes = @($manifest.SelectNodes("//*[local-name()='Application']"))
      $node = $nodes | Where-Object { $_.GetAttribute("Id") -eq $appPart } | Select-Object -First 1
      if (-not $node) { $node = $nodes | Select-Object -First 1 }
      $visual = if ($node) { $node.SelectSingleNode("./*[local-name()='VisualElements']") } else { $null }
      $logo = if ($visual) { $visual.GetAttribute("Square44x44Logo") } else { "" }
      $icon = Resolve-Logo ([string]$pkg.InstallLocation) $logo
    }
  }
  [pscustomobject]@{
    Name = [string]$app.Name
    AppID = [string]$app.AppID
    SignatureKind = if ($pkg) { [string]$pkg.SignatureKind } else { "未知" }
    IconSource = $icon
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

function runStoreScript(
  withIcons: boolean,
  onProgress?: (progress: ScanProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = STORE_SCRIPT.replace("__WITH_ICONS__", withIcons ? "$true" : "$false");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
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
  options: { withIcons?: boolean } = {},
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
    const raw = await runStoreScript(options.withIcons === true, onProgress);
    const result = classifyStoreApps(parseStoreApps(JSON.parse(raw)));
    return { ok: true, ...result };
  } catch (error) {
    log.warn(`[scan] Store 扫描失败: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, apps: [], ignored: [] };
  }
}
