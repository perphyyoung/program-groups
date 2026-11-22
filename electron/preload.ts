import { contextBridge, ipcRenderer } from "electron";
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
} from "../src/lib/types";

contextBridge.exposeInMainWorld("api", {
  loadLibrary: (): Promise<LibraryData> => ipcRenderer.invoke("library:load"),
  loadGroups: (): Promise<GroupsData> => ipcRenderer.invoke("library:groups"),
  scanLibrary: (): Promise<ScanSummary> => ipcRenderer.invoke("library:scan"),
  iconStatus: (): Promise<IconCacheStatus> => ipcRenderer.invoke("icons:status"),
  updateIcons: (force: boolean): Promise<IconUpdateResult> =>
    ipcRenderer.invoke("icons:update", force),
  createGroup: (name: string) => ipcRenderer.invoke("groups:create", name),
  renameGroup: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke("groups:rename", id, name),
  deleteGroup: (id: string): Promise<void> => ipcRenderer.invoke("groups:delete", id),
  reorderGroups: (ids: string[]): Promise<void> => ipcRenderer.invoke("groups:reorder", ids),
  setGroupSortMode: (mode: GroupSortMode): Promise<void> =>
    ipcRenderer.invoke("groups:setSortMode", mode),
  setGroupSortDirection: (direction: GroupSortDirection): Promise<void> =>
    ipcRenderer.invoke("groups:setSortDirection", direction),
  addMembers: (appIds: string[], groupId: string): Promise<void> =>
    ipcRenderer.invoke("memberships:add", appIds, groupId),
  removeMembers: (appIds: string[], groupId: string): Promise<void> =>
    ipcRenderer.invoke("memberships:remove", appIds, groupId),
  launchApp: (appId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("apps:launch", appId),
  manualIgnore: (appId: string): Promise<void> => ipcRenderer.invoke("apps:manualIgnore", appId),
  manualRestore: (appId: string): Promise<void> => ipcRenderer.invoke("apps:manualRestore", appId),
  setNote: (key: string, note: string): Promise<void> => ipcRenderer.invoke("notes:set", key, note),
  revealShortcut: (path: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("apps:revealShortcut", path),
  launchShortcut: (path: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("shortcuts:launch", path),
  launchStore: (aumid: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("store:launch", aumid),
  revealPath: (path: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("paths:reveal", path),
  checkPaths: (paths: {
    run: string | null;
    target: string | null;
    link: string | null;
  }): Promise<{ run: boolean; target: boolean; link: boolean }> =>
    ipcRenderer.invoke("paths:check", paths),
  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: ScanProgress): void => callback(progress);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  onIconProgress: (callback: (progress: IconUpdateProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: IconUpdateProgress): void => callback(progress);
    ipcRenderer.on("icons:progress", listener);
    return () => ipcRenderer.removeListener("icons:progress", listener);
  },
  log: (level: string, message: string): Promise<void> =>
    ipcRenderer.invoke("log:renderer", level, message),
});
