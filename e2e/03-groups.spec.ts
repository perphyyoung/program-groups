import { expect, test } from "./fixtures";

test("新建分组自动聚焦并保留当前栏，多组归属重启后保留", async ({ slot }) => {
  const { page } = slot;
  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appCard).toBeVisible();

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await expect(page.getByLabel("分组名")).toBeFocused();
  await page.getByLabel("分组名").fill("测试组");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toBeVisible();
  /* 新建后不跳转到空分组，仍停在原视图 */
  await expect(page.getByRole("heading", { name: "未分组", exact: true })).toBeVisible();
  await expect(appCard).toBeVisible();

  await appCard.click();
  await page.getByLabel("选择分组").selectOption({ label: "测试组" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toContainText("1");

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await page.getByLabel("分组名").fill("常用");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByRole("heading", { name: "未分组", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  await appCard.click();
  await page.getByLabel("选择分组").selectOption({ label: "常用" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "常用", exact: true })).toContainText("1");
  await expect(appCard).toContainText("测试组");
  await expect(appCard).toContainText("常用");

  await slot.relaunch();
  const restarted = slot.page;
  const allNav = restarted.getByRole("button", { name: "全部应用", exact: true });
  await expect(allNav).toBeVisible();
  await allNav.click();
  const restoredCard = restarted.getByRole("button", { name: "测试应用", exact: true });
  await expect(restoredCard).toBeVisible();
  await expect(restarted.getByRole("button", { name: "测试组", exact: true })).toContainText("1");
  await expect(restarted.getByRole("button", { name: "常用", exact: true })).toContainText("1");
  await expect(restoredCard).toContainText("测试组");
});
