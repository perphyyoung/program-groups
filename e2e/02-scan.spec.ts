import { expect, test } from "./fixtures";

test("扫描应用、图标、已忽略与重复快捷方式", async ({ slot }) => {
  const { page } = slot;

  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appCard).toBeVisible();
  await expect(page.getByText(/^扫描完成：新增 1，缺失 0，忽略 1，重复 1$/u)).toBeVisible();

  const appIcon = page.getByRole("img", { name: "测试应用", exact: true });
  await expect(appIcon).toHaveAttribute("src", /^pg-icon:\/\//u);
  await expect
    .poll(() => appIcon.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const ignoredNav = page.getByRole("button", { name: "已忽略", exact: true });
  await expect(ignoredNav).toContainText("1");
  await ignoredNav.click();
  await expect(page.getByText("测试应用 帮助", { exact: true })).toBeVisible();
  await expect(page.getByText("帮助/说明", { exact: true })).toBeVisible();
  await expect(page.getByText("另有 1 个重复快捷方式，应用已收录", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "未分组", exact: true }).click();
  await expect(appCard).toBeVisible();
});
