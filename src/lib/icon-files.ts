/**
 * Windows 文件名不允许 `:` 等字符；Store ID 形如 `store:<hash>`，
 * 直接拼路径会落到 NTFS 备用数据流 `icons/store` 里。
 */
const INVALID_FILENAME = /[:<>"/\\|?*]/gu;

export function iconFileForId(id: string): string {
  const safe = id.replace(INVALID_FILENAME, "_");
  const name = safe.startsWith("store_") ? safe : `start_${safe}`;
  return `icons/${name}.png`;
}

export function iconMissFileForId(id: string): string {
  return iconFileForId(id).replace(/\.png$/u, ".miss");
}
