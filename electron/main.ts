import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
  type WebContents,
} from "electron";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  addMembers,
  closeDatabase,
  countMissing,
  createGroup,
  deleteGroup,
  getApp,
  getGroupSortDirection,
  getGroupSortMode,
  groupExists,
  listActiveApps,
  listGroups,
  listManualIgnoredIds,
  listMemberships,
  listNotes,
  manualIgnoreApp,
  markAppMissing,
  openDatabase,
  reconcile,
  removeMembers,
  renameGroup,
  reorderGroups,
  restoreManualApp,
  setEntryTypes,
  setGroupSortDirection,
  setGroupSortMode,
  setNote,
} from "./db";
import { log, logPath } from "./logger";
import { extractIcons, scanStartMenu, startMenuRoots } from "./scan";
import { scanStoreApps } from "./store-scan";
import { entryTypesForIgnored } from "../src/lib/entry-types";
import { isGroupSortDirection, isGroupSortMode } from "../src/lib/group-order";
import type {
  AppEntry,
  AppRecord,
  AppSource,
  GroupEntry,
  GroupsData,
  LibraryData,
  ScanProgress,
  ScanSummary,
  ScannedApp,
} from "../src/lib/types";

protocol.registerSchemesAsPrivileged([
  { scheme: "pg-icon", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

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

function iconUrl(appId: string, iconFile: string | null): string | null {
  if (!iconFile) return null;
  try {
    const version = Math.trunc(statSync(join(dataRoot(), iconFile)).mtimeMs);
    return `pg-icon://${appId}?v=${version}`;
  } catch (error) {
    log.warn(
      `[icon] 读取失败 ${iconFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

interface GroupData {
  groups: GroupEntry[];
  memberships: { appId: string; groupId: string }[];
  groupIdsByApp: Map<string, string[]>;
}

function loadGroupData(
  apps: AppRecord[],
  countIds: Set<string> = new Set(apps.map((item) => item.id)),
): GroupData {
  const activeIds = new Set(apps.map((item) => item.id));
  const memberships = listMemberships().filter((membership) => activeIds.has(membership.appId));
  const groupIdsByApp = new Map<string, string[]>();
  const countsByGroup = new Map<string, number>();

  for (const membership of memberships) {
    const ids = groupIdsByApp.get(membership.appId) ?? [];
    ids.push(membership.groupId);
    groupIdsByApp.set(membership.appId, ids);
    if (countIds.has(membership.appId)) {
      countsByGroup.set(membership.groupId, (countsByGroup.get(membership.groupId) ?? 0) + 1);
    }
  }

  const groups = listGroups().map((group) => ({
    id: group.id,
    name: group.name,
    sort: group.sort,
    count: countsByGroup.get(group.id) ?? 0,
    createdAt: group.createdAt,
  }));

  return { groups, memberships, groupIdsByApp };
}

function toEntry(item: AppRecord, groupIdsByApp: Map<string, string[]>): AppEntry {
  return {
    id: item.id,
    name: item.name,
    launchPath: item.launchPath,
    launchKind: item.launchKind,
    exePath: item.exePath,
    iconFile: item.iconFile,
    source: item.source,
    status: item.status,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    groupIds: groupIdsByApp.get(item.id) ?? [],
    iconUrl: iconUrl(item.id, item.iconFile),
  };
}

function loadLibrary(): LibraryData {
  const active = listActiveApps();
  const manualIds = listManualIgnoredIds();
  const visible = active.filter((item) => !manualIds.has(item.id));
  const hidden = active.filter((item) => manualIds.has(item.id));
  const { groups, groupIdsByApp } = loadGroupData(active, new Set(visible.map((item) => item.id)));

  return {
    apps: visible.map((item) => toEntry(item, groupIdsByApp)),
    manualIgnored: hidden.map((item) => toEntry(item, groupIdsByApp)),
    groups,
    missingCount: countMissing(),
    notes: listNotes(),
    groupSortMode: getGroupSortMode(),
    groupSortDirection: getGroupSortDirection(),
  };
}

function loadGroups(): GroupsData {
  const active = listActiveApps();
  const manualIds = listManualIgnoredIds();
  const visibleIds = new Set(
    active.filter((item) => !manualIds.has(item.id)).map((item) => item.id),
  );
  const { groups, memberships } = loadGroupData(active, visibleIds);
  return { groups, memberships };
}

let scanning = false;

function launchAumid(aumid: string): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", fail);
    child.once("spawn", () => {
      child.unref();
      done();
    });
  });
}

async function runScan(sender: WebContents): Promise<ScanSummary> {
  if (scanning) throw new Error("扫描正在进行");
  scanning = true;
  try {
    const scanStartedAt = new Date().toISOString();
    mkdirSync(join(dataRoot(), "icons"), { recursive: true });
    const onProgress = (progress: ScanProgress): void => {
      sender.send("scan:progress", progress);
    };

    const startResult = scanStartMenu(onProgress);
    sender.send("scan:progress", { phase: "store", done: 0, total: 1 });
    const storeResult = await scanStoreApps();
    sender.send("scan:progress", { phase: "store", done: 1, total: 1 });
    const iconResult = await extractIcons(startResult.candidates, dataRoot(), onProgress);
    const discovered: ScannedApp[] = [
      ...startResult.candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        launchPath: candidate.launchPath,
        launchKind: candidate.launchKind,
        exePath: candidate.exePath,
        source: "start" as const,
        iconFile: iconResult.icons.get(candidate.id) ?? null,
      })),
      ...storeResult.apps,
    ];
    const scannedSources = new Set<AppSource>(["start"]);
    if (storeResult.ok) scannedSources.add("store");
    const reconciled = reconcile(discovered, scanStartedAt, scannedSources);
    const discoveredIds = new Set(discovered.map((item) => item.id));
    const entryTypeChanges = setEntryTypes(
      entryTypesForIgnored(startResult.ignoredItems, discoveredIds),
    );
    const summary: ScanSummary = {
      scanned: startResult.scanned + storeResult.apps.length + storeResult.ignored.length,
      kept: discovered.length,
      ignored: startResult.ignored + storeResult.ignored.length,
      ignoredItems: [...startResult.ignoredItems, ...storeResult.ignored],
      duplicate: startResult.duplicate,
      duplicateItems: startResult.duplicateItems,
      ...reconciled,
      changed: reconciled.changed || iconResult.extracted > 0 || entryTypeChanges > 0,
    };
    sender.send("scan:progress", { phase: "done", done: 1, total: 1 });
    log.info(
      `[scan] scanned=${summary.scanned} kept=${summary.kept} store=${storeResult.apps.length} ` +
        `storeIgnored=${storeResult.ignored.length} storeOk=${storeResult.ok} ` +
        `ignored=${summary.ignored} duplicate=${summary.duplicate} ` +
        `icons=${iconResult.extracted}/${iconResult.cached} added=${summary.added} ` +
        `missing=${summary.missing} entryTypes=${entryTypeChanges}`,
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

function assertAumid(value: unknown): string {
  if (typeof value !== "string" || !value.includes("!")) throw new Error("AUMID 无效");
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

function assertGroupIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("分组顺序无效");
  const ids = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (ids.length !== value.length) throw new Error("分组顺序无效");
  return ids;
}

function assertNoteKey(value: unknown): string {
  if (typeof value !== "string") throw new Error("备注键无效");
  if (!value.startsWith("app:") && !value.startsWith("shortcut:")) {
    throw new Error("备注键无效");
  }
  return value;
}

function assertNote(value: unknown): string {
  if (typeof value !== "string") throw new Error("备注无效");
  const note = value.trim();
  if (note.length > 10) throw new Error("备注最多 10 个字");
  return note;
}

function startMenuShortcutPath(value: unknown): { path: string } | { error: string } {
  if (typeof value !== "string" || value.length === 0) return { error: "路径无效" };
  const resolved = resolve(value);
  if (extname(resolved).toLowerCase() !== ".lnk") return { error: "只能打开快捷方式" };
  if (!existsSync(resolved)) return { error: "快捷方式不存在" };
  const inStartMenu = startMenuRoots().some((root) =>
    resolved.toLowerCase().startsWith(`${root.toLowerCase()}\\`),
  );
  if (!inStartMenu) return { error: "快捷方式不在开始菜单目录内" };
  return { path: resolved };
}

function pathExists(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return existsSync(resolve(value));
  } catch {
    return false;
  }
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

ipcMain.handle("library:groups", () => handleIpc("library:groups", loadGroups));

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

ipcMain.handle("groups:reorder", (_event, ids: unknown) =>
  handleIpc("groups:reorder", () => {
    reorderGroups(assertGroupIds(ids));
  }),
);

ipcMain.handle("groups:setSortMode", (_event, mode: unknown) =>
  handleIpc("groups:setSortMode", () => {
    if (!isGroupSortMode(mode)) throw new Error("排序方式无效");
    setGroupSortMode(mode);
  }),
);

ipcMain.handle("groups:setSortDirection", (_event, direction: unknown) =>
  handleIpc("groups:setSortDirection", () => {
    if (!isGroupSortDirection(direction)) throw new Error("排序方向无效");
    setGroupSortDirection(direction);
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
    if (appRecord.launchKind === "aumid") {
      try {
        await launchAumid(appRecord.launchPath);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (!existsSync(appRecord.launchPath)) {
      markAppMissing(appRecord.id);
      return { ok: false, error: "文件不存在" };
    }
    const error = await shell.openPath(appRecord.launchPath);
    if (error) return { ok: false, error };
    return { ok: true };
  }),
);

ipcMain.handle("store:launch", (_event, aumid: unknown) =>
  handleIpcAsync("store:launch", async () => {
    try {
      await launchAumid(assertAumid(aumid));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }),
);

ipcMain.handle("apps:manualIgnore", (_event, appId: unknown) =>
  handleIpc("apps:manualIgnore", () => {
    manualIgnoreApp(assertId(appId));
  }),
);

ipcMain.handle("apps:manualRestore", (_event, appId: unknown) =>
  handleIpc("apps:manualRestore", () => {
    restoreManualApp(assertId(appId));
  }),
);

ipcMain.handle("notes:set", (_event, key: unknown, note: unknown) =>
  handleIpc("notes:set", () => {
    setNote(assertNoteKey(key), assertNote(note));
  }),
);

ipcMain.handle("apps:revealShortcut", (_event, shortcutPath: unknown) =>
  handleIpcAsync("apps:revealShortcut", async () => {
    const target = startMenuShortcutPath(shortcutPath);
    if ("error" in target) return { ok: false, error: target.error };
    shell.showItemInFolder(target.path);
    return { ok: true };
  }),
);

ipcMain.handle("shortcuts:launch", (_event, shortcutPath: unknown) =>
  handleIpcAsync("shortcuts:launch", async () => {
    const target = startMenuShortcutPath(shortcutPath);
    if ("error" in target) return { ok: false, error: target.error };
    const error = await shell.openPath(target.path);
    if (error) return { ok: false, error };
    return { ok: true };
  }),
);

ipcMain.handle("paths:reveal", (_event, path: unknown) =>
  handleIpcAsync("paths:reveal", async () => {
    if (typeof path !== "string" || path.length === 0) return { ok: false, error: "路径无效" };
    const resolved = resolve(path);
    if (!existsSync(resolved)) return { ok: false, error: "文件不存在" };
    shell.showItemInFolder(resolved);
    return { ok: true };
  }),
);

ipcMain.handle("paths:check", (_event, paths: unknown) =>
  handleIpc("paths:check", () => {
    const input =
      paths !== null && typeof paths === "object" ? (paths as Record<string, unknown>) : {};
    return {
      run: pathExists(input["run"]),
      target: pathExists(input["target"]),
      link: pathExists(input["link"]),
    };
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
  protocol.handle("pg-icon", async (request) => {
    const id = new URL(request.url).hostname;
    if (!/^[a-f0-9]{16}$/u.test(id)) return new Response("Not found", { status: 404 });
    const filePath = join(dataRoot(), "icons", `${id}.png`);
    if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      return new Response(response.body, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (error) {
      log.warn(
        `[icon] 协议读取失败 ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Response("Not found", { status: 404 });
    }
  });
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
