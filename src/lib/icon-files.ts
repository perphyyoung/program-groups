/**
 * Windows 文件名不允许 `:` 等字符；Store ID 形如 `store:<hash>`，
 * 直接拼路径会落到 NTFS 备用数据流 `icons/store` 里。
 */
import type { AppSource } from "./types";

const INVALID_FILENAME = /[:<>"/\\|?*]/gu;

export function iconFileForId(id: string, source: AppSource = "start"): string {
  const safe = id.replace(INVALID_FILENAME, "_");
  const name = safe.startsWith("store_") ? safe : `${source}_${safe}`;
  return `icons/${name}.png`;
}

export function iconMissFileForId(id: string, source: AppSource = "start"): string {
  return iconFileForId(id, source).replace(/\.png$/u, ".miss");
}
