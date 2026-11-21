import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function openGroupMenu(page: Page, groupName: string): Promise<void> {
  await page.getByRole("button", { name: groupName, exact: true }).hover();
  await page.getByRole("button", { name: `分组操作「${groupName}」`, exact: true }).click();
  await expect(page.getByRole("menu", { name: "分组操作", exact: true })).toBeVisible();
}

test("新建分组自动聚焦并保留当前栏，多组归属重启后保留", async ({ slot }) => {
  const { page } = slot;
  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appCard).toBeVisible();

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await expect(page.getByLabel("分组名")).toBeFocused();
  await page.getByLabel("分组名").fill("测试组");
  await page.getByRole("button", { name: "创建分组", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toBeVisible();
  /* 新建后不跳转到空分组，仍停在原栏 */
  await expect(page.getByRole("heading", { name: "未分组", exact: true })).toBeVisible();
  await expect(appCard).toBeVisible();

  await appCard.click();
  const groupSelect = page.getByLabel("选择分组");
  /* 固定宽度按 4 个中文字预留，选择不同分组时不跳动 */
  const selectBox = await groupSelect.boundingBox();
  expect(selectBox?.width ?? 0).toBeGreaterThanOrEqual(94);
  expect(selectBox?.width ?? 0).toBeLessThanOrEqual(98);
  await groupSelect.selectOption({ label: "测试组" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "测试组", exact: true })).toContainText("1");

  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  await page.getByLabel("分组名").fill("常用");
  await page.getByRole("button", { name: "创建分组", exact: true }).click();
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

test("分组重命名与删除：行内校验、影响说明与焦点返回", async ({ slot }) => {
  const { page } = slot;

  /* 新建专用分组，并放入一个应用用于删除影响说明 */
  await page.getByRole("button", { name: "+ 新建分组", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "新建分组", exact: true });
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByLabel("分组名", { exact: true })).toBeFocused();
  await createDialog.getByLabel("分组名", { exact: true }).fill("整理组");
  await createDialog.getByRole("button", { name: "创建分组", exact: true }).click();
  await expect(page.getByRole("button", { name: "整理组", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await appCard.click();
  await page.getByLabel("选择分组").selectOption({ label: "整理组" });
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "整理组", exact: true })).toContainText("1");

  /* 重命名：自动聚焦全选，空值与未修改不可保存 */
  await openGroupMenu(page, "整理组");
  await page.getByRole("menuitem", { name: "重命名分组", exact: true }).click();
  const renameDialog = page.getByRole("dialog", { name: "重命名分组", exact: true });
  await expect(renameDialog).toBeVisible();
  const nameInput = renameDialog.getByLabel("分组名", { exact: true });
  await expect(nameInput).toBeFocused();
  const saveButton = renameDialog.getByRole("button", { name: "保存", exact: true });
  await nameInput.fill("");
  await expect(saveButton).toBeDisabled();
  await nameInput.fill("整理组");
  await expect(saveButton).toBeDisabled();
  await nameInput.fill("整理组 改名");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(renameDialog).toBeHidden();

  const renamedRow = page.getByRole("button", { name: "整理组 改名", exact: true });
  await expect(renamedRow).toBeVisible();

  /* 重名：错误留在弹窗内，焦点回到输入框 */
  await openGroupMenu(page, "整理组 改名");
  await page.getByRole("menuitem", { name: "重命名分组", exact: true }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "重命名分组", exact: true });
  const duplicateInput = duplicateDialog.getByLabel("分组名", { exact: true });
  await duplicateInput.fill("常用");
  await duplicateDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(duplicateDialog.getByText("分组名已存在", { exact: true })).toBeVisible();
  await expect(duplicateInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(duplicateDialog).toBeHidden();
  await expect(renamedRow).toBeVisible();

  /* 删除：取消默认聚焦，Esc 后焦点回到分组操作按钮 */
  await openGroupMenu(page, "整理组 改名");
  await page.getByRole("menuitem", { name: "删除分组", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", {
    name: "删除分组「整理组 改名」？",
    exact: true,
  });
  await expect(deleteDialog).toBeVisible();
  await expect(
    deleteDialog.getByText(
      "组内 1 个应用会失去这个分组；只属于它的应用会回到未分组。应用不会被卸载，其他分组不受影响。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await expect(renamedRow).toBeVisible();
  await expect(
    page.getByRole("button", { name: "分组操作「整理组 改名」", exact: true }),
  ).toBeFocused();

  /* 确认删除：分组消失，应用保留，焦点落到未分组 */
  await openGroupMenu(page, "整理组 改名");
  await page.getByRole("menuitem", { name: "删除分组", exact: true }).click();
  const confirmDialog = page.getByRole("dialog", {
    name: "删除分组「整理组 改名」？",
    exact: true,
  });
  await confirmDialog.getByRole("button", { name: "删除分组", exact: true }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole("button", { name: "整理组 改名", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "未分组", exact: true })).toBeFocused();
  await expect(appCard).not.toContainText("整理组 改名");
});
