import { expect, test } from "./fixtures";

test("启动后展示未分组骨架与侧栏计数", async ({ slot }) => {
  const { page } = slot;

  await expect(page.getByRole("heading", { name: "未分组", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("搜索当前列表", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toBeEnabled();
  await expect(page.getByTestId("app-list")).toBeVisible();
  await expect(page.getByTestId("app-grid")).toHaveCount(0);

  /* 显示方式：互斥按钮，默认列表；状态只从 aria-pressed 读取 */
  const layoutGroup = page.getByRole("group", { name: "显示方式", exact: true });
  const listButton = layoutGroup.getByRole("button", { name: "列表", exact: true });
  const gridButton = layoutGroup.getByRole("button", { name: "网格", exact: true });
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(gridButton).toHaveAttribute("aria-pressed", "false");

  await gridButton.click();
  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  await expect(listButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("app-grid")).toBeVisible();
  await expect(page.getByTestId("app-list")).toHaveCount(0);

  await expect(page.getByRole("button", { name: "全部应用", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "未分组", exact: true })).toContainText("1");
  await expect(page.getByRole("button", { name: "已忽略", exact: true })).toContainText("1");

  /* 页脚是动态文案：锚定整行，避免与侧栏计数混淆；正则不做 trim，用 \s* 容忍首尾空白 */
  await expect(page.getByText(/^\s*共 1 个应用 · 未分组 1\s*$/u)).toBeVisible();
});
