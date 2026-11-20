import type { GroupsData, LibraryData, ScanProgress, ScanSummary } from "../lib/types";

export interface Api {
  loadLibrary(): Promise<LibraryData>;
  loadGroups(): Promise<GroupsData>;
  scanLibrary(): Promise<ScanSummary>;
  createGroup(name: string): Promise<{ id: string; name: string; sort: number }>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  addMembers(appIds: string[], groupId: string): Promise<void>;
  removeMembers(appIds: string[], groupId: string): Promise<void>;
  launchApp(appId: string): Promise<{ ok: boolean; error?: string }>;
  revealShortcut(path: string): Promise<{ ok: boolean; error?: string }>;
  onScanProgress(callback: (progress: ScanProgress) => void): () => void;
  log(level: string, message: string): Promise<void>;
}

declare global {
  interface Window {
    api: Api;
  }
}
