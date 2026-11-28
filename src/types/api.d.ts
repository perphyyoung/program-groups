import type {
  BackupStats,
  GreenDirEntry,
  GreenRemoveResult,
  GroupsData,
  GroupSortDirection,
  GroupSortMode,
  IconSettings,
  IconSource,
  IconUpdateOptions,
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
  scanGreen(): Promise<ScanSummary>;
  deleteMissingApps(ids: string[]): Promise<number>;
  setRecentWindowDays(days: number): Promise<void>;
  backupExport(): Promise<{ path: string | null; stats: BackupStats }>;
  backupPickImport(): Promise<{ filePath: string; stats: BackupStats } | null>;
  backupApplyImport(filePath: string): Promise<{ apps: number; groups: number }>;
  iconSettings(): Promise<IconSettings>;
  setIconSources(sources: IconSource[]): Promise<void>;
  updateIcons(options: IconUpdateOptions): Promise<IconUpdateResult>;
  listGreenDirs(): Promise<GreenDirEntry[]>;
  pickGreenDir(): Promise<GreenDirEntry[]>;
  removeGreenDir(dir: string): Promise<GreenRemoveResult>;
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
