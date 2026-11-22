import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures";

test("扫描应用、已忽略与重复快捷方式", async ({ slot }) => {
  const { page } = slot;

  const appCard = page.getByRole("button", { name: "测试应用", exact: true });
  await expect(appCard).toBeVisible();
  await expect(page.getByText(/^扫描完成：新增 1，缺失 0，忽略 1，重复 1$/u)).toBeVisible();

  /* 扫描只读缓存，首次没有图标，显示首字母占位 */
  await expect(appCard.getByRole("img", { name: "测试应用", exact: true })).toHaveCount(0);
  await expect(appCard.getByText("测", { exact: true })).toBeVisible();

  const ignoredNav = page.getByRole("button", { name: "已忽略", exact: true });
  await expect(ignoredNav).toContainText("1");
  await ignoredNav.click();

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
    page.getByRole("button", { name: "启动「测试应用 帮助」", exact: true }),
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

  /* 全部应用栏可选加载已忽略项，默认不加载 */
  await page.getByRole("button", { name: "全部应用", exact: true }).click();
  const includeIgnored = page.getByLabel("包含已忽略项", { exact: true });
  await expect(includeIgnored).not.toBeChecked();
  await expect(page.getByTestId("all-ignored")).toHaveCount(0);

  await includeIgnored.check();
  await expect(page.getByTestId("all-ignored")).toBeVisible();
  await expect(page.getByText("测试应用 帮助", { exact: true })).toBeVisible();
  await expect(page.getByText("已忽略项", { exact: true })).toBeVisible();
  /* 重复快捷方式不进入全部应用栏 */
  await expect(page.getByText("测试应用 副本", { exact: true })).toHaveCount(0);

  await search.fill("帮助");
  await expect(page.getByTestId("all-ignored")).toBeVisible();
  await expect(page.getByText("测试应用 帮助", { exact: true })).toBeVisible();

  await includeIgnored.uncheck();
  await expect(page.getByTestId("all-ignored")).toHaveCount(0);
  await search.fill("");

  await page.getByRole("button", { name: "未分组", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^包含已忽略项$/u })).toHaveCount(0);
  await expect(appCard).toBeVisible();
});
