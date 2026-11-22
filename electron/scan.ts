import { app, nativeImage, shell, type NativeImage } from "electron";
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from "node:fs";
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
import { iconFileForId, iconMissFileForId } from "../src/lib/icon-files";
import type { AppSource, IgnoredItem, ScanProgress } from "../src/lib/types";
import { log } from "./logger";

export interface StartMenuScanResult {
  candidates: ShortcutCandidate[];
  scanned: number;
  ignored: number;
  ignoredItems: IgnoredItem[];
  duplicate: number;
  duplicateItems: IgnoredItem[];
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
    appData ? join(appData, "Microsoft", "Windows", "Start Menu") : "",
    programData ? join(programData, "Microsoft", "Windows", "Start Menu") : "",
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

function ignored(
  name: string,
  target: string,
  shortcutPath: string,
  reason: IgnoredItem["reason"],
): IgnoredItem {
  return {
    name,
    target,
    shortcutPath,
    reason,
    source: "start",
    launchKind: "lnk",
    launchPath: shortcutPath,
  };
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
      ignoredItems.push(ignored(name, "", lnkPath, "unreadable"));
      return;
    }

    if (!target || extname(target).toLowerCase() !== ".exe") {
      ignoredItems.push(ignored(name, target, lnkPath, "invalid-target"));
      return;
    }
    if (!existsSync(target)) {
      ignoredItems.push(ignored(name, target, lnkPath, "missing-target"));
      return;
    }
    if (!name) {
      ignoredItems.push(ignored("", target, lnkPath, "invalid-name"));
      return;
    }

