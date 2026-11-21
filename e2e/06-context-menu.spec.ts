import { createShortcut } from "./e2e-helper";
import { expect, test } from "./fixtures";

test("应用行右键菜单提供启动与两项路径定位", async ({ slot }) => {
  const { page } = slot;
  const appRow = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appRow).toBeVisible();

  await appRow.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "行操作", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await expect(menu.getByRole("menuitem", { name: "启动", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "打开目标路径", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "打开链接路径", exact: true })).toBeEnabled();

  /* 鼠标悬停与键盘焦点保持同一项 */
  const targetItem = menu.getByRole("menuitem", { name: "打开目标路径", exact: true });
  await targetItem.hover();
  await expect(targetItem).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(appRow).toBeFocused();

  /* Tab 关闭菜单，焦点继续向后移动，不困在菜单里 */
  await appRow.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(appRow).not.toBeFocused();

  /* 键盘同样能打开同一菜单 */
  await appRow.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  /* Enter / Space 只切换选中，不启动 */
  await appRow.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("已选 1 项", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText("已选 1 项", { exact: true })).toHaveCount(0);
});

test("已忽略行右键菜单同样三项，缺失目标路径置灰", async ({ slot }) => {
  const { page } = slot;

  createShortcut(slot.scanDir, "测试应用 失效", "C:\\PG-Missing\\missing.exe");
  await page.getByRole("button", { name: "刷新", exact: true }).click();

  await page.getByRole("button", { name: "已忽略", exact: true }).click();
  const missingGroup = page.getByRole("button", { name: "目标文件不存在", exact: true });
  await expect(missingGroup).toBeVisible();
  await missingGroup.click();

  const missingRow = page.getByText("测试应用 失效", { exact: true });
  await expect(missingRow).toBeVisible();
  await missingRow.click({ button: "right" });

  const menu = page.getByRole("menu", { name: "行操作", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "启动", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "打开目标路径", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "打开链接路径", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");

  /* 全部应用栏的规则忽略行也允许启动 */
  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  await page.getByLabel("包含已忽略项", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "启动「测试应用 失效」", exact: true }),
  ).toBeVisible();
});

test("备注输入框内右键不弹出行菜单", async ({ slot }) => {
  const { page } = slot;
  const appRow = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appRow).toBeVisible();
  await appRow.hover();
  await page.getByRole("button", { name: "添加「测试应用」的备注", exact: true }).click();

  const noteInput = page.getByLabel("备注「测试应用」", { exact: true });
  await expect(noteInput).toBeFocused();
  await noteInput.dispatchEvent("contextmenu");
  await expect(page.getByRole("menu", { name: "行操作", exact: true })).toHaveCount(0);
  await noteInput.press("Escape");
});
