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

export interface AppView extends AppRecord {
  groupIds: string[];
  iconUrl: string | null;
}

export interface GroupView {
  id: string;
  name: string;
  sort: number;
  count: number;
}

export interface LibraryData {
  apps: AppView[];
  groups: GroupView[];
  missingCount: number;
}

export interface MembershipView {
  appId: string;
  groupId: string;
}

export interface GroupsData {
  groups: GroupView[];
  memberships: MembershipView[];
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
  | "invalid-name";

export interface IgnoredItem {
  name: string;
  target: string;
  reason: IgnoreReason;
}

export interface ScanSummary {
  scanned: number;
  kept: number;
  ignored: number;
  ignoredItems: IgnoredItem[];
  duplicate: number;
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

export type AppViewFilter =
  | { kind: "all" }
  | { kind: "ungrouped" }
  | { kind: "ignored" }
  | { kind: "group"; groupId: string };
