# program-groups（pg）起步方案

## 速览

一句话：MVP 只扫开始菜单，做「未分组池 + 手动多对多分组」；注册表、Store、托盘等都在后续。

| 章节 | 内容 | 读它来判断 |
| --- | --- | --- |
| [1 定位](#1-定位) | 产品边界与一句话价值 | 要不要做、不做什么 |
| [2 MVP 范围](#2-mvp-范围) | 做 / 不做清单 | 本期交付边界 |
| [3 核心概念与数据模型](#3-核心概念与数据模型) | App / Group / Membership、未分组查询 | 数据模型是否支撑多对多 |
| [4 应用发现（上游）](#4-应用发现上游) | 开始菜单扫描、过滤、ID、图标、缺失 | 枚举口径与数据质量 |
| [5 分组（核心）](#5-分组核心) | 未分组池、多对多、归组交互、计数 | 核心体验是否闭环 |
| [6 启动与搜索（下游）](#6-启动与搜索下游) | 启动、搜索、刷新 | 整理后是否用得起来 |
| [7 存储与 IPC](#7-存储与-ipc) | 数据目录、IPC 接口 | 主进程 / 渲染进程边界 |
| [8 技术选型](#8-技术选型) | 与 cycle-note / dsync 对齐的依赖 | 技术栈是否一致 |
| [9 实施步骤](#9-实施步骤) | 从脚手架到打包的顺序 | 落地路径 |
| [10 验收标准](#10-验收标准) | 可验证的行为清单 | 什么算完成 |
| [11 决策记录](#11-决策记录) | 决策记录和结论 | 关键取舍及原因 |
| [12 落地已知坑](#12-落地已知坑) | 环境与 API 的坑 | 避免重复踩坑 |
| [13 后续实现：注册表扫描](#13-后续实现注册表扫描) | 暂不做的注册表方案 | 下一阶段的上游补全 |
| [14 后续细化](#14-后续细化) | 功能路线 | 后续排期 |
| [15 实现状态](#15-实现状态2026-11-20) | 验证结果与未执行项 | 当前做到哪一步 |

阅读顺序建议：1–2 看边界，3–6 看核心链路，7–10 看实现与验收，11–15 看决策、坑、后续与状态。

结构说明：1–10 是主线（定位 → 模型 → 实现 → 验收），11–12 是记录，13–15 是后续与状态。发现章节编号、内容归属或「做 / 不做」不一致时，优先回到 2、11、13 核对。

## 1. 定位

Windows 桌面应用库（MVP 仅支持 Windows）。解决的问题：装了很多功能相似的软件（各种看图、播放器、编辑器），命名分散在开始菜单里，时间久了记不起装过什么、该用哪个。

pg 的核心行为：**把本机常规安装的应用自动收进「未分组」，用户手动建立分组并归入；同一个应用可以属于多个分组。**

不做启动器全家桶，不做桌面整理，不做软件卸载器。它首先是一个「整理层」，启动只是顺手提供的下游能力。

竞品调研结论见 [竞品调研.md](./竞品调研.md)：市面产品要么能自动枚举但不能好好分组，要么分组好用但不枚举全量；「自动枚举 + 未分组池 + 手动多对多分组」三者同时做到的没有。

## 2. MVP 范围

做：

- 扫描开始菜单，归集常规安装的可启动应用
- 首次进入即展示全量「未分组」列表
- 侧栏「已忽略」列出被扫描规则过滤的项与原因
- 新建 / 改名 / 删除分组；一个应用可加入多个分组
- 多选、批量归组、拖拽归组、从分组移除
- 应用网格展示（图标 + 名称），按名称搜索
- 双击启动应用
- 数据存 SQLite；启动时先展示缓存，再后台增量扫描
- 应用缺失（卸载或快捷方式消失）时保留分组关系，重新出现后恢复

不做（留后续）：

- 注册表扫描、无开始菜单快捷方式的安装项
- Microsoft Store / Appx 应用、绿色软件目录、手动添加 exe
- 自动分类、规则引擎、智能建议
- 托盘常驻、全局热键、开机自启
- 应用别名、分组图标 / 颜色、组内拖拽排序、分组嵌套
- 卸载、更新、版本管理
- 云同步、多窗口、导入导出
- 拼音搜索、模糊搜索

## 3. 核心概念与数据模型

### 3.1 三个实体

- **应用（App）**：一个可启动的本机程序。MVP 只收录「常规安装且可启动」的应用。
- **分组（Group）**：用户命名的集合，如「看图」「开发」「常用」。
- **归属（Membership）**：应用与分组的多对多关系。

「未分组」不是一条真实分组，而是**没有任何归属的应用集合**。这样删除分组、移除归属都不需要特殊处理，也不会出现「未分组」被误删的问题。

### 3.2 SQLite 表

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE apps (
  id               TEXT PRIMARY KEY,           -- sha1(规范化 exe 路径) 前 16 位
  name             TEXT NOT NULL,              -- 开始菜单快捷方式名
  launch_path      TEXT NOT NULL,              -- .lnk 或 .exe，启动时直接用
  launch_kind      TEXT NOT NULL,              -- 'lnk' | 'exe'
  exe_path         TEXT NOT NULL,              -- 规范化后的真实 exe 路径，用于去重
  icon_file        TEXT,                       -- 相对数据目录的 icons/xxx.png
  status           TEXT NOT NULL DEFAULT 'active', -- 'active' | 'missing'
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL
);

CREATE TABLE groups (
  id         TEXT PRIMARY KEY,                 -- crypto.randomUUID()
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL,                 -- 创建顺序，MVP 只追加
  created_at TEXT NOT NULL
);

CREATE TABLE app_groups (
  app_id     TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_id, group_id)
);

CREATE INDEX idx_apps_status ON apps(status);
CREATE INDEX idx_apps_name ON apps(name);
CREATE INDEX idx_app_groups_group ON app_groups(group_id);
```

约定：

- `PRAGMA foreign_keys = ON`，删分组时归属级联删除，应用不受影响。
- `journal_mode = WAL`，`synchronous = NORMAL`；pg 的数据只在本地，不存在 dsync 那种网盘撕碎索引的问题。
- 不删除应用行。卸载后置 `missing`，重装同路径后置回 `active`，分组关系天然恢复。
- `meta` 存 `schema_version`，MVP 为 `1`。

### 3.3 未分组查询

```sql
SELECT a.*
FROM apps a
WHERE a.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM app_groups ag WHERE ag.app_id = a.id);
```

分组计数、未分组计数都从同一份内存数据算，前端不做第二套口径。

## 4. 应用发现（上游）

### 4.1 数据源

| 来源 | 用途 | 覆盖 | 限制 |
| --- | --- | --- | --- |
| 开始菜单 `.lnk`（用户 + 公共） | 主列表、启动入口、友好名称 | 常规安装且有开始菜单快捷方式的应用 | 无快捷方式的应用缺失；含卸载/帮助/网址等伪快捷方式 |

MVP 只扫描开始菜单，因此：

- 开始菜单 `.lnk` 是唯一来源，能直接启动、名称中文化好、图标好取。
- 注册表先不做：它虽然能补全安装清单，但不可启动项、系统组件、运行库和 DisplayIcon 解析都会显著增加复杂度，MVP 不值得。
- 没有开始菜单快捷方式的应用不会出现；后续用注册表扫描和手动添加 exe 兜底。

这是 MVP 的明确取舍：**先保证每个条目都能启动，再追求「安装清单 100% 完整」。**

### 4.2 开始菜单扫描

- 根目录：`%APPDATA%\Microsoft\Windows\Start Menu\Programs`、`%ProgramData%\Microsoft\Windows\Start Menu\Programs`。
- 递归查找 `.lnk`；跳过 `Startup` 目录。
- 目标解析、前置校验、规则过滤、去重与原因判定见 [算法设计.md](./算法设计.md)，本文不重复。
- 扫描统计返回：`{ scanned, kept, ignored, ignoredItems, duplicate, added, updated, missing, changed }`，界面底部显示「新增 N · 忽略 M · 重复 D · 缺失 K」。

### 4.3 图标

- 图标源优先级：快捷方式 `IconLocation` → 目标 exe → `.lnk` 兜底。不能直接把 `.lnk` 当图标源，Windows 会返回通用快捷方式图标，而不是目标程序图标。
- 主进程用 `app.getFileIcon(source, { size: 'large' })` 取图标；Windows 下 `large` 只有 32×32。`toPNG()` 存到 `<data>/icons/<appId>.png`。
- 图标通过 `pg-icon://<appId>?v=<mtime>` 自定义协议加载，不再走 IPC base64；响应带长缓存，图标文件变化时 URL 版本变化。
- 缓存按目标 exe、IconLocation、快捷方式 `.lnk` 的 mtime 判断；命中时只 stat，不调用 `getFileIcon`。
- 提取失败写 `icons/<appId>.miss`，源文件不变时不重试；成功后正常写 PNG。
- 并发 8；扫描进度显示「检查图标 N/N（缓存 X，提取 Y）」。
- 不在 SQLite 里存 BLOB。

### 4.4 增量与缺失

- 每次扫描记录本轮 `scanStartedAt`。
- 本轮出现的应用：`INSERT OR UPDATE`，`status = 'active'`，更新 `last_seen_at`。
- 本轮未出现的应用：`UPDATE apps SET status = 'missing'`，**不删除行、不删除归属**。
- 重新出现：同 ID 命中，置回 `active`，原分组自动恢复。
- MVP 不做文件监听；启动时后台扫一次，界面提供「刷新」按钮。
- exe 路径变化（升级、搬家）会被当成新应用，旧应用转 `missing`，分组关系不会自动迁移。这是 MVP 已知限制，后续用「同名 + 安装目录」做迁移提示。

## 5. 分组（核心）

### 5.1 未分组池

- 首次扫描完成后，所有应用默认没有归属，全部出现在「未分组」。
- 侧栏固定显示「全部应用」「未分组 N」「已忽略 N」，其下是用户分组。
- 「已忽略」与「未分组」平级，不参与归组；只展示最近一次扫描被规则过滤的项与原因，不计入未分组数量。
- 重复快捷方式不进入「已忽略」，单独计数；标题下提示「另有 N 个重复快捷方式，应用已收录」。
- 「未分组」不可删除、不可改名；它是查询结果，不是数据。
- 归组后计数实时减少；全部归完显示空态「所有应用都已归类」。

### 5.2 多对多

- 一个应用可以同时属于「看图」「常用」「工作」。
- 应用卡片上展示所属分组的小标签；点标签上的 × 只移除该归属。
- 从 A 组移除不影响 B 组。
- 删除分组只删 `app_groups` 与 `groups` 行，应用回到未分组或保留其他归属。

### 5.3 归组交互

- 单击卡片选中，Ctrl 多选，Shift 连选；底部出现选择栏「已选 N 项」。
- 选择栏「加入分组」下拉：列出已有分组 + 「新建分组…」。
- 拖拽选中的应用到侧栏分组上，批量归组。
- MVP 通过选择栏归组；卡片右键菜单留后续。
- 分组视图内支持「移出分组」；不在该组视图时不显示。
- 新建分组：输入名称，回车创建；名称 trim 后为空不允许，同名（不区分大小写）不允许。
- 删除分组：气泡确认，提示「只删除分组，不会卸载应用」。
- MVP 分组顺序按创建时间；不做拖拽排序。

### 5.4 计数口径

- 「全部应用」= `status = 'active'` 的应用数。
- 分组计数 = 该组内 `active` 应用数。
- 「未分组」= `active` 且没有任何归属。
- `missing` 应用不计入以上任何计数，但保留关系；界面底部单独提示「N 个应用缺失，分组关系已保留」。

## 6. 启动与搜索（下游）

### 6.1 启动

- `apps:launch` 调 `shell.openPath(launch_path)`；`.lnk` 优先，保留快捷方式参数与工作目录语义。
- 启动失败：文件不存在时标为 `missing` 并刷新列表，轻提示「启动失败：文件不存在」；权限不足、被安全软件拦截等其他错误只提示，不改状态。
- 不在 pg 内做「以管理员身份运行」；需要时用户从开始菜单右键。
- MVP 不记录启动次数、不做常用排序。

### 6.2 搜索

- 顶部搜索框，输入即筛，100ms 防抖。
- 匹配范围：名称、exe 文件名；不区分大小写，子串匹配。
- 搜索只作用于当前视图（全部 / 未分组 / 某个分组），占位文案随视图变化。
- 不做拼音、不做模糊匹配；后续再加。

### 6.3 刷新

- 启动：先从 SQLite 读缓存渲染，再后台 `library:scan`；扫描完成刷新列表。
- 手动刷新：顶部按钮；扫描中按钮禁用并显示进度文案。
- 扫描进度事件：`{ phase: 'start-menu' | 'registry' | 'icons' | 'done', done, total }`，MVP 只在按钮旁显示「扫描中 12/80」，不做全屏进度页。

## 7. 存储与 IPC

### 7.1 数据目录

| 环境 | 数据目录 | 判定 |
| --- | --- | --- |
| dev | 项目根 `pg-data/` | `process.env.ELECTRON_RENDERER_URL` 存在 |
| release | `app.getPath('userData')` | 否则 |
| e2e | `PG_DATA_DIR` 指定的临时目录 | `E2E=1` + `PG_DATA_DIR`，ready 前 `app.setPath('userData', ...)` |

- 数据库：`<data>/pg.db`
- 图标：`<data>/icons/`
- 日志：dev/e2e 写项目根 `pg.log`；release 写 `userData/pg.log`
- dev 数据目录加入 `.gitignore`：`pg-data*/`
- e2e 专用环境变量：`PG_SCAN_DIRS`（分号分隔，覆盖开始菜单根目录，指向 fixture）

### 7.2 IPC

| 通道 | 入参 | 返回 |
| --- | --- | --- |
| `library:load` | — | `{ apps: AppView[]; groups: GroupView[]; missingCount: number }`（`apps` 只含 active） |
| `library:scan` | — | `ScanSummary` |
| `groups:create` | `name` | `GroupView` |
| `groups:rename` | `id, name` | `void` |
| `groups:delete` | `id` | `void` |
| `memberships:add` | `appIds, groupId` | `void` |
| `memberships:remove` | `appIds, groupId` | `void` |
| `apps:launch` | `appId` | `{ ok: boolean; error?: string }` |
| `log:renderer` | `level, message` | `void` |

主进程 → 渲染进程事件：

| 事件 | 载荷 | 用途 |
| --- | --- | --- |
| `scan:progress` | `{ phase, done, total }` | 扫描进度 |

约定：

- 所有文件、SQLite、图标读写都在主进程；渲染进程只通过 preload 暴露的 `window.api`。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`（preload 需要 Node）。
- 入参在主进程校验：`appIds` 必须是字符串数组且去重，`groupId` 必须存在，名称长度 1–30。
- 批量归组在一个事务里完成，避免部分成功。

## 8. 技术选型

对齐 cycle-note / dsync，核心依赖版本一致；不引入新的运行时依赖。

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 桌面壳 | Electron | 45.2.3 |
| 构建 | electron-vite + Vite | ^6.0.0 + ^8.3.6 |
| 前端 | Vue + TypeScript + vue-tsc | ^3.5.45 + ~6.0.3 + ^3.3.14 |
| Vue 插件 | @vitejs/plugin-vue | ^6.0.10 |
| 样式 | Tailwind CSS + @tailwindcss/vite | ^4.3.4 |
| 打包 | electron-builder（NSIS） | ^26.18.0 |
| 测试 | Vitest | ^5.1.0 |
| e2e | Playwright | ^1.65.0 |
| 日志 | electron-log | ^5.4.4 |
| 质量 | oxlint + oxfmt + ESLint | ^1.91.0 / ^0.76.0 / ^10.14.0 |
| Node 类型 | @types/node | ^24.12.2 |
| 包管理 | pnpm | 12.18.0 |

说明：

- 开始菜单 `.lnk` 用 Electron `shell.readShortcutLink` 解析；图标用 `app.getFileIcon`，不引图像库；ID 用 `node:crypto`。
- SQLite 用 Node 内置 `node:sqlite`（Electron 45 自带 Node 24），无原生依赖、不需要 electron-rebuild。
- 不引路由、Pinia、组件库、数据库 ORM。
- 状态放 `reactive`；组件间用 props / emit，不建全局 store。
- 打包配置对齐：`appId = com.program-groups.perphyyoung`、`productName = Program Groups`、`version = 0.1.0`、NSIS x64、输出 `release/`、卸载不删除 userData。

## 9. 实施步骤

1. 脚手架：复制 cycle-note/dsync 的 `package.json`、`electron.vite.config.ts`、`tsconfig.json`、Tailwind 4、三端入口，跑通 `pnpm dev`。
2. `src/lib` 纯函数：名称清理、视图过滤、搜索、计数、ID；配 Vitest。
3. 扫描：
   - `start-menu.ts`：递归、`readShortcutLink`、过滤、去重；
   - `icons.ts`：图标落盘。
4. 数据库：`node:sqlite` 建表、`library:load` 查询、扫描后 reconcile、缺失标记；用临时库做单测。
5. IPC + preload + `api.d.ts`，串通「启动加载 → 后台扫描 → 刷新列表」。
6. UI：侧栏、网格、多选、选择栏、归组/移除、分组 CRUD、搜索、启动、空态、提示。
7. e2e：用 `PG_DATA_DIR` 隔离数据、`PG_SCAN_DIRS` 指向 fixture 开始菜单；覆盖首次扫描、归组、多组、重启持久化、删组、搜索、缺失保留。
8. `pnpm check` 全绿，`pnpm e2e` 通过，`pnpm release` 打 NSIS 包。

## 10. 验收标准

- 首次启动能扫出本机开始菜单里的常规应用，卸载/帮助/网址类快捷方式不出现；底部能看到忽略数量。
- 所有新应用默认在「未分组」，计数等于应用总数。
- 新建「看图」「常用」，把同一个看图软件加入两组；两个组都显示它，未分组计数减 1。
- 从「看图」移除该应用，它仍在「常用」；两组计数正确。
- 删除「常用」组，应用仍在「看图」，且不触发任何卸载或文件删除。
- 重启应用，分组、归属、图标全部保留。
- 搜索「图」只显示名称/exe 名匹配的应用；清空恢复当前视图。
- 双击应用能启动；启动路径失效时提示并标记缺失。
- 删除开始菜单快捷方式后刷新：应用从列表消失、底部显示缺失数；重新放回后刷新，应用回到原分组。
- 开始菜单里没有快捷方式的已安装应用不会出现（MVP 已知限制，后续用注册表扫描与手动添加兜底）。
- `pnpm check`（format / lint / type-check / test / build）全绿；`pnpm e2e` 通过。

## 11. 决策记录

| 编号 | 议题 | 结论 | 日期 |
| --- | --- | --- | --- |
| D1 | 产品定位 | 已安装软件的整理层 / 应用库，不做启动器全家桶 | 2026-11-20 |
| D2 | MVP 收录口径 | 只收开始菜单中可启动的常规安装应用；接受无快捷方式应用缺失 | 2026-11-20 |
| D3 | 未分组 | 虚拟视图，不落库；= active 且无任何 membership | 2026-11-20 |
| D4 | 分组关系 | 多对多 `app_groups` 表；删组只删关系 | 2026-11-20 |
| D5 | 存储 | SQLite（`node:sqlite`），单文件 `pg.db`，WAL | 2026-11-20 |
| D6 | 应用主键 | `sha1(规范化 exe_path)`；不用显示名 | 2026-11-20 |
| D7 | 缺失处理 | 置 `missing` 保留行与归属；重新出现自动恢复 | 2026-11-20 |
| D8 | 自动分类 | MVP 不做；避免重蹈 Win11 分类视图「不可纠正」的覆辙 | 2026-11-20 |
| D9 | 托盘 / 热键 | MVP 不做，单窗口 + 开始菜单打开 | 2026-11-20 |
| D10 | 应用别名 | MVP 不做；先解决「找不到」，再解决「名字丑」 | 2026-11-20 |
| D11 | 分组排序 | 按创建顺序，不做拖拽排序；分组内按名称 | 2026-11-20 |
| D12 | 注册表扫描 | MVP 不做，只扫开始菜单；后续再加，避免不可启动项与编码/解析复杂度 | 2026-11-20 |
| D13 | 分组图标 / 颜色 | MVP 不做，只显示名称与计数 | 2026-11-20 |
| D14 | 卸载项过滤 | 详见 [算法设计.md](./算法设计.md)，本文不重复判断逻辑 | 2026-11-20 |
| D15 | 已忽略视图 | 与「未分组」平级；忽略项不落库，只来自最近一次扫描结果，展示名称、目标与原因；重复项单独计数 | 2026-11-20 |

## 12. 落地已知坑

- electron-vite 6 没有默认入口，main / preload / renderer 都要在 `build.rollupOptions.input` 显式指定入口。
- pnpm 12 默认拦截依赖构建脚本；`pnpm-workspace.yaml` 需 `allowBuilds` 放行 `electron` 与 `electron-winstaller`，否则报 `ERR_PNPM_IGNORED_BUILDS`。
- Electron 45 不再通过 postinstall 下载二进制；`node_modules/electron/dist` 缺失时执行 `pnpm exec install-electron`，国内加 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- Playwright 启动 Electron 用 `args: ["."]`，不要传 `out/main/main.js`，否则 `app.getAppPath()` 指向错误目录、preload 拼接失败。
- MSI 的 advertised shortcut 目标可能落在 `C:\Windows\Installer\` 下，这是正常的；不要因此丢弃，启动仍用 `.lnk`。
- 已忽略与去重的判断边界见 [算法设计.md](./算法设计.md)，这里只记录落地坑，不重复规则。
- `app.getFileIcon` 必须在 `app.whenReady()` 后调用；图标失败只记日志，不阻断扫描。
- renderer 不能 import 任何 `node:` 模块；搜索、计数、名称清理等纯函数放 `src/lib`，主进程与渲染进程共用。
- 精简系统可能没有公共开始菜单目录；目录不存在时跳过并记 info 日志，不报错。

## 13. 后续实现：注册表扫描

MVP 只扫开始菜单，注册表的初步方案保留在这里，后续实现时直接按此展开。

实现前先做数据模型迁移（`schema_version = 2`），给 `apps` 增加字段：`publisher`、`version`、`install_location`、`uninstall_string`。

- 读取四个位置（HKLM / HKCU 各含 64 位与 32 位视图）：
  - `HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*`
  - `HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*`
  - `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*`
  - `HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*`
- 用 PowerShell 一次性输出 JSON，避免 `reg.exe` 的编码问题：
  - 脚本放 `resources/scripts/list-installed.ps1`；
  - `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ...`；
  - 输出 `ConvertTo-Json -Compress`，Node 侧 `JSON.parse`，读取前去掉 UTF-8 BOM。
- 取字段：`DisplayName`、`DisplayIcon`、`InstallLocation`、`DisplayVersion`、`Publisher`、`UninstallString`、`SystemComponent`、`ParentKeyName`、`ReleaseType`、`PSChildName`。
- 过滤：
  - `DisplayName` 为空；
  - `SystemComponent = 1`；
  - `ParentKeyName` 非空（补丁/子组件）；
  - `ReleaseType` 属于 Update / Hotfix / Security Update / Update Rollup；
  - `DisplayName` 匹配 `^KB\d+`、`Microsoft Visual C++ .* Redistributable`、`\.NET .* (Runtime|SDK)`、`Language Pack`、`Windows SDK`、`Driver`。
- 解析 `DisplayIcon`：
  - 去掉包裹引号；
  - 去掉末尾的 `,索引`（如 `C:\App\app.exe,0`）；
  - 展开 `%ProgramFiles%` 等环境变量；
  - 结果是存在的 `.exe` 才作为启动目标。
- 与开始菜单合并：按规范化后的 exe 路径匹配；匹配上只补全元数据，不新增条目；匹配不上且 DisplayIcon 是有效 exe 的，作为 `launch_kind = 'exe'` 的新增条目。
- 仍解析不出可启动 exe 的安装记录不入库，只计入忽略数。
- 后续验收：开始菜单没有快捷方式的常规安装应用，能通过注册表出现在未分组；运行库、补丁、驱动、系统组件不出现。

## 14. 后续细化

- 注册表扫描：补全无开始菜单快捷方式的安装项，并补充发布者 / 版本
- Microsoft Store / Appx 应用（AUMID 启动）
- 绿色软件目录扫描、手动添加 exe / 文件夹
- 托盘常驻、全局热键、开机自启
- 应用别名、分组图标与颜色、组内拖拽排序
- 自动建议分组（基于名称关键词 / 使用频率），但必须保持用户可改
- 使用统计：启动次数、最近使用、久未使用提醒
- 导入导出、换机迁移
- 安装/卸载监听，扫描改为增量事件驱动

## 15. 实现状态（2026-11-20）

MVP 已实现，并通过质量门与 e2e。

验证结果：

- `pnpm test`：13 条通过（3 个文件）
- `pnpm check`：format / oxlint / eslint / type-check / test / build 全绿，0 warning
- `pnpm e2e`：1 条通过（开始菜单扫描、建组、多组归属、重启持久化、`pg-icon://` 图标加载）
- `pnpm release`：打出 `release/Program Groups Setup 0.1.0.exe`
- 本机开始菜单实测：359 个快捷方式，保留 191 个，忽略 136 个，重复 32 个；金山文档、微信输入法恢复，四个产品自定义卸载入口被过滤
- 图标缓存实测：第二次启动 `icons=0/191`，没有重新解析图标

已实现：

- 开始菜单扫描、快捷方式解析、规则过滤、去重、图标提取
- SQLite 存储、扫描对账、缺失应用标记与归属保留
- 未分组池、分组增删改、多对多归属、批量与拖拽归组、移出分组
- 已忽略视图：与未分组平级，展示名称、目标路径与忽略原因，支持搜索
- 帮助/更新/卸载规则区分产品名与功能入口；重复快捷方式单独计数
- 图标缓存优化：`pg-icon://` 协议、扫描无变化跳过二次刷新、失败负缓存、`.lnk` mtime 失效判断
- 搜索、启动、空态、轻提示
- dev / e2e 数据隔离与 electron-log 日志

未执行：

- 真实用户日常使用验证
