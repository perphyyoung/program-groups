export type AppStatus = "active" | "missing";
export type EntryType = "app" | "uninstaller" | "installer" | "system";
export type AppSource = "start" | "store" | "registry";
export type AppLaunchKind = "lnk" | "exe" | "aumid";

export interface ScannedApp {
  id: string;
  name: string;
  launchPath: string;
  launchKind: AppLaunchKind;
  exePath: string;
  source: AppSource;
  iconFile: string | null;
}

export interface AppRecord {
  id: string;
  name: string;
  launchPath: string;
  launchKind: AppLaunchKind;
  exePath: string;
  iconFile: string | null;
  source: AppSource;
  status: AppStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AppEntry extends AppRecord {
  groupIds: string[];
  iconUrl: string | null;
}

export type GroupSortMode = "manual" | "name" | "created";
export type GroupSortDirection = "asc" | "desc";

export interface GroupEntry {
  id: string;
  name: string;
  sort: number;
  count: number;
  createdAt: string;
}

export interface LibraryData {
  apps: AppEntry[];
  manualIgnored: AppEntry[];
  groups: GroupEntry[];
  missingCount: number;
  notes: Record<string, string>;
  groupSortMode: GroupSortMode;
  groupSortDirection: GroupSortDirection;
}

export interface MembershipEntry {
  appId: string;
  groupId: string;
}

export interface GroupsData {
  groups: GroupEntry[];
  memberships: MembershipEntry[];
}

export type IgnoreReason =
  | "uninstall"
  | "help"
  | "website"
  | "system"
  | "installer"
  | "store-other"
  | "unreadable"
  | "invalid-target"
  | "missing-target"
  | "invalid-name"
  | "duplicate";

export interface IgnoredItem {
  name: string;
  target: string;
  reason: IgnoreReason;
  source: AppSource;
  launchKind: AppLaunchKind;
  /** .lnk 绝对路径或 Store AUMID */
  launchPath: string;
  /** 快捷方式 .lnk 的绝对路径；Store 项没有 */
  shortcutPath?: string;
  /** 仅重复项：与该快捷方式指向同一应用、且已被收录的名称 */
  keptAs?: string;
}

export interface ScanSummary {
  scanned: number;
  kept: number;
  ignored: number;
  ignoredItems: IgnoredItem[];
  duplicate: number;
  duplicateItems: IgnoredItem[];
  added: number;
  updated: number;
  missing: number;
  changed: boolean;
}

export interface ScanProgress {
  phase: "start-menu" | "store" | "icons" | "done";
  done: number;
  total: number;
  cached?: number;
  extracted?: number;
  failed?: number;
}

export type AppScope =
  | { kind: "all" }
  | { kind: "ungrouped" }
  | { kind: "ignored" }
  | { kind: "group"; groupId: string };
