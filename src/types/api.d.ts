import type {
  GroupsData,
  GroupSortDirection,
  GroupSortMode,
  IconCacheStatus,
  IconUpdateProgress,
  IconUpdateResult,
  LibraryData,
  ScanProgress,
  ScanSummary,
} from "../lib/types";

export interface Api {
  loadLibrary(): Promise<LibraryData>;
  loadGroups(): Promise<GroupsData>;
  scanLibrary(): Promise<ScanSummary>;
  iconStatus(): Promise<IconCacheStatus>;
  updateIcons(force: boolean): Promise<IconUpdateResult>;
  createGroup(name: string): Promise<{ id: string; name: string; sort: number }>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  reorderGroups(ids: string[]): Promise<void>;
  setGroupSortMode(mode: GroupSortMode): Promise<void>;
  setGroupSortDirection(direction: GroupSortDirection): Promise<void>;
  addMembers(appIds: string[], groupId: string): Promise<void>;
  removeMembers(appIds: string[], groupId: string): Promise<void>;
  launchApp(appId: string): Promise<{ ok: boolean; error?: string }>;
  manualIgnore(appId: string): Promise<void>;
  manualRestore(appId: string): Promise<void>;
  setNote(key: string, note: string): Promise<void>;
  revealShortcut(path: string): Promise<{ ok: boolean; error?: string }>;
  launchShortcut(path: string): Promise<{ ok: boolean; error?: string }>;
  launchStore(aumid: string): Promise<{ ok: boolean; error?: string }>;
  revealPath(path: string): Promise<{ ok: boolean; error?: string }>;
  checkPaths(paths: {
    run: string | null;
    target: string | null;
    link: string | null;
  }): Promise<{ run: boolean; target: boolean; link: boolean }>;
  onScanProgress(callback: (progress: ScanProgress) => void): () => void;
  onIconProgress(callback: (progress: IconUpdateProgress) => void): () => void;
  log(level: string, message: string): Promise<void>;
}

declare global {
  interface Window {
    api: Api;
  }
}
