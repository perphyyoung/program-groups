import { copyFileSync } from "node:fs";
import { join } from "node:path";
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
  /* 已忽略视图不提供网格 / 列表切换 */
  await expect(page.getByRole("group", { name: "显示方式", exact: true })).toHaveCount(0);

  const helpGroup = page.getByRole("button", { name: "帮助/说明", exact: true });
  const duplicateGroup = page.getByRole("button", { name: "重复快捷方式", exact: true });
  await expect(helpGroup).toHaveAttribute("aria-expanded", "false");
  await expect(helpGroup).toContainText("1");
  await expect(duplicateGroup).toContainText("1");
  /* 默认折叠：条目在 DOM 中但不可见 */
  await expect(page.getByText("测试应用 帮助", { exact: true })).toBeHidden();

  await helpGroup.click();
  await expect(helpGroup).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("测试应用 帮助", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开「测试应用 帮助」所在位置", exact: true }),
  ).toBeVisible();

  await duplicateGroup.click();
  await expect(page.getByText("测试应用 副本", { exact: true })).toBeVisible();
  await expect(page.getByText("已收录为「测试应用」", { exact: true })).toBeVisible();
  await expect(
    page.getByText("这些快捷方式指向已收录的应用，可直接删除", { exact: true }),
  ).toBeVisible();

  /* 搜索时命中组强制展开，清空后恢复手动展开状态 */
  const search = page.getByPlaceholder("搜索当前列表", { exact: true });
  await search.fill("副本");
  await expect(page.getByRole("button", { name: "帮助/说明", exact: true })).toHaveCount(0);
  await expect(page.getByText("测试应用 副本", { exact: true })).toBeVisible();
  await search.fill("");
  await expect(duplicateGroup).toHaveAttribute("aria-expanded", "true");

  /* 复制 14 个帮助快捷方式，让帮助组超出可视高度，验证组头吸顶 */
  const helpShortcut = join(slot.scanDir, "测试应用 帮助.lnk");
  for (let i = 0; i < 14; i += 1) {
    copyFileSync(helpShortcut, join(slot.scanDir, `测试帮助 ${i}.lnk`));
  }
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(helpGroup).toContainText("15");

  const scroller = page.getByTestId("main-scroll");
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(async () => {
      const headerBox = await helpGroup.boundingBox();
      const scrollBox = await scroller.boundingBox();
      if (!headerBox || !scrollBox) return Number.POSITIVE_INFINITY;
      return Math.abs(headerBox.y - scrollBox.y);
    })
    .toBeLessThan(4);

  await page.getByRole("button", { name: "未分组", exact: true }).click();
  await expect(appCard).toBeVisible();
});
