import { createHash } from "node:crypto";
import type { ScannedApp } from "./types";

export interface StoreAppRecord {
  name: string;
  aumid: string;
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
    const record = item as { Name?: unknown; AppID?: unknown };
    if (typeof record.Name !== "string" || typeof record.AppID !== "string") continue;
    const name = record.Name.trim();
    const aumid = record.AppID.trim();
    if (!name || !aumid.includes("!")) continue;
    byAumid.set(aumid, { name, aumid });
  }
  return Array.from(byAumid.values());
}

export function toStoreApps(records: StoreAppRecord[]): ScannedApp[] {
  return records.map((record) => ({
    id: appIdForAumid(record.aumid),
    name: record.name,
    launchPath: record.aumid,
    launchKind: "aumid",
    exePath: "",
    source: "store",
    iconFile: null,
  }));
}
