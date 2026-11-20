import { app, BrowserWindow, ipcMain, Menu, shell, type WebContents } from "electron";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addMembers,
  closeDatabase,
  countMissing,
  createGroup,
  deleteGroup,
  getApp,
  groupExists,
  listActiveApps,
  listGroups,
  listMemberships,
  markAppMissing,
  openDatabase,
  reconcile,
  removeMembers,
  renameGroup,
} from "./db";
import { log, logPath } from "./logger";
import { extractIcons, scanStartMenu } from "./scan";
import type { AppView, GroupView, LibraryData, ScanProgress, ScanSummary } from "../src/lib/types";

const devUrl = process.env["ELECTRON_RENDERER_URL"];
const e2eDataDir = process.env["E2E"] === "1" ? process.env["PG_DATA_DIR"] : undefined;

if (e2eDataDir) {
  mkdirSync(e2eDataDir, { recursive: true });
  app.setPath("userData", e2eDataDir);
}

/** dev 用项目根 pg-data；release / e2e 用 userData */
function dataRoot(): string {
  return devUrl ? join(app.getAppPath(), "pg-data") : app.getPath("userData");
}

function databasePath(): string {
  return join(dataRoot(), "pg.db");
}

function iconDataUrl(iconFile: string | null): string | null {
  if (!iconFile) return null;
  try {
    const buffer = readFileSync(join(dataRoot(), iconFile));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (error) {
    log.warn(
      `[icon] 读取失败 ${iconFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function loadLibrary(): LibraryData {
  const apps = listActiveApps();
  const groups = listGroups();
  const memberships = listMemberships();
  const activeIds = new Set(apps.map((item) => item.id));
  const groupIdsByApp = new Map<string, string[]>();
  const countsByGroup = new Map<string, number>();

  for (const membership of memberships) {
    if (!activeIds.has(membership.appId)) continue;
    const ids = groupIdsByApp.get(membership.appId) ?? [];
    ids.push(membership.groupId);
    groupIdsByApp.set(membership.appId, ids);
    countsByGroup.set(membership.groupId, (countsByGroup.get(membership.groupId) ?? 0) + 1);
  }

  const appViews: AppView[] = apps.map((item) => ({
    id: item.id,
    name: item.name,
    launchPath: item.launchPath,
    launchKind: item.launchKind,
    exePath: item.exePath,
    iconFile: item.iconFile,
    status: item.status,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    groupIds: groupIdsByApp.get(item.id) ?? [],
    iconUrl: iconDataUrl(item.iconFile),
  }));

  const groupViews: GroupView[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    sort: group.sort,
    count: countsByGroup.get(group.id) ?? 0,
  }));

  return { apps: appViews, groups: groupViews, missingCount: countMissing() };
}

let scanning = false;

async function runScan(sender: WebContents): Promise<ScanSummary> {
  if (scanning) throw new Error("扫描正在进行");
  scanning = true;
  try {
    const scanStartedAt = new Date().toISOString();
    mkdirSync(join(dataRoot(), "icons"), { recursive: true });
    const onProgress = (progress: ScanProgress): void => {
      sender.send("scan:progress", progress);
    };

    const result = scanStartMenu(onProgress);
    const icons = await extractIcons(result.candidates, dataRoot(), onProgress);
    const discovered = result.candidates.map((candidate) => ({
      ...candidate,
      iconFile: icons.get(candidate.id) ?? null,
    }));
    const reconciled = reconcile(discovered, scanStartedAt);
    const summary: ScanSummary = {
      scanned: result.scanned,
      kept: discovered.length,
      ignored: result.ignored,
      ignoredItems: result.ignoredItems,
      duplicate: result.duplicate,
      ...reconciled,
    };
    sender.send("scan:progress", { phase: "done", done: 1, total: 1 });
    log.info(
      `[scan] scanned=${summary.scanned} kept=${summary.kept} ignored=${summary.ignored} ` +
        `duplicate=${summary.duplicate} added=${summary.added} missing=${summary.missing}`,
    );
    return summary;
  } finally {
    scanning = false;
  }
}

const LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

function handleIpc<T>(channel: string, task: () => T): T {
  try {
    return task();
  } catch (error) {
    log.error(`[ipc ${channel}] ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function handleIpcAsync<T>(channel: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    log.error(`[ipc ${channel}] ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function assertName(value: unknown): string {
  if (typeof value !== "string") throw new Error("分组名无效");
  const name = value.trim();
  if (name.length < 1 || name.length > 30) throw new Error("分组名需为 1–30 个字符");
  return name;
}

function assertId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("ID 无效");
  return value;
}

function assertIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("应用 ID 无效");
  const ids = Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
  if (ids.length === 0) throw new Error("未选择应用");
  return ids;
}

function duplicateFriendly<T>(task: () => T): T {
  try {
    return task();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("分组名已存在", { cause: error });
    }
    throw error;
  }
}

ipcMain.handle("library:load", () => handleIpc("library:load", loadLibrary));

ipcMain.handle("library:scan", (event) =>
  handleIpcAsync("library:scan", () => runScan(event.sender)),
);

ipcMain.handle("groups:create", (_event, name: unknown) =>
  handleIpc("groups:create", () => {
    const group = duplicateFriendly(() => createGroup(assertName(name)));
    return { id: group.id, name: group.name, sort: group.sort };
  }),
);

ipcMain.handle("groups:rename", (_event, id: unknown, name: unknown) =>
  handleIpc("groups:rename", () => {
    duplicateFriendly(() => renameGroup(assertId(id), assertName(name)));
  }),
);

ipcMain.handle("groups:delete", (_event, id: unknown) =>
  handleIpc("groups:delete", () => {
    deleteGroup(assertId(id));
  }),
);

ipcMain.handle("memberships:add", (_event, appIds: unknown, groupId: unknown) =>
  handleIpc("memberships:add", () => {
    const id = assertId(groupId);
    if (!groupExists(id)) throw new Error("分组不存在");
    addMembers(assertIds(appIds), id);
  }),
);

ipcMain.handle("memberships:remove", (_event, appIds: unknown, groupId: unknown) =>
  handleIpc("memberships:remove", () => {
    removeMembers(assertIds(appIds), assertId(groupId));
  }),
);

ipcMain.handle("apps:launch", (_event, appId: unknown) =>
  handleIpcAsync("apps:launch", async () => {
    const appRecord = getApp(assertId(appId));
    if (!appRecord) return { ok: false, error: "应用不存在" };
    if (!existsSync(appRecord.launchPath)) {
      markAppMissing(appRecord.id);
      return { ok: false, error: "文件不存在" };
    }
    const error = await shell.openPath(appRecord.launchPath);
    if (error) return { ok: false, error };
    return { ok: true };
  }),
);

ipcMain.handle("log:renderer", (_event, level: unknown, message: unknown) => {
  if (typeof level !== "string" || !LOG_LEVELS.has(level)) throw new Error("无效日志级别");
  if (typeof message !== "string") throw new Error("无效日志内容");
  log[level as "error" | "warn" | "info" | "debug"](`[renderer] ${message}`);
});

function createWindow(): void {
  const iconPath = devUrl
    ? join(app.getAppPath(), "resources/icon.png")
    : join(process.resourcesPath, "icon.png");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Program Groups",
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: "#0b0d12",
    webPreferences: {
      preload: join(app.getAppPath(), "out/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(app.getAppPath(), "out/renderer/index.html"));
  }

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    log.error(`[preload] ${preloadPath} ${error.message}`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    log.error(`[renderer gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  log.info(
    `[start] electron=${process.versions.electron} node=${process.versions.node} ` +
      `data=${dataRoot()} db=${databasePath()} log=${logPath}`,
  );
  openDatabase(databasePath());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  log.debug("[quit] 关闭数据库");
  closeDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
