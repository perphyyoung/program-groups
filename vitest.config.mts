import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /* 纯逻辑与数据层都放在 node 环境测试；e2e 由 Playwright 单独执行 */
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
  },
});
