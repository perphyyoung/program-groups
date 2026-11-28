import { rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Page } from "@playwright/test";
import { createShortcut, refreshLibrary as refresh } from "./e2e-helper";
import { expect, test } from "./fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;
const notepad = join(process.env["WINDIR"] ?? "C:\\Windows", "System32", "notepad.exe");

/** fixture 三个快捷方式指向同一 exe：只删「测试应用」会被「副本」去重顶替而不缺失，必须全删 */
function removeShortcuts(scanDir: string): void {
  rmSync(join(scanDir, "测试应用.lnk"), { force: true });
  rmSync(join(scanDir, "测试应用 帮助.lnk"), { force: true });
  rmSync(join(scanDir, "测试应用 副本.lnk"), { force: true });
}

/** retry 幂等：覆盖写快捷方式，放回后刷新即恢复 active */
function ensureShortcut(scanDir: string): void {
  createShortcut(scanDir, "测试应用", notepad);
}

async function openRecent(page: Page): Promise<void> {
  await page.getByRole("button", { name: "近期变化", exact: true }).click();
}

test("首次扫描收录进默认窗口，新增块展示且天数校验生效", async ({ slot }) => {
  const { page } = slot;
  const recentNav = page.getByRole("button", { name: "近期变化", exact: true });
  await expect(recentNav).toContainText("1");
  await openRecent(page);
  await expect(page.getByRole("heading", { name: "近期变化", exact: true })).toBeVisible();
  await expect(page.getByTestId("recent-added").getByText("新增 1", { exact: true })).toBeVisible();
  await expect(page.getByText("测试应用", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recent-restored")).toHaveCount(0);
  await expect(page.getByTestId("recent-missing")).toHaveCount(0);

  /* 天数输入：非法值行内报错且不写库，合法值即时生效 */
  const days = page.getByLabel("最近", { exact: true });
  await days.fill("0");
  await days.blur();
  await expect(page.getByText("请输入 1–365 的整数", { exact: true })).toBeVisible();
  await days.fill("14");
  await days.blur();
  await expect(page.getByText("请输入 1–365 的整数", { exact: true })).toHaveCount(0);
});

test("缺失块展示，行内删除走确认后回到空态", async ({ slot }) => {
  const { page } = slot;
  ensureShortcut(slot.scanDir);
  await refresh(page);
  removeShortcuts(slot.scanDir);
  await refresh(page);
  await expect(page.getByRole("button", { name: "缺失应用", exact: true })).toContainText("1");

  await openRecent(page);
  /* 同 worker 时用例 1 已把天数改成 14，先重置为 7，保证空态文案确定 */
  const days = page.getByLabel("最近", { exact: true });
  await days.fill("7");
  await days.blur();
  await expect(
    page.getByTestId("recent-missing").getByText("缺失 1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("测试应用", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "删除「测试应用」", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除缺失应用「测试应用」？", exact: true });
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("近 7 天没有变化", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "缺失应用", exact: true })).toContainText("0");
});

test("窗口判定：clock 快进移出窗口，放宽天数回到窗口", async ({ slot }) => {
  const { page } = slot;
  ensureShortcut(slot.scanDir);
  await refresh(page);
  removeShortcuts(slot.scanDir);
  await refresh(page);
  await expect(page.getByRole("button", { name: "缺失应用", exact: true })).toContainText("1");

  await openRecent(page);
  const days = page.getByLabel("最近", { exact: true });
  await days.fill("7");
  await days.blur();
  await expect(
    page.getByTestId("recent-missing").getByText("缺失 1", { exact: true }),
  ).toBeVisible();

  /* 官方推荐 setFixedTime：只影响渲染进程 Date，让扫描产生的真实时间戳「变旧」。
     时间不是 Vue 响应式依赖，快进后靠改天数触发重算：8 天窗口下缺失在窗口外 */
  await page.clock.setFixedTime(new Date(Date.now() + 20 * DAY_MS));
  await days.fill("8");
  await days.blur();
  await expect(page.getByTestId("recent-missing")).toHaveCount(0);
  await expect(page.getByText("近 8 天没有变化", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "近期变化", exact: true })).toContainText("0");

  /* 放宽到 30 天后缺失回到窗口内 */
  await days.fill("30");
  await days.blur();
  await expect(
    page.getByTestId("recent-missing").getByText("缺失 1", { exact: true }),
  ).toBeVisible();
});

test("恢复：first_seen 在窗口外、状态刚变回 active 归入恢复块", async ({ slot }) => {
  /* seed 前提是行已存在：refresh 等待扫描完成，无论应用是 active 还是 missing 行都在库里。
     relaunch 会替换 slot.page，旧解构引用指向已关闭实例，relaunch 后必须用 slot.page */
  await refresh(slot.page);
  await slot.app.close().catch(() => undefined);
  const db = new DatabaseSync(join(slot.appData, "pg.db"));
  db.prepare(
    "UPDATE apps SET status = 'missing', first_seen_at = ?, status_changed_at = ? WHERE name = '测试应用'",
  ).run(new Date(Date.now() - 20 * DAY_MS).toISOString(), new Date().toISOString());
  db.close();
  await slot.relaunch();

  const page = slot.page;
  await openRecent(page);
  /* 同 worker 时用例 3 可能留下 30 天窗口：重置为 7，保证 first_seen(20 天前) 在窗口外 */
  const days = page.getByLabel("最近", { exact: true });
  await days.fill("7");
  await days.blur();
  await expect(
    page.getByTestId("recent-missing").getByText("缺失 1", { exact: true }),
  ).toBeVisible();

  /* 放回快捷方式刷新：first_seen 窗口外 + changed 刚刚 → 恢复块而非新增块 */
  ensureShortcut(slot.scanDir);
  await refresh(page);
  await expect(
    page.getByTestId("recent-restored").getByText("恢复 1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("recent-missing")).toHaveCount(0);
});

test("天数持久化：meta seed 后重启展示", async ({ slot }) => {
  await slot.app.close().catch(() => undefined);
  const db = new DatabaseSync(join(slot.appData, "pg.db"));
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('recent_window_days', '30') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run();
  db.close();
  await slot.relaunch();

  const page = slot.page;
  await openRecent(page);
  await expect(page.getByLabel("最近", { exact: true })).toHaveValue("30");
});
