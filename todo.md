# todo

本文件仅供临时性的进度追踪，其它文件不得引用。

## 已忽略视图

状态：已完成（2026-11-20）。

### 已确认

- 「已忽略」与「未分组」平级，放在「未分组」下方、「分组」列表上方。
- 「已忽略」是独立视图，不计入未分组数量。
- 忽略项不落库，只存在于最近一次扫描结果；每次启动或刷新后重新生成。
- 不逐条写 `debug` 日志；保留扫描汇总日志。
- 忽略列表展示：名称、目标路径、忽略原因；不提供启动和归组操作。
- 顶部搜索框同时过滤已忽略列表。
- 列表使用首字母色块，不提取真实图标。
- MVP 不提供「从已忽略恢复为未分组」。

### 类型与扫描

- [x] `src/lib/types.ts` 新增 `IgnoreReason` 与 `IgnoredItem`。
- [x] `ScanSummary` 新增 `ignoredItems: IgnoredItem[]`。
- [x] `AppViewFilter` 增加 `{ kind: "ignored" }`。
- [x] 把 `ShortcutIgnoreReason` 收敛到 `types.ts` 的 `IgnoreReason`。
- [x] `scanStartMenu` 收集 `ignoredItems`，`ignored` 等于 `ignoredItems.length`。
- [x] 忽略原因覆盖：`uninstall`、`help`、`website`、`system`、`installer`、`duplicate`、`unreadable`、`invalid-target`、`missing-target`、`invalid-name`。
- [x] 名称计算提前到目标校验之前。
- [x] 被 `pickBestShortcuts` 去重掉的候选记录为 `duplicate`。
- [x] 删除逐条忽略 `log.debug`。

### 主进程与 IPC

- [x] `electron/main.ts` 的 `runScan` 把 `ignoredItems` 带进 `ScanSummary`。
- [x] `electron/preload.ts` 与 `src/types/api.d.ts` 的 `scanLibrary` 类型同步。
- [x] `library:load` 不变；忽略项不进入 SQLite。

### 界面

- [x] `AppSidebar.vue` 增加 `ignoredCount` prop。
- [x] 侧栏增加与「未分组」平级的「已忽略 N」入口。
- [x] `App.vue` 增加 `ignoredItems` 状态，扫描成功后写入。
- [x] `currentTitle` 支持「已忽略」。
- [x] `view.kind === "ignored"` 时渲染专用列表，不渲染应用网格和选择栏。
- [x] 列表行显示：首字母色块、名称、目标路径、原因标签。
- [x] 原因标签映射：卸载入口、帮助/说明、官网/更新、系统工具、安装程序、重复快捷方式、快捷方式无法解析、目标不是可执行文件、目标文件不存在、名称为空。
- [x] 搜索按名称或目标路径过滤已忽略列表。
- [x] 空态：「没有被忽略的应用」。

### 测试与验收

- [x] 单测覆盖卸载过滤回归。
- [x] e2e 增加被忽略的 fixture 快捷方式，验证「已忽略 1」和原因展示。
- [x] 侧栏「已忽略 N」的 N 等于扫描汇总的 `ignored`。
- [x] Wise Program Uninstaller 在未分组列表，不在已忽略列表。
- [x] 搜索能过滤已忽略列表。
- [x] 不再输出逐条忽略 `debug` 日志。
- [x] `pnpm check` 全绿，12 条测试通过。
- [x] `pnpm e2e` 通过，1 条用例。

### 本机验证

- [x] 开始菜单扫描：359 个快捷方式，保留 193 个，忽略 166 个。
- [x] 已忽略视图按原因展示被过滤项。
- [x] Wise Program Uninstaller 正常出现在未分组。

## 暂不做

- [ ] 从「已忽略」恢复到「未分组」或直接归组。
- [ ] 新增 `status = 'ignored'` 或 `ignore_reason` 数据库字段。
- [ ] 忽略项持久化，重启后不重新扫描即可查看。
- [ ] 已忽略列表提取真实图标。
- [ ] 按忽略原因分组筛选或顶部筛选 chips。
- [ ] 忽略项启动、右键菜单、批量操作。
