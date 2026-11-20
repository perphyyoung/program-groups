import process from "node:process";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  expect: { timeout: 3_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  fullyParallel: false,
  reporter: "list",
  use: { trace: "on-first-retry" },
});
