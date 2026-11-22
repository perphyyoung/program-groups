import { existsSync, readdirSync, type Dirent } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { appIdForExe, normalizeExePath } from "./scan-rules";
import type { ScanProgress, ScannedApp } from "./types";

export interface GreenScanResult {
  apps: ScannedApp[];
  scanned: number;
  /** 实际可读的根目录数量；为 0 时调用方不得把 green 计入已扫描来源 */
  readable: number;
  /** 因超过单目录上限而截断的目录数 */
  truncated: number;
}

const MAX_DEPTH = 3;
const MAX_EXES_PER_DIR = 1000;

function collectExes(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  let truncated = false;
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || files.length >= MAX_EXES_PER_DIR) {
      if (files.length >= MAX_EXES_PER_DIR) truncated = true;
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_EXES_PER_DIR) {
        truncated = true;
        return;
      }
      // 只读普通目录与普通文件，符号链接 / junction 一律跳过
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".exe") {
        files.push(join(dir, entry.name));
      }
    }
  };
  walk(root, 0);
  return { files, truncated };
}

/** 读取全部 exe，不做过滤；不想要的应用由用户手动忽略 */
export function scanGreenDirs(
  dirs: string[],
  onProgress?: (progress: ScanProgress) => void,
): GreenScanResult {
  const roots = dirs.map((dir) => dir.trim()).filter((dir) => dir.length > 0 && existsSync(dir));
  if (roots.length === 0) return { apps: [], scanned: 0, readable: 0, truncated: 0 };

  const collected = roots.map(collectExes);
  const files = collected.flatMap((item) => item.files);
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
  return {
    apps: Array.from(apps.values()),
    scanned: files.length,
    readable: roots.length,
    truncated: collected.filter((item) => item.truncated).length,
  };
}
