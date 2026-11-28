import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { test as base, expect, type ElectronApplication, type Page } from "@playwright/test";
import { createShortcut, launchApp, makeWorkdir } from "./e2e-helper";
import { log } from "./e2e-logger";

export interface AppSlot {
  app: ElectronApplication;
  page: Page;
  /** 本次实例的临时根目录，随实例一起销毁 */
  base: string;
  appData: string;
  /** 扫描 fixture 的开始菜单目录 */
  scanDir: string;
  /** 关掉当前实例、用同一数据目录与扫描目录重启，用于验证启动回填 */
  relaunch(): Promise<void>;
}

interface AppPool {
  acquire(file: string): Promise<AppSlot>;
  /** 用例失败后丢弃实例：脏状态（缺失标记、改过的天数等）不能带进下一个用例 */
  discard(file: string): Promise<void>;
}

async function dispose(slot: AppSlot): Promise<void> {
  await slot.app.close().catch(() => undefined);
  await rm(slot.base, { recursive: true, force: true }).catch(() => undefined);
}

async function createSlot(workerIndex: number, seq: number): Promise<AppSlot> {
  const workdir = await makeWorkdir(`pg-w${workerIndex}-${seq}-`);
  const appData = join(workdir, "appdata");
  const scanDir = join(workdir, "scan");
  await mkdir(appData, { recursive: true });

  /* 固定的开始菜单 fixture：一个正常应用、一个帮助入口、一个重复快捷方式 */
  const target = join(process.env["WINDIR"] ?? "C:\\Windows", "System32", "notepad.exe");
  createShortcut(scanDir, "测试应用", target);
  createShortcut(scanDir, "测试应用 帮助", target);
  createShortcut(scanDir, "测试应用 副本", target);

  const { app, page } = await launchApp(appData, scanDir);

  const slot: AppSlot = {
    app,
    page,
    base: workdir,
    appData,
    scanDir,
    async relaunch() {
      await this.app.close().catch(() => undefined);
      const next = await launchApp(this.appData, this.scanDir);
      this.app = next.app;
      this.page = next.page;
      log.info(`[e2e] relaunch 完成 closed=${this.page.isClosed()} url=${this.page.url()}`);
    },
  };
  return slot;
}

/**
 * Playwright 没有 file scope fixture，worker 会顺序跑多个 spec 文件。
 * 这里在 worker 级维护实例池，按 testInfo.file 切换：换文件才关旧起新。
 */
export const test = base.extend<{ slot: AppSlot }, { appPool: AppPool }>({
  appPool: [
    // eslint-disable-next-line no-empty-pattern -- Playwright 要求第一个参数是解构模式
    async ({}, use, workerInfo) => {
      let seq = 0;
      const state: { current: { file: string; slot: AppSlot } | null } = { current: null };

      await use({
        async acquire(file) {
          if (state.current?.file === file) return state.current.slot;
          if (state.current) await dispose(state.current.slot);
          const slot = await createSlot(workerInfo.workerIndex, seq);
          seq += 1;
          state.current = { file, slot };
          return slot;
        },
        async discard(file) {
          if (state.current?.file !== file) return;
          await dispose(state.current.slot);
          state.current = null;
        },
      });

      if (state.current) await dispose(state.current.slot);
    },
    { scope: "worker" },
  ],

  slot: [
    async ({ appPool }, use, testInfo) => {
      await use(await appPool.acquire(testInfo.file));
      /* 失败用例的状态不可信：丢弃实例，下一个用例 acquire 时重建干净实例 */
      if (testInfo.status !== "passed" && testInfo.status !== "skipped") {
        await appPool.discard(testInfo.file);
      }
    },
    /* 启动耗时不计入用例自身的 timeout */
    { scope: "test", timeout: 15_000 },
  ],
});

/* 用例标题与结果进日志：多 worker 交错时能按用例切段 */
// eslint-disable-next-line no-empty-pattern -- Playwright 要求第一个参数是解构模式
test.beforeEach(({}, testInfo) => {
  log.info(`[e2e w${testInfo.workerIndex}] ▶ ${testInfo.titlePath.slice(1).join(" › ")}`);
});

// eslint-disable-next-line no-empty-pattern -- Playwright 要求第一个参数是解构模式
test.afterEach(({}, testInfo) => {
  const name = testInfo.titlePath.slice(1).join(" › ");
  const ms = testInfo.duration;
  if (testInfo.status === "passed") {
    log.info(`[e2e w${testInfo.workerIndex}] ✓ 通过 ${ms}ms ${name}`);
    return;
  }
  log.error(`[e2e w${testInfo.workerIndex}] ✗ ${testInfo.status} ${ms}ms ${name}`);
});

export { expect };
