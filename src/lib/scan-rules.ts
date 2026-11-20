import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import type { IgnoreReason } from "./types";

export interface ShortcutCandidate {
  id: string;
  name: string;
  launchPath: string;
  launchKind: "lnk";
  exePath: string;
  targetPath: string;
  arguments: string;
  iconLocation: string | null;
  iconIndex: number | null;
  relativePath: string;
}

export type ShortcutIgnoreReason = Extract<
  IgnoreReason,
  "uninstall" | "help" | "website" | "system" | "installer"
>;

const SYSTEM_DIRS = new Set([
  "windows 附件",
  "windows 管理工具",
  "windows 系统工具",
  "windows 辅助工具",
  "windows powershell",
  "windows accessories",
  "windows kits",
  "accessibility",
  "administrative tools",
  "system tools",
]);

export function normalizeExePath(input: string): string {
  const unquoted = input.trim().replace(/^"(.*)"$/u, "$1");
  return resolve(unquoted)
    .replace(/^\\\\\?\\/u, "")
    .replace(/\//gu, "\\")
    .toLowerCase();
}

export function appIdForExe(exePath: string): string {
  return createHash("sha1").update(normalizeExePath(exePath)).digest("hex").slice(0, 16);
}

export function cleanShortcutName(fileName: string): string {
  return fileName
    .replace(/\.lnk$/iu, "")
    .replace(/\s*-\s*快捷方式$/u, "")
    .trim();
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/gu, "").toLowerCase();
}

/** 卸载入口：固定模式，或“目标像卸载器 + 名称是卸载动作”；名称与目标同名视为产品主程序 */
function isUninstallerShortcut(name: string, target: string, args: string): boolean {
  const base = basename(target).toLowerCase();
  if (/^unins\d+\.exe$/u.test(base)) return true;
  if (/^(uninstall|uninstaller|uninst)\.exe$/u.test(base)) return true;
  if (/^uninstall_.+\.exe$/u.test(base)) return true;
  if (base === "msiexec.exe" && /\/x\b/iu.test(args)) return true;

  if (!/uninstall|uninst/u.test(base)) return false;

  const lowerName = name.toLowerCase();
  const actionName =
    lowerName.startsWith("卸载") ||
    lowerName.endsWith("卸载") ||
    /^uninstall\b/iu.test(lowerName) ||
    /\buninstall$/iu.test(lowerName);
  if (!actionName) return false;

  const targetToken = base.replace(/\.exe$/u, "");
  return normalizeComparable(name) !== normalizeComparable(targetToken);
}

function isUpdaterTarget(base: string): boolean {
  return /^(update|updater)\.exe$/u.test(base) || /(^|[_-])update(r)?([_-]|\.)/u.test(base);
}

export function isIgnoredShortcut(
  name: string,
  target: string,
  args: string,
  relativePath: string,
): ShortcutIgnoreReason | null {
  const lowerName = name.toLowerCase();
  const targetBase = basename(target).toLowerCase();

  if (isUninstallerShortcut(name, target, args)) return "uninstall";

  if (
    /help|readme|about|帮助|关于|说明|使用手册|用户手册|操作手册|教程|manual|documentation/u.test(
      lowerName,
    ) ||
    /help|readme|about|manual|documentation/u.test(targetBase)
  ) {
    return "help";
  }

  const lowerArgs = args.toLowerCase();
  const updaterByArgs =
    isUpdaterTarget(targetBase) && (!lowerArgs || /check|update|upgrade/u.test(lowerArgs));
  if (/website|官网|update|更新|repair|修复/u.test(lowerName) || updaterByArgs) {
    return "website";
  }

  if (SYSTEM_DIRS.has(lowerName)) return "system";

  const segments = relativePath.toLowerCase().split(/[\\/]/u);
  if (segments.some((segment) => SYSTEM_DIRS.has(segment))) return "system";

  if (/^(setup|install|update).*\.exe$/u.test(targetBase)) return "installer";

  return null;
}

/** 同一 exe 的多个快捷方式只保留一个；按相对路径长度、名称稳定选择 */
export function pickBestShortcuts(candidates: ShortcutCandidate[]): ShortcutCandidate[] {
  const best = new Map<string, ShortcutCandidate>();
  for (const candidate of candidates) {
    const current = best.get(candidate.id);
    if (!current || compareCandidate(candidate, current) < 0) {
      best.set(candidate.id, candidate);
    }
  }
  return Array.from(best.values());
}

function parentFolder(relativePath: string): string {
  const segments = relativePath.split(/[\\/]/u);
  return segments.length >= 2 ? (segments[segments.length - 2] ?? "") : "";
}

function compareCandidate(a: ShortcutCandidate, b: ShortcutCandidate): number {
  const aMatchesParent =
    normalizeComparable(a.name) === normalizeComparable(parentFolder(a.relativePath));
  const bMatchesParent =
    normalizeComparable(b.name) === normalizeComparable(parentFolder(b.relativePath));
  if (aMatchesParent !== bMatchesParent) return aMatchesParent ? -1 : 1;

  if (a.relativePath.length !== b.relativePath.length) {
    return a.relativePath.length - b.relativePath.length;
  }
  const byName = a.name.localeCompare(b.name, "zh-CN");
  if (byName !== 0) return byName;
  return a.launchPath.localeCompare(b.launchPath, "zh-CN");
}
