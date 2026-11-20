import { contextBridge, ipcRenderer } from "electron";
import type { GroupsData, LibraryData, ScanProgress, ScanSummary } from "../src/lib/types";

contextBridge.exposeInMainWorld("api", {
  loadLibrary: (): Promise<LibraryData> => ipcRenderer.invoke("library:load"),
  loadGroups: (): Promise<GroupsData> => ipcRenderer.invoke("library:groups"),
  scanLibrary: (): Promise<ScanSummary> => ipcRenderer.invoke("library:scan"),
  createGroup: (name: string) => ipcRenderer.invoke("groups:create", name),
  renameGroup: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke("groups:rename", id, name),
  deleteGroup: (id: string): Promise<void> => ipcRenderer.invoke("groups:delete", id),
  addMembers: (appIds: string[], groupId: string): Promise<void> =>
    ipcRenderer.invoke("memberships:add", appIds, groupId),
  removeMembers: (appIds: string[], groupId: string): Promise<void> =>
    ipcRenderer.invoke("memberships:remove", appIds, groupId),
  launchApp: (appId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("apps:launch", appId),
  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: ScanProgress): void => callback(progress);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  log: (level: string, message: string): Promise<void> =>
    ipcRenderer.invoke("log:renderer", level, message),
});
