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

/** 真正的卸载入口：按目标 exe 的精确模式与 msiexec 参数判断，不按名称子串 */
function isUninstallerTarget(target: string, args: string): boolean {
  const base = basename(target).toLowerCase();
  if (/^unins\d+\.exe$/u.test(base)) return true;
  if (/^(uninstall|uninstaller|uninst)\.exe$/u.test(base)) return true;
  if (/^uninstall_.+\.exe$/u.test(base)) return true;
  if (base === "msiexec.exe" && /\/x\b/iu.test(args)) return true;
  return false;
}

export function isIgnoredShortcut(
  name: string,
  target: string,
  args: string,
  relativePath: string,
): ShortcutIgnoreReason | null {
  const text = `${name} ${target}`.toLowerCase();
  if (isUninstallerTarget(target, args)) return "uninstall";
  if (/help|readme|about|帮助|关于|说明|文档|教程|manual|documentation/u.test(text)) return "help";
  if (/website|官网|update|更新|repair|修复/u.test(text)) return "website";
  if (SYSTEM_DIRS.has(name.toLowerCase())) return "system";

  const segments = relativePath.toLowerCase().split(/[\\/]/u);
  if (segments.some((segment) => SYSTEM_DIRS.has(segment))) return "system";

  const targetName = target.split(/[\\/]/u).pop()?.toLowerCase() ?? "";
  if (/^(setup|install|update).*\.exe$/u.test(targetName)) return "installer";

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

function compareCandidate(a: ShortcutCandidate, b: ShortcutCandidate): number {
  if (a.relativePath.length !== b.relativePath.length) {
    return a.relativePath.length - b.relativePath.length;
  }
  const byName = a.name.localeCompare(b.name, "zh-CN");
  if (byName !== 0) return byName;
  return a.launchPath.localeCompare(b.launchPath, "zh-CN");
}