    const relativePath = relativeToRoot(lnkPath, roots);
    const ignoreReason = isIgnoredShortcut(name, target, shortcutArgs, relativePath);
    if (ignoreReason) {
      ignoredItems.push(ignored(name, target, lnkPath, ignoreReason));
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
  const pickedById = new Map(picked.map((candidate) => [candidate.id, candidate]));
  const duplicateItems: IgnoredItem[] = [];
  for (const candidate of candidates) {
    const kept = pickedById.get(candidate.id);
    if (kept === candidate) continue;
    const item = ignored(candidate.name, candidate.targetPath, candidate.launchPath, "duplicate");
    if (kept) item.keptAs = kept.name;
    duplicateItems.push(item);
  }

  return {
    candidates: picked,
    scanned: links.length,
    ignored: ignoredItems.length,
    ignoredItems,
    duplicate: duplicateItems.length,
    duplicateItems,
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

export interface IconExtractResult {
  icons: Map<string, string>;
  extracted: number;
  cached: number;
  failed: number;
}

export interface CachedIconResult {
  icons: Map<string, string>;
}

/** Store 图标直接来自清单 Logo 资源，不需要 AUMID 解析 */
export interface StoreIconCandidate {
  kind: "store";
  id: string;
  name: string;
  sourcePath: string;
}

/** 绿色软件候选：直接指向 exe，不做 AUMID 或快捷方式解析 */
export interface GreenIconCandidate {
  kind: "green";
  id: string;
  name: string;
  exePath: string;
}

export type IconCandidate = ShortcutCandidate | StoreIconCandidate | GreenIconCandidate;

function isStoreCandidate(candidate: IconCandidate): candidate is StoreIconCandidate {
  return "kind" in candidate && candidate.kind === "store";
}

function isGreenCandidate(candidate: IconCandidate): candidate is GreenIconCandidate {
  return "kind" in candidate && candidate.kind === "green";
}

/** 扫描只读缓存：不 stat 源文件、不提取、不写 miss */
export function resolveCachedIcons(
  candidates: { id: string; source: AppSource }[],
  dataDir: string,
): CachedIconResult {
  const icons = new Map<string, string>();
  for (const candidate of candidates) {
    const iconFile = iconFileForId(candidate.id, candidate.source);
    if (existsSync(join(dataDir, iconFile))) {
      icons.set(candidate.id, iconFile);
    }
  }
  return { icons };
}

/** 提取图标到 <data>/icons/<appId>.png，返回图标路径与提取统计 */
export async function extractIcons(
  candidates: IconCandidate[],
  dataDir: string,
  onProgress?: (progress: ScanProgress) => void,
  options: { force?: boolean } = {},
): Promise<IconExtractResult> {
  const iconsDir = join(dataDir, "icons");
  await mkdir(iconsDir, { recursive: true });
  const icons = new Map<string, string>();
  let next = 0;
  let done = 0;
  let extracted = 0;
  let cached = 0;
  let failed = 0;
  const force = options.force === true;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= candidates.length) return;
      const candidate = candidates[index]!;
      const candidateSource: AppSource = "kind" in candidate ? candidate.kind : "start";
      const iconFile = iconFileForId(candidate.id, candidateSource);
      const iconPath = join(dataDir, iconFile);
      const missPath = join(dataDir, iconMissFileForId(candidate.id, candidateSource));
      try {
        let sourceMtime: number;
        if (isStoreCandidate(candidate)) {
          sourceMtime = statSync(candidate.sourcePath).mtimeMs;
        } else if (isGreenCandidate(candidate)) {
          sourceMtime = statSync(candidate.exePath).mtimeMs;
        } else {
          sourceMtime = Math.max(
            statSync(candidate.targetPath).mtimeMs,
            statSync(candidate.launchPath).mtimeMs,
          );
          const iconSource = iconSourceOf(candidate);
          if (iconSource !== candidate.targetPath) {
            sourceMtime = Math.max(sourceMtime, statSync(iconSource).mtimeMs);
          }
        }
        const sourceKey = String(sourceMtime);

        let iconIsFresh = false;
        if (!force && existsSync(iconPath)) {
          // eslint-disable-next-line no-await-in-loop -- 每个 worker 内串行处理，避免同时读大量图标
          const iconStat = await stat(iconPath);
          iconIsFresh = iconStat.mtimeMs >= sourceMtime;
        }

        if (!force && iconIsFresh) {
          cached += 1;
          icons.set(candidate.id, iconFile);
        } else {
          const missIsFresh =
            !force && existsSync(missPath) && readFileSync(missPath, "utf8") === sourceKey;
          if (missIsFresh) {
            failed += 1;
            if (existsSync(iconPath)) icons.set(candidate.id, iconFile);
          } else {
            let image: NativeImage;
            if (isStoreCandidate(candidate)) {
              image = nativeImage.createFromPath(candidate.sourcePath);
            } else if (isGreenCandidate(candidate)) {
              // eslint-disable-next-line no-await-in-loop -- worker 内串行取图标
              image = await app.getFileIcon(candidate.exePath, { size: "large" });
            } else {
              // eslint-disable-next-line no-await-in-loop -- worker 内串行取图标
              image = await loadIconImage(candidate);
            }
            if (!image.isEmpty()) {
              // eslint-disable-next-line no-await-in-loop -- 同上，写完再处理下一个
              await writeFile(iconPath, image.toPNG());
              icons.set(candidate.id, iconFile);
              extracted += 1;
            } else {
              // eslint-disable-next-line no-await-in-loop -- 失败标记也按顺序写
              await writeFile(missPath, sourceKey, "utf8");
              failed += 1;
            }
          }
        }
      } catch (error) {
        failed += 1;
        const failedPath = isStoreCandidate(candidate)
          ? candidate.sourcePath
          : isGreenCandidate(candidate)
            ? candidate.exePath
            : candidate.launchPath;
        log.warn(
          `[scan] 图标提取失败 ${failedPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      done += 1;
      onProgress?.({
        phase: "icons",
        done,
        total: candidates.length,
        cached,
        extracted,
        failed,
      });
    }
  };

  const concurrency = Math.min(8, Math.max(1, candidates.length));
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { icons, extracted, cached, failed };
}
