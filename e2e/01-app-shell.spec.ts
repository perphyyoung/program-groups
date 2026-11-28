import { expect, test } from "./fixtures";

test("启动后展示未分组骨架与侧栏计数", async ({ slot }) => {
  const { page } = slot;

  await expect(page.getByRole("heading", { name: "未分组", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("搜索当前列表", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toBeEnabled();
  await expect(page.getByTestId("app-list")).toBeVisible();
  /* 未分组栏不提供「包含已忽略项」 */
  await expect(page.getByRole("checkbox", { name: /^包含已忽略项$/u })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "近期变化", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "全部应用", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "未分组", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "已忽略", exact: true })).toContainText("1");

  /* 页脚是动态文案：锚定整行，避免与侧栏计数混淆；正则不做 trim，用 \s* 容忍首尾空白 */
  await expect(page.getByText(/^\s*共 1 个应用 · 未分组 1\s*$/u)).toBeVisible();
});
