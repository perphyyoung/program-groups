import { existsSync, readdirSync, type Dirent } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { appIdForExe, normalizeExePath } from "./scan-rules";
import type { ScanProgress, ScannedApp } from "./types";

export interface GreenScanResult {
  apps: ScannedApp[];
  scanned: number;
  /** 实际可读的根目录数量；为 0 时调用方不得把 green 计入已扫描来源 */
  readable: number;
}

function collectExes(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".exe") {
        result.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return result;
}

/** 读取全部 exe，不做过滤；不想要的应用由用户手动忽略 */
export function scanGreenDirs(
  dirs: string[],
  onProgress?: (progress: ScanProgress) => void,
): GreenScanResult {
  const roots = dirs.map((dir) => dir.trim()).filter((dir) => dir.length > 0 && existsSync(dir));
  if (roots.length === 0) return { apps: [], scanned: 0, readable: 0 };

  const files = roots.flatMap(collectExes);
  const apps = new Map<string, ScannedApp>();
  files.forEach((file, index) => {
    if (index % 50 === 0) {
      onProgress?.({ phase: "green", done: index, total: files.length });
    }
    const name = basename(file)
      .replace(/\.exe$/iu, "")
      .trim();
    if (!name) return;
    const exePath = normalizeExePath(file);
    const id = appIdForExe(exePath);
    if (apps.has(id)) return;
    apps.set(id, {
      id,
      name,
      launchPath: resolve(file),
      launchKind: "exe",
      exePath,
      source: "green",
      iconFile: null,
    });
  });
  onProgress?.({ phase: "green", done: files.length, total: files.length });
  return { apps: Array.from(apps.values()), scanned: files.length, readable: roots.length };
}
