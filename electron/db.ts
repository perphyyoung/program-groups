import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AppRecord, ScanSummary } from "../src/lib/types";
import type { ShortcutCandidate } from "../src/lib/scan-rules";

export interface DiscoveredApp extends ShortcutCandidate {
  iconFile: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  sort: number;
  createdAt: string;
}

export interface MembershipRow {
  appId: string;
  groupId: string;
}

interface AppDbRow {
  id: string;
  name: string;
  launch_path: string;
  launch_kind: "lnk" | "exe";
  exe_path: string;
  icon_file: string | null;
  status: "active" | "missing";
  first_seen_at: string;
  last_seen_at: string;
}

interface GroupDbRow {
  id: string;
  name: string;
  sort: number;
  created_at: string;
}

interface MembershipDbRow {
  app_id: string;
  group_id: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apps (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  launch_path      TEXT NOT NULL,
  launch_kind      TEXT NOT NULL,
  exe_path         TEXT NOT NULL,
  icon_file        TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_groups (
  app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
CREATE INDEX IF NOT EXISTS idx_apps_name ON apps(name);
CREATE INDEX IF NOT EXISTS idx_app_groups_group ON app_groups(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_name ON groups(name COLLATE NOCASE);
`;

let db: DatabaseSync | null = null;

function requireDb(): DatabaseSync {
  if (!db) throw new Error("数据库尚未初始化");
  return db;
}

export function openDatabase(dbPath: string): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO NOTHING",
  ).run();
  return db;
}

export function closeDatabase(): void {
  if (!db) return;
  db.close();
  db = null;
}

function toApp(row: AppDbRow): AppRecord {
  return {
    id: row.id,
    name: row.name,
    launchPath: row.launch_path,
    launchKind: row.launch_kind,
    exePath: row.exe_path,
    iconFile: row.icon_file,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

function toGroup(row: GroupDbRow): GroupRow {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    createdAt: row.created_at,
  };
}

export function listActiveApps(): AppRecord[] {
  const rows = requireDb()
    .prepare("SELECT * FROM apps WHERE status = 'active' ORDER BY name COLLATE NOCASE")
    .all() as unknown as AppDbRow[];
  return rows.map(toApp);
}

export function listGroups(): GroupRow[] {
  const rows = requireDb()
    .prepare("SELECT * FROM groups ORDER BY sort, name COLLATE NOCASE")
    .all() as unknown as GroupDbRow[];
  return rows.map(toGroup);
}

export function listMemberships(): MembershipRow[] {
  const rows = requireDb()
    .prepare("SELECT app_id, group_id FROM app_groups")
    .all() as unknown as MembershipDbRow[];
  return rows.map((row) => ({ appId: row.app_id, groupId: row.group_id }));
}

export function countMissing(): number {
  const row = requireDb()
    .prepare("SELECT COUNT(*) AS count FROM apps WHERE status = 'missing'")
    .get() as unknown as { count: number };
  return row.count;
}

export function getApp(id: string): AppRecord | null {
  const row = requireDb().prepare("SELECT * FROM apps WHERE id = ?").get(id) as
    | AppDbRow
    | undefined;
  return row ? toApp(row) : null;
}

export function markAppMissing(id: string): void {
  requireDb().prepare("UPDATE apps SET status = 'missing' WHERE id = ?").run(id);
}

/** 扫描结果与库内状态对账：新增、更新、标记缺失；不删除任何应用与归属 */
export function reconcile(
  discovered: DiscoveredApp[],
  scanStartedAt: string,
): Pick<ScanSummary, "added" | "updated" | "missing"> {
  const database = requireDb();
  const existing = new Set(
    (database.prepare("SELECT id FROM apps").all() as unknown as Array<{ id: string }>).map(
      (row) => row.id,
    ),
  );

  const upsert = database.prepare(`
    INSERT INTO apps (
      id, name, launch_path, launch_kind, exe_path, icon_file,
      status, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      launch_path = excluded.launch_path,
      launch_kind = excluded.launch_kind,
      exe_path = excluded.exe_path,
      icon_file = COALESCE(excluded.icon_file, apps.icon_file),
      status = 'active',
      last_seen_at = excluded.last_seen_at
  `);

  let added = 0;
  database.exec("BEGIN");
  try {
    for (const app of discovered) {
      if (!existing.has(app.id)) added += 1;
      upsert.run(
        app.id,
        app.name,
        app.launchPath,
        app.launchKind,
        app.exePath,
        app.iconFile,
        scanStartedAt,
        scanStartedAt,
      );
    }
    const missingResult = database
      .prepare("UPDATE apps SET status = 'missing' WHERE status = 'active' AND last_seen_at < ?")
      .run(scanStartedAt);
    database.exec("COMMIT");
    return {
      added,
      updated: discovered.length - added,
      missing: Number(missingResult.changes),
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createGroup(name: string): GroupRow {
  const database = requireDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const row = database.prepare("SELECT COALESCE(MAX(sort), 0) AS maxSort FROM groups").get() as
    | { maxSort: number }
    | undefined;
  const sort = (row?.maxSort ?? 0) + 1;
  database
    .prepare("INSERT INTO groups (id, name, sort, created_at) VALUES (?, ?, ?, ?)")
    .run(id, name, sort, createdAt);
  return { id, name, sort, createdAt };
}

export function renameGroup(id: string, name: string): void {
  const result = requireDb().prepare("UPDATE groups SET name = ? WHERE id = ?").run(name, id);
  if (Number(result.changes) === 0) throw new Error("分组不存在");
}

export function deleteGroup(id: string): void {
  requireDb().prepare("DELETE FROM groups WHERE id = ?").run(id);
}

export function groupExists(id: string): boolean {
  return Boolean(requireDb().prepare("SELECT 1 FROM groups WHERE id = ?").get(id));
}

export function addMembers(appIds: string[], groupId: string): void {
  const database = requireDb();
  if (!groupExists(groupId)) throw new Error("分组不存在");
  const createdAt = new Date().toISOString();
  const insert = database.prepare(
    "INSERT OR IGNORE INTO app_groups (app_id, group_id, created_at) VALUES (?, ?, ?)",
  );
  database.exec("BEGIN");
  try {
    for (const appId of appIds) insert.run(appId, groupId, createdAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function removeMembers(appIds: string[], groupId: string): void {
  const database = requireDb();
  const remove = database.prepare("DELETE FROM app_groups WHERE app_id = ? AND group_id = ?");
  database.exec("BEGIN");
  try {
    for (const appId of appIds) remove.run(appId, groupId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
