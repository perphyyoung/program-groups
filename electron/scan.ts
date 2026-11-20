import { app, shell } from "electron";
import { existsSync, readdirSync, statSync, type Dirent } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import {
  appIdForExe,
  cleanShortcutName,
  isIgnoredShortcut,
  normalizeExePath,
  pickBestShortcuts,
  type ShortcutCandidate,
} from "../src/lib/scan-rules";
import type { ScanProgress } from "../src/lib/types";
import { log } from "./logger";

export interface StartMenuScanResult {
  candidates: ShortcutCandidate[];
  scanned: number;
  ignored: number;
}

export function startMenuRoots(): string[] {
  const override = process.env["PG_SCAN_DIRS"];
  if (override) {
    return override
      .split(";")
      .map((item) => item.trim().replace(/[\\/]+$/u, ""))
      .filter(Boolean);
  }
  const appData = process.env["APPDATA"];
  const programData = process.env["ProgramData"];
  return [
    appData ? join(appData, "Microsoft", "Windows", "Start Menu", "Programs") : "",
    programData ? join(programData, "Microsoft", "Windows", "Start Menu", "Programs") : "",
  ].filter(Boolean);
}

function collectShortcuts(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      log.info(
        `[scan] 跳过无法读取的目录 ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === "startup") continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".lnk")) {
        result.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return result;
}

function relativeToRoot(lnkPath: string, roots: string[]): string {
  for (const root of roots) {
    const prefix = `${root}\\`.toLowerCase();
    if (lnkPath.toLowerCase().startsWith(prefix)) return relative(root, lnkPath);
  }
  return basename(lnkPath);
}

/** 扫描开始菜单，返回可启动应用候选；过滤与去重都在纯函数里 */
export function scanStartMenu(onProgress?: (progress: ScanProgress) => void): StartMenuScanResult {
  const roots = startMenuRoots().filter((root) => existsSync(root));
  const links = roots.flatMap(collectShortcuts);
  const candidates: ShortcutCandidate[] = [];
  let ignored = 0;

  links.forEach((lnkPath, index) => {
    if (index % 20 === 0) {
      onProgress?.({ phase: "start-menu", done: index + 1, total: links.length });
    }

    let target = "";
    try {
      target = shell.readShortcutLink(lnkPath).target?.trim() ?? "";
    } catch (error) {
      ignored += 1;
      log.debug(
        `[scan] 无法解析快捷方式 ${lnkPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (!target || extname(target).toLowerCase() !== ".exe" || !existsSync(target)) {
      ignored += 1;
      return;
    }

    const name = cleanShortcutName(basename(lnkPath));
    if (!name) {
      ignored += 1;
      return;
    }

    const relativePath = relativeToRoot(lnkPath, roots);
    if (isIgnoredShortcut(name, target, relativePath)) {
      ignored += 1;
      return;
    }

    const exePath = normalizeExePath(target);
    candidates.push({
      id: appIdForExe(exePath),
      name,
      launchPath: lnkPath,
      launchKind: "lnk",
      exePath,
      relativePath,
    });
  });

  const picked = pickBestShortcuts(candidates);
  return {
    candidates: picked,
    scanned: links.length,
    ignored: ignored + (candidates.length - picked.length),
  };
}

/** 提取图标到 <data>/icons/<appId>.png，返回 appId -> 相对路径 */
export async function extractIcons(
  candidates: ShortcutCandidate[],
  dataDir: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<Map<string, string>> {
  const iconsDir = join(dataDir, "icons");
  await mkdir(iconsDir, { recursive: true });
  const result = new Map<string, string>();
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= candidates.length) return;
      const candidate = candidates[index]!;
      const iconPath = join(iconsDir, `${candidate.id}.png`);
      try {
        const sourceStat = statSync(candidate.launchPath);
        let needsWrite = true;
        if (existsSync(iconPath)) {
          // eslint-disable-next-line no-await-in-loop -- 每个 worker 内串行处理，避免同时读大量图标
          const iconStat = await stat(iconPath);
          needsWrite = iconStat.mtimeMs < sourceStat.mtimeMs;
        }

        if (needsWrite) {
          // eslint-disable-next-line no-await-in-loop -- 同上，worker 内按顺序取图标
          const image = await app.getFileIcon(candidate.launchPath, { size: "large" });
          if (!image.isEmpty()) {
            // eslint-disable-next-line no-await-in-loop -- 同上，写完再处理下一个
            await writeFile(iconPath, image.toPNG());
            result.set(candidate.id, `icons/${candidate.id}.png`);
          }
        } else {
          result.set(candidate.id, `icons/${candidate.id}.png`);
        }
      } catch (error) {
        log.warn(
          `[scan] 图标提取失败 ${candidate.launchPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      done += 1;
      onProgress?.({ phase: "icons", done, total: candidates.length });
    }
  };

  const concurrency = Math.min(8, Math.max(1, candidates.length));
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}
