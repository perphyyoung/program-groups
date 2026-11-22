import { createHash } from "node:crypto";
import type { IgnoredItem, ScannedApp } from "./types";

export interface StoreAppRecord {
  name: string;
  aumid: string;
  signatureKind: string;
  iconSource: string | null;
}

export function appIdForAumid(aumid: string): string {
  const hash = createHash("sha1").update(`aumid:${aumid}`).digest("hex").slice(0, 16);
  return `store:${hash}`;
}

/** PowerShell Get-StartApps 输出可能是单个对象或数组 */
export function parseStoreApps(raw: unknown): StoreAppRecord[] {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const byAumid = new Map<string, StoreAppRecord>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      Name?: unknown;
      AppID?: unknown;
      SignatureKind?: unknown;
      IconSource?: unknown;
    };
    if (typeof record.Name !== "string" || typeof record.AppID !== "string") continue;
    const name = record.Name.trim();
    const aumid = record.AppID.trim();
    if (!name || !aumid.includes("!")) continue;
    const signatureKind =
      typeof record.SignatureKind === "string" && record.SignatureKind.trim()
        ? record.SignatureKind.trim()
        : "未知";
    const iconSource =
      typeof record.IconSource === "string" && record.IconSource.trim()
        ? record.IconSource.trim()
        : null;
    byAumid.set(aumid, { name, aumid, signatureKind, iconSource });
  }
  return Array.from(byAumid.values());
}

/** 只有 Store / Developer 签名进入应用；其他打包应用统一进已忽略 */
export function classifyStoreApps(records: StoreAppRecord[]): {
  apps: ScannedApp[];
  ignored: IgnoredItem[];
} {
  const apps: ScannedApp[] = [];
  const ignored: IgnoredItem[] = [];
  for (const record of records) {
    if (record.signatureKind === "Store" || record.signatureKind === "Developer") {
      apps.push({
        id: appIdForAumid(record.aumid),
        name: record.name,
        launchPath: record.aumid,
        launchKind: "aumid",
        exePath: "",
        source: "store",
        iconFile: null,
        iconSource: record.iconSource,
      });
    } else {
      ignored.push({
        name: record.name,
        target: record.aumid,
        reason: "store-auto-ignore",
        source: "store",
        launchKind: "aumid",
        launchPath: record.aumid,
      });
    }
  }
  return { apps, ignored };
}
