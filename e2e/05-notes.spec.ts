import { expect, test } from "./fixtures";

test("应用与已忽略行备注持久化并参与搜索", async ({ slot }) => {
  const { page } = slot;
  /* 默认栏是近期变化，先切到未分组 */
  await page.getByRole("button", { name: "未分组", exact: true }).click();
  const appRow = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appRow).toBeVisible();

  await appRow.hover();
  await page.getByRole("button", { name: "添加「测试应用」的备注", exact: true }).click();
  const appNote = page.getByLabel("备注「测试应用」", { exact: true });
  await expect(appNote).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  await appNote.fill("截图");
  await appNote.press("Enter");
  await expect(
    page.getByRole("button", { name: "编辑「测试应用」的备注", exact: true }),
  ).toContainText("截图");

  const search = page.getByPlaceholder("搜索当前列表", { exact: true });
  await search.fill("截图");
  await expect(appRow).toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: "已忽略", exact: true }).click();
  const helpGroup = page.getByRole("button", { name: "帮助/说明", exact: true });
  await helpGroup.click();

  const helpName = page.getByText("测试应用 帮助", { exact: true });
  await expect(helpName).toBeVisible();
  await helpName.hover();
  await page.getByRole("button", { name: "添加「测试应用 帮助」的备注", exact: true }).click();
  const ignoredNote = page.getByLabel("备注「测试应用 帮助」", { exact: true });
  await expect(ignoredNote).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  await ignoredNote.fill("帮助文档");
  await ignoredNote.press("Enter");
  await expect(
    page.getByRole("button", { name: "编辑「测试应用 帮助」的备注", exact: true }),
  ).toContainText("帮助文档");

  await search.fill("帮助文档");
  await expect(helpGroup).toBeVisible();
  await expect(page.getByRole("button", { name: "重复快捷方式", exact: true })).toHaveCount(0);

  await slot.relaunch();
  const restarted = slot.page;
  /* relaunch 后默认停在近期变化，先切到未分组 */
  await restarted.getByRole("button", { name: "未分组", exact: true }).click();
  await expect(
    restarted.getByRole("button", { name: "编辑「测试应用」的备注", exact: true }),
  ).toContainText("截图");

  await restarted.getByRole("button", { name: "已忽略", exact: true }).click();
  await restarted.getByRole("button", { name: "帮助/说明", exact: true }).click();
  await expect(
    restarted.getByRole("button", { name: "编辑「测试应用 帮助」的备注", exact: true }),
  ).toContainText("帮助文档");
});
