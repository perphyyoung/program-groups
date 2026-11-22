import process from "node:process";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  /* 单条用例上限 10s，fixtures 的启动预算独立计算；断言默认 5s */
  timeout: 10_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  fullyParallel: false,
  reporter: "list",
  use: { trace: "on-first-retry" },
});
