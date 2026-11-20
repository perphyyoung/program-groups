export type AppStatus = "active" | "missing";

export interface AppRecord {
  id: string;
  name: string;
  launchPath: string;
  launchKind: "lnk" | "exe";
  exePath: string;
  iconFile: string | null;
  status: AppStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AppEntry extends AppRecord {
  groupIds: string[];
  iconUrl: string | null;
}

export interface GroupEntry {
  id: string;
  name: string;
  sort: number;
  count: number;
}

export interface LibraryData {
  apps: AppEntry[];
  manualIgnored: AppEntry[];
  groups: GroupEntry[];
  missingCount: number;
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
  | "unreadable"
  | "invalid-target"
  | "missing-target"
  | "invalid-name"
  | "duplicate";

export interface IgnoredItem {
  name: string;
  target: string;
  /** 快捷方式 .lnk 的绝对路径，用于在资源管理器中定位 */
  shortcutPath: string;
  reason: IgnoreReason;
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
  phase: "start-menu" | "icons" | "done";
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
