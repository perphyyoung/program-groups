/**
 * 备份基础设施：临时目录组装（manifest.json + pg.db）→ PowerShell 压缩为 ZIP；
 * 导入反向：解压到临时目录 → 读 manifest 校验。与 prompt-manager 同款思路，
 * 不引入第三方依赖；pg MVP 仅 Windows，直接用 Compress-Archive / Expand-Archive。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_VERSION } from "./db";
import type { BackupStats } from "../src/lib/types";

export interface BackupManifest {
  app: "program-groups";
  schemaVersion: number;
  exportedAt: string;
  stats: BackupStats;
}

/** PowerShell 单引号字符串转义：内部单引号双写 */
function psQuote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function runPowerShell(script: string): void {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
}

/** 组装备份临时目录（manifest.json + pg.db），调用方负责最终清理 */
export function buildBackupPayload(
  tempDir: string,
  manifest: BackupManifest,
  databaseBytes: Uint8Array,
): void {
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(tempDir, "pg.db"), databaseBytes);
}

/** 用 Compress-Archive 把备份目录压成 ZIP；目录内平铺两个文件 */
export function createZipArchive(sourceDir: string, zipPath: string): void {
  runPowerShell(
    `Compress-Archive -Path ${psQuote(join(sourceDir, "*"))} -DestinationPath ${psQuote(zipPath)} -Force`,
  );
}

/** 用 Expand-Archive 解压 ZIP 到目标目录（已存在则覆盖） */
export function extractZipArchive(zipPath: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  runPowerShell(
    `Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(targetDir)} -Force`,
  );
}

/** 一次性临时目录，调用方负责 rmSync 清理 */
export function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export function removeTempDir(tempDir: string): void {
  rmSync(tempDir, { recursive: true, force: true });
}

export function buildBackupManifest(stats: BackupStats): BackupManifest {
  return {
    app: "program-groups",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    stats,
  };
}

/** 读并校验 manifest：app 标识与结构版本必须匹配当前应用 */
export function readBackupManifest(zipDir: string): BackupManifest {
  const raw = readFileSync(join(zipDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as Partial<BackupManifest>;
  if (manifest.app !== "program-groups") {
    throw new Error("所选文件不是 pg 的备份");
  }
  if (typeof manifest.schemaVersion !== "number" || manifest.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`备份结构版本较新，请升级应用后再导入`);
  }
  return manifest as BackupManifest;
}

/** 读取解压后的 pg.db 快照路径 */
export function backupDatabasePath(zipDir: string): string {
  return join(zipDir, "pg.db");
}
