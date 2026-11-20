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

export interface ScanSummary {
  scanned: number;
  kept: number;
  ignored: number;
  added: number;
  updated: number;
  missing: number;
}

export interface ScanProgress {
  phase: "start-menu" | "icons" | "done";
  done: number;
  total: number;
}

export type AppViewFilter =
  | { kind: "all" }
  | { kind: "ungrouped" }
  | { kind: "group"; groupId: string };
