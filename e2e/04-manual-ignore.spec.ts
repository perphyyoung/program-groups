import { expect, test } from "./fixtures";

test("手动忽略持久化，拖入分组后自动恢复", async ({ slot }) => {
  const { page } = slot;
  await expect(page.getByRole("button", { name: "测试应用", exact: true })).toBeVisible();

  /* 准备一个分组，供手动忽略项拖入 */
  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await page.getByLabel("分组名").fill("测试组");
  await page.getByRole("button", { name: "创建分组", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "手动忽略「测试应用」", exact: true }).click();
  await expect(page.getByText("所有应用都已归类", { exact: true })).toBeVisible();
  const ignoredNav = page.getByRole("button", { name: "已忽略", exact: true });
  await expect(ignoredNav).toContainText("2");

  /* 全部应用勾选包含已忽略项时，手动忽略应用也出现 */
  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  const includeIgnored = page.getByLabel("包含已忽略项", { exact: true });
  await includeIgnored.check();
  await expect(
    page.getByRole("button", { name: "取消忽略「测试应用」", exact: true }),
  ).toBeVisible();
  await includeIgnored.uncheck();

  await ignoredNav.click();
  await expect(page.getByRole("button", { name: "手动忽略", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "取消忽略「测试应用」", exact: true }),
  ).toBeVisible();

  /* 重启后仍保留手动忽略 */
  await slot.relaunch();
  const restarted = slot.page;
  await restarted.getByRole("button", { name: "已忽略", exact: true }).click();
  const restoreButton = restarted.getByRole("button", {
    name: "取消忽略「测试应用」",
    exact: true,
  });
  await expect(restoreButton).toBeVisible();

  /* 拖到侧栏分组：加入分组后自动解除手动忽略 */
  /* 拖拽入口是行首握把，整行不可拖 */
  const manualHandle = restarted.getByTitle("拖动「测试应用」到分组", { exact: true });
  const groupNav = restarted.getByRole("button", { name: "测试组", exact: true });
  await expect(manualHandle).toBeVisible();
  await manualHandle.dragTo(groupNav);
  await expect(groupNav).toContainText("1");
  await expect(restoreButton).toHaveCount(0);

  await restarted.getByRole("button", { name: "全部应用", exact: true }).click();
  const restoredCard = restarted.getByRole("button", { name: "测试应用", exact: true });
  await expect(restoredCard).toBeVisible();
  await expect(restoredCard).toContainText("测试组");
});
