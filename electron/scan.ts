import { app, shell, type NativeImage } from "electron";
import { existsSync, readdirSync, statSync, type Dirent } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  appIdForExe,
  cleanShortcutName,
  isIgnoredShortcut,
  normalizeExePath,
  pickBestShortcuts,
  type ShortcutCandidate,
} from "../src/lib/scan-rules";
import type { IgnoredItem, ScanProgress } from "../src/lib/types";
import { log } from "./logger";

export interface StartMenuScanResult {
  candidates: ShortcutCandidate[];
  scanned: number;
  ignored: number;
  ignoredItems: IgnoredItem[];
  duplicate: number;
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
  const ignoredItems: IgnoredItem[] = [];

  links.forEach((lnkPath, index) => {
    if (index % 20 === 0) {
      onProgress?.({ phase: "start-menu", done: index + 1, total: links.length });
    }

    const name = cleanShortcutName(basename(lnkPath));
    let target = "";
    let shortcutArgs = "";
    let iconLocation: string | null = null;
    let iconIndex: number | null = null;
    try {
      const details = shell.readShortcutLink(lnkPath);
      target = details.target?.trim() ?? "";
      shortcutArgs = details.args?.trim() ?? "";
      iconLocation = details.icon?.trim() || null;
      iconIndex = typeof details.iconIndex === "number" ? details.iconIndex : null;
    } catch {
      ignoredItems.push({ name, target: "", reason: "unreadable" });
      return;
    }

    if (!target || extname(target).toLowerCase() !== ".exe") {
      ignoredItems.push({ name, target, reason: "invalid-target" });
      return;
    }
    if (!existsSync(target)) {
      ignoredItems.push({ name, target, reason: "missing-target" });
      return;
    }
    if (!name) {
      ignoredItems.push({ name: "", target, reason: "invalid-name" });
      return;
    }

    const relativePath = relativeToRoot(lnkPath, roots);
    const ignoreReason = isIgnoredShortcut(name, target, shortcutArgs, relativePath);
    if (ignoreReason) {
      ignoredItems.push({ name, target, reason: ignoreReason });
      return;
    }

    const exePath = normalizeExePath(target);
    candidates.push({
      id: appIdForExe(exePath),
      name,
      launchPath: lnkPath,
      launchKind: "lnk",
      exePath,
      targetPath: resolve(target),
      arguments: shortcutArgs,
      iconLocation,
      iconIndex,
      relativePath,
    });
  });

  const picked = pickBestShortcuts(candidates);
  const pickedSet = new Set(picked);
  let duplicate = 0;
  for (const candidate of candidates) {
    if (!pickedSet.has(candidate)) duplicate += 1;
  }

  return {
    candidates: picked,
    scanned: links.length,
    ignored: ignoredItems.length,
    ignoredItems,
    duplicate,
  };
}

/** 快捷方式的 IconLocation 可能带 ",索引"，图标文件本身要先把索引部分去掉 */
function iconPathOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith(",")) return null;
  const comma = trimmed.lastIndexOf(",");
  if (comma > 1 && /^\d+$/u.test(trimmed.slice(comma + 1).trim())) {
    return trimmed.slice(0, comma).trim();
  }
  return trimmed;
}

/** 优先用快捷方式指定的图标位置，其次用目标 exe；两者都比 .lnk 自身可靠 */
function iconSourceOf(candidate: ShortcutCandidate): string {
  const iconLocation = iconPathOnly(candidate.iconLocation);
  if (iconLocation && existsSync(iconLocation)) return iconLocation;
  return candidate.targetPath;
}

async function loadIconImage(candidate: ShortcutCandidate): Promise<NativeImage> {
  const primary = iconSourceOf(candidate);
  const image = await app.getFileIcon(primary, { size: "large" });
  if (!image.isEmpty() || primary === candidate.targetPath) return image;

  const targetImage = await app.getFileIcon(candidate.targetPath, { size: "large" });
  if (!targetImage.isEmpty()) return targetImage;
  return app.getFileIcon(candidate.launchPath, { size: "large" });
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
        let sourceMtime = statSync(candidate.targetPath).mtimeMs;
        const iconSource = iconSourceOf(candidate);
        if (iconSource !== candidate.targetPath) {
          sourceMtime = Math.max(sourceMtime, statSync(iconSource).mtimeMs);
        }

        let needsWrite = true;
        if (existsSync(iconPath)) {
          // eslint-disable-next-line no-await-in-loop -- 每个 worker 内串行处理，避免同时读大量图标
          const iconStat = await stat(iconPath);
          needsWrite = iconStat.mtimeMs < sourceMtime;
        }

        if (needsWrite) {
          // eslint-disable-next-line no-await-in-loop -- 同上，worker 内按顺序取图标
          const image = await loadIconImage(candidate);
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
