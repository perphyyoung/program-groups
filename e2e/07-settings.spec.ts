import { expect, test } from "./fixtures";

test("设置页按需更新图标缓存，支持全量重建", async ({ slot }) => {
  const { page } = slot;

  await expect(page.getByRole("button", { name: "测试应用", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "图标缓存", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "start", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "store", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "green", exact: true })).toBeDisabled();
  const iconRegion = page.getByRole("region", { name: "图标缓存", exact: true });
  const cacheProgress = iconRegion.getByRole("progressbar", {
    name: "图标缓存进度",
    exact: true,
  });
  await expect(cacheProgress).toHaveJSProperty("value", 0);
  await expect(cacheProgress).toHaveJSProperty("max", 1);
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "更新图标缓存", exact: true }).click();
  await expect(page.getByText(/^图标缓存已更新：新增 1，复用 0，失败 0$/u)).toBeVisible();
  await expect(cacheProgress).toHaveJSProperty("value", 1);

  await page.getByRole("button", { name: "未分组", exact: true }).click();
  const icon = page.getByRole("img", { name: "测试应用", exact: true });
  await expect(icon).toHaveAttribute("src", /^pg-icon:\/\//u);

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByText(/^图标缓存已更新/u)).toBeHidden({ timeout: 5000 });
  const force = page.getByRole("checkbox", { name: "全量重建", exact: true });
  await force.check();
  await page.getByRole("button", { name: "重建图标缓存", exact: true }).click();
  await expect(page.getByText(/^图标缓存已更新：新增 1，复用 0，失败 0$/u)).toBeVisible();
});
