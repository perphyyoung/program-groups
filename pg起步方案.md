# program-groups（pg）起步方案

## 速览

一句话：扫描开始菜单与 Store，做「未分组池 + 手动多对多分组」；注册表经实测不做，托盘等仍在后续。

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
| [13 不做注册表扫描](#13-不做注册表扫描) | 实测结论与原因 | 为什么不上游补全 |
| [14 后续细化](#14-后续细化) | 功能路线 | 后续排期 |
| [15 实现状态](#15-实现状态) | 验证结果与未执行项 | 当前做到哪一步 |

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
- 应用列表展示（图标 + 名称），按名称搜索
- 行内备注（单行 10 个中文字，参与搜索；写入 SQLite）
- 行尾「启动」按钮启动应用；双击不启动
- 数据存 SQLite；启动时先展示缓存，再后台增量扫描
- 应用缺失（卸载或快捷方式消失）时保留分组关系，重新出现后恢复

不做（留后续）：

- 注册表扫描（本机实测没有超出开始菜单与 Store 的真实应用，明确不做）
- 绿色软件目录扫描、手动添加 exe
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
  launch_kind      TEXT NOT NULL,              -- 'lnk' | 'exe' | 'aumid'
  exe_path         TEXT NOT NULL,              -- 规范化后的真实 exe 路径，用于去重；AUMID 为空
  icon_file        TEXT,                       -- 相对数据目录的 icons/xxx.png
  source           TEXT NOT NULL DEFAULT 'start', -- 'start' | 'store'
  status           TEXT NOT NULL DEFAULT 'active', -- 'active' | 'missing'
  entry_type       TEXT NOT NULL DEFAULT 'app',    -- 'app' | 'uninstaller' | 'installer' | 'system'
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

CREATE TABLE manual_ignores (
  app_id     TEXT PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE notes (
  key        TEXT PRIMARY KEY,                 -- 'app:<id>' 或 'shortcut:<.lnk 绝对路径>'
  note       TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
| Store / UWP（AUMID） | 打包应用启动入口 | Store / Developer 签名的启动项 | 无 exe 启动路径；其他签名进已忽略 |

- 开始菜单 `.lnk` 能直接启动、名称中文化好、图标好取，是主来源。
- Store 应用走 AUMID 启动，exe 路径不参与启动。
- 注册表不做：本机实测 637 个卸载表项中可用启动 104 个，其中 99 个开始菜单已有；App Paths 169 项也没有超出 `start + store` 的真实应用。
- 没有快捷方式的应用不会出现；后续只考虑手动添加 exe，不再做注册表扫描。

明确取舍：**先保证每个条目都能启动，再追求「安装清单 100% 完整」；不为了补全引入大量不可启动噪声。**

### 4.2 开始菜单扫描

- 根目录：`%APPDATA%\Microsoft\Windows\Start Menu`、`%ProgramData%\Microsoft\Windows\Start Menu`。
- 递归查找 `.lnk`；跳过 `Startup` 目录。根目录本身要扫，`SumatraPDF.lnk` 这类根级快捷方式不能漏。
- 目标解析、前置校验、规则过滤、去重与原因判定见 [算法设计.md](./算法设计.md)，本文不重复。
- Store 扫描分三段：读取应用包、读取 Store 启动项、分类；PowerShell 逐行输出 `PGPROGRESS` / `PGRESULT`，主进程转成 `scan:progress`，卡片显示「扫描 Store 应用 1/3 · 读取应用包」。
- 扫描统计返回：`{ scanned, kept, ignored, ignoredItems, duplicate, added, updated, missing, changed }`；扫描结束后底部居中提示「扫描完成：新增 N，缺失 M，忽略 I，重复 D」。

### 4.3 图标

- 图标源优先级：快捷方式 `IconLocation` → 目标 exe → `.lnk` 兜底。不能直接把 `.lnk` 当图标源，Windows 会返回通用快捷方式图标，而不是目标程序图标。
- 扫描与提取分离：扫描只检查 `<data>/icons/<appId>.png` 是否存在，写入 `icon_file`；不 stat 源文件、不提取、不写 `.miss`。
- 提取只在设置页手动触发：默认增量，只补缺失和源文件已变化的图标，失败保留旧图标；勾选「全量重建」时忽略来源勾选，固定处理 start + store，旧 `<data>/icons` 先改名腾出目录、后台删除并清空数据库图标引用，再重新提取，失败写 `.miss`，不保留旧图标。
- 设置页「图标来源」控制提取范围：`start` / `store` / `green`；默认只勾 `start`，选择写入 `meta.icon_sources`。`green` 暂无扫描实现，置灰。
- Store 图标不解析 AUMID：读 `Get-AppxPackageManifest` 的 `Square44x44Logo`，目录用 `[IO.Path]::GetDirectoryName`；按限定词 token 解析，不依赖顺序，排除 `contrast-*`。优先级：targetsize 48/44/32/256，同尺寸优先 `altform-unplated`；无 targetsize 用 scale-200；基名最后；再回退同目录 `AppList.*`。
- 主进程用 `app.getFileIcon(source, { size: 'large' })` 取图标；Windows 下 `large` 只有 32×32。`toPNG()` 存到 `<data>/icons/start_<id>.png` 或 `store_<hash>.png`。
- 图标通过 `pg-icon://icon/<encodeURIComponent(appId)>?v=<mtime>` 自定义协议加载，不再走 IPC base64；响应带长缓存，图标文件变化时 URL 版本变化。
- 缓存文件名去掉 Windows 非法字符并带来源前缀：start 存为 `icons/start_<id>.png`，Store `store:<hash>` 存为 `icons/store_<hash>.png`，不能直接当文件名（NTFS 会变成 ADS）。
- 缓存按目标 exe、IconLocation、快捷方式 `.lnk` 的 mtime 判断；命中时只 stat，不调用 `getFileIcon`。
- 提取失败写同名 `.miss`，源文件不变时不重试；成功后正常写 PNG。
- 并发 8；设置页显示「已处理 N/M · 新增 X · 复用 Y · 失败 Z」。
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
- 「已忽略」按原因折叠分组，组头显示数量；默认折叠，搜索时命中组自动展开。
- 折叠组头吸顶，展开后向下滚动仍可随时收起；滚动容器设置 `scroll-padding-top`，聚焦行不被遮挡。
- 重复快捷方式不进入侧栏计数，但作为独立分组「重复快捷方式」排在最后，标注已收录为哪个应用；每行可「启动」，或用行菜单「打开链接路径」定位 `.lnk`，由用户自行决定是否删除。
- 全部应用栏提供「包含已忽略项」复选框，默认不勾选；勾选后在应用列表下方追加已忽略项（含手动忽略应用）并参与搜索，规则项不可选中、不可归组，但可启动与查看路径；手动忽略可取消，重复快捷方式不列入。
- 应用行尾提供「手动忽略」：应用从各栏收起，已忽略栏顶部出现「手动忽略」组；状态落库，拖入分组时自动恢复。
- Store / Developer 签名应用作为 `store` 来源进入列表；其他打包应用（System / Enterprise / None / 未知）进入已忽略的「Store 自动忽略应用」组。行名称旁显示来源徽标 `start` / `store`。
- 分组行尾提供「⋯」菜单：重命名分组、删除分组；右键分组行打开同一菜单。删除确认显示组内应用数与归属后果，只删分组与归属，不卸载应用。
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
- 从应用行首握把拖到侧栏分组上批量归组；拖拽中只有命中的分组高亮。
- MVP 通过选择栏归组；应用行菜单提供启动与路径定位，不做批量右键操作。
- 分组内支持「移出本组」；不在该分组时不显示。
- 新建分组：输入名称，回车创建；名称 trim 后为空不允许，同名（不区分大小写）不允许。
- 新建 / 重命名弹窗打开即聚焦输入框，重命名自动全选原名；新建后保留当前栏，不跳转到空分组。细节见 [design.md](./design.md)。
- 删除分组：原生确认弹窗，标题「删除分组「X」？」，正文显示组内应用数与归属后果；取消默认聚焦，按钮取消在左、删除分组在右，等宽平分。
- 分组默认手动排序；分组区标题右侧可切换 手动排序 / 名称排序 / 创建顺序，并用 ↑/↓ 箭头切换正序 / 倒序。手动顺序写入 `groups.sort`，排序方式写入 `meta.group_sort_mode`，方向写入 `meta.group_sort_direction`；名称 / 创建顺序只改变展示，不覆盖手动顺序。
- 手动排序下从分组行首握把拖拽排序，或聚焦握把后 `Alt+↑/↓` 移动；拖动中只显示 2px 插入线，其它行不位移。倒序拖拽按可见顺序操作，提交时反写为手动升序。
- 扫描时对忽略项中的卸载器 / 安装器 / 系统工具写 `entry_type`；只更新已存在的 app 行，不新增应用。`missing-target` / `unreadable` / `invalid-target` 不改类型，真实应用损坏仍按缺失处理。
- MVP 分组顺序中手动顺序可调整；不做跨侧栏排序。

### 5.4 计数口径

- 「全部应用」= `status = 'active'` 且 `entry_type = 'app'` 的应用数。
- 分组计数 = 该组内 `active` 且 `entry_type = 'app'` 的应用数。
- 「未分组」= `active` 且 `entry_type = 'app'` 且没有任何归属。
- `missing` 且 `entry_type = 'app'` 的应用不计入以上任何计数，但保留关系；界面底部单独提示缺失数。
- 卸载器 / 安装器 / 系统工具只保留 `entry_type` 标记，不计入应用、未分组或缺失；分组与备注保留，恢复为有效应用时自动回到列表。

## 6. 启动与搜索（下游）

### 6.1 启动

- `apps:launch` 对 `launch_kind='lnk'` 调 `shell.openPath(launch_path)`；`.lnk` 优先，保留快捷方式参数与工作目录语义。已忽略行通过 `shortcuts:launch` 启动对应 `.lnk`，同样校验开始菜单范围。
- `launch_kind='aumid'` 用 `explorer.exe shell:AppsFolder\<AUMID>` 启动，不做文件存在检查；启动失败只提示，不直接标 missing。
- 已忽略的 Store 项通过 `store:launch` 启动同一 AUMID；路径入口置灰。
- 行菜单「打开目标路径」「打开链接路径」分别通过 `paths:reveal`、`apps:revealShortcut` 在资源管理器中定位；打开前用 `paths:check` 判断路径是否存在，缺失项置灰。
- 启动失败：文件不存在时标为 `missing` 并刷新列表，轻提示「启动失败：文件不存在」；权限不足、被安全软件拦截等其他错误只提示，不改状态。
- 不在 pg 内做「以管理员身份运行」；需要时用户从开始菜单右键。
- MVP 不记录启动次数、不做常用排序。

### 6.2 搜索

- 顶部搜索框，输入即筛，100ms 防抖。
- 匹配范围：名称、exe 文件名；不区分大小写，子串匹配。
- 搜索只作用于当前栏（全部 / 未分组 / 某个分组），占位文案随视图变化；全部应用栏勾选「包含已忽略项」时同时搜索已忽略项。
- 不做拼音、不做模糊匹配；后续再加。

### 6.3 刷新

- 启动：先从 SQLite 读缓存渲染，再后台 `library:scan`；扫描完成刷新列表。
- 手动刷新：顶部按钮固定显示「刷新」，扫描期间禁用，不随进度改变宽度和文案。
- 扫描进度：右下角固定容器展示进度卡片，内容为阶段 + `done/total`、缓存/提取数量、进度条；延迟 150ms 出现，避免快速扫描闪烁。
- 扫描结束：底部居中显示结果提示「新增 / 缺失 / 忽略 / 重复」，约 3.6 秒后消失；不做全屏进度页。
- 进度卡片与 toast 是各自独立的组件：进度固定右下角，toast 固定在底部居中，互不遮挡。
- 扫描失败：顶部常驻 Alert，显示失败原因并需手动关闭；重新扫描时清除。

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
| `library:load` | — | `{ apps: AppEntry[]; manualIgnored: AppEntry[]; groups: GroupEntry[]; missingCount: number; notes: Record<string, string>; groupSortMode: GroupSortMode; groupSortDirection: GroupSortDirection }`（`apps` 只含 active 且未手动忽略） |
| `library:groups` | — | `{ groups: GroupEntry[]; memberships: MembershipEntry[] }`（分组变更后只刷新这部分，不重载应用与图标） |
| `library:scan` | — | `ScanSummary`（含 `cachedIcons`；只读缓存） |
| `icons:settings` | — | `{ sources: IconSource[]; stats: Record<IconSource, { cached; total }> }`，默认仅 `start` |
| `icons:setSources` | `sources` | `void`，写入 `meta.icon_sources` |
| `icons:update` | `{ force, sources }` | `{ extracted, cached, failed, force }`，按来源增量提取；`force` 全量重建 |
| `groups:create` | `name` | `GroupEntry` |
| `groups:rename` | `id, name` | `void` |
| `groups:delete` | `id` | `void` |
| `groups:reorder` | `ids` | `void`，事务内重写 `sort`；`ids` 必须覆盖当前全部分组 |
| `groups:setSortMode` | `manual \| name \| created` | `void`，写入 `meta.group_sort_mode` |
| `groups:setSortDirection` | `asc \| desc` | `void`，写入 `meta.group_sort_direction` |
| `memberships:add` | `appIds, groupId` | `void` |
| `memberships:remove` | `appIds, groupId` | `void` |
| `apps:launch` | `appId` | `{ ok: boolean; error?: string }` |
| `shortcuts:launch` | `.lnk` 绝对路径 | `{ ok: boolean; error?: string }`，校验位于开始菜单根目录后启动 |
| `apps:revealShortcut` | `.lnk` 绝对路径 | `{ ok: boolean; error?: string }`，校验位于开始菜单根目录后定位文件 |
| `paths:reveal` | 文件绝对路径 | `{ ok: boolean; error?: string }`，存在校验后在资源管理器中定位 |
| `paths:check` | `{ run, target, link }`（路径或 `null`） | `{ run, target, link }`，逐项返回是否存在 |
| `apps:manualIgnore` | `appId` | `void`，写入 `manual_ignores` |
| `apps:manualRestore` | `appId` | `void`，删除手动忽略记录 |
| `notes:set` | `key, note` | `void`，写入 / 更新 / 清空 `notes` |
| `log:renderer` | `level, message` | `void` |

主进程 → 渲染进程事件：

| 事件 | 载荷 | 用途 |
| --- | --- | --- |
| `scan:progress` | `{ phase, done, total, detail?, cached?, extracted?, failed? }` | 扫描进度；Store 阶段 `detail` 为当前步骤 |
| `icons:progress` | `{ done, total, extracted, cached, failed }` | 图标提取进度 |

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
2. `src/lib` 纯函数：名称清理、栏位过滤、搜索、计数、ID；配 Vitest。
3. 扫描：
   - `start-menu.ts`：递归、`readShortcutLink`、过滤、去重；
   - `icons.ts`：图标落盘。
4. 数据库：`node:sqlite` 建表、`library:load` 查询、扫描后 reconcile、缺失标记；用临时库做单测。
5. IPC + preload + `api.d.ts`，串通「启动加载 → 后台扫描 → 刷新列表」。
6. UI：侧栏、列表、多选、选择栏、归组/移除、分组 CRUD、搜索、启动、空态、提示。
7. e2e：按场景拆成 `01-app-shell` / `02-scan` / `03-groups` / `07-settings`，fixtures 负责实例复用、临时数据目录与重启；覆盖首次扫描、图标缓存、已忽略、建组、多组归属、重启持久化。各文件范围见 [e2e/e2e-readme.md](./e2e/e2e-readme.md)。
8. `pnpm check` 全绿，`pnpm e2e` 通过，`pnpm release` 打 NSIS 包。

## 10. 验收标准

- 首次启动能扫出本机开始菜单里的常规应用，卸载/帮助/网址类快捷方式不出现；底部能看到忽略数量。
- 「已忽略」按原因折叠分组，重复快捷方式单独一组并可「启动」或通过行菜单「打开链接路径」定位 `.lnk`。
- 所有新应用默认在「未分组」，计数等于应用总数。
- 应用统一以列表展示，不提供网格视图。
- 全部应用栏勾选「包含已忽略项」后，应用列表下方出现已忽略项并参与搜索；规则项不可选中、不可归组但可启动与查看路径；默认不勾选，重复快捷方式不出现。
- 手动忽略只出现在应用行尾；应用收起后重启仍保留，拖入分组或点「取消忽略」后恢复。
- 拖拽归组只从行首握把发起，整行不可拖；拖拽中只有目标分组高亮。
- 应用行与已忽略行可添加单行备注，备注参与搜索。
- 新建「看图」「常用」，把同一个看图软件加入两组；两个组都显示它，未分组计数减 1。
- 分组「⋯」菜单可重命名与删除；重命名空名或未修改不可保存，重名在弹窗内提示；删除确认显示组内应用数，取消默认聚焦，删除后应用仍保留。
- 分组区可切换手动 / 名称 / 创建顺序与正序 / 倒序；切回手动恢复原手动顺序；手动排序下可拖拽握把或 `Alt+↑/↓` 改序，重启后顺序、方式与方向保留。
- 从「看图」移除该应用，它仍在「常用」；两组计数正确。
- 删除「常用」组，应用仍在「看图」，且不触发任何卸载或文件删除。
- 重启应用，分组、归属、图标全部保留。
- 搜索「图」只显示名称/exe 名匹配的应用；清空恢复完整列表。
- 点行尾「启动」能启动；启动路径失效时提示并标记缺失。
- 扫描后 Store / Developer 签名应用出现，来源徽标为 `store`；其他打包应用进入已忽略的「Store 自动忽略应用」；可分组、备注、启动；卸载后刷新标缺失，路径入口置灰。
- 行右键菜单固定「启动 / 打开目标路径 / 打开链接路径」，缺失项置灰；备注输入框内保留系统右键菜单。
- 删除开始菜单快捷方式后刷新：真实应用从列表消失、底部显示缺失数；卸载器 / 安装器 / 系统工具不计入缺失；重新放回后刷新，应用回到原分组。
- 开始菜单里没有快捷方式的已安装应用不会出现（已知限制，后续用「手动添加 exe」兜底；注册表实测无新增，不做）。
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
| D12 | 注册表扫描 | 不做：实测 637 个卸载表项仅 104 个可用启动，其中 99 个开始菜单已有；App Paths 也没有真实新增 | 2026-11-22 |
| D13 | 分组图标 / 颜色 | MVP 不做，只显示名称与计数 | 2026-11-20 |
| D14 | 卸载项过滤 | 详见 [算法设计.md](./算法设计.md)，本文不重复判断逻辑 | 2026-11-20 |
| D15 | 已忽略栏 | 与「未分组」平级；忽略项不落库，只来自最近一次扫描结果，展示名称、目标与原因；重复项单独计数 | 2026-11-20 |

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

## 13. 不做注册表扫描

结论：不做。注册表扫描只能补「没有开始菜单快捷方式」的安装项，但本机实测没有这类真实应用。

实测（2026-11-22）：

- 四个 Uninstall 位置共 637 项；按 DisplayName / SystemComponent / ParentKeyName / ReleaseType / 安装缓存 / 安装与卸载器 / 系统目录 / 辅助程序过滤后，可用启动 104 个。
- 104 个中 99 个开始菜单已有同名快捷方式；剩余 5 个为 Store/AUMID 应用（照片、Copilot）、旧 Java、NSIS、SumatraPDF。SumatraPDF 实际有根级 `Start Menu\SumatraPDF.lnk`，扫描根目录修正后已覆盖。
- App Paths 169 项：150 个 exe 存在，其中 103 项与开始菜单同名 / exe 相同 / 重复，18 项是同目录辅助（Calibre、Java、WPS），29 项「独立」也全是系统程序、Office 辅助进程、Store 应用或命令行工具，没有新的真实应用。
- 噪声主要来自运行库、系统组件、安装器、更新缓存与辅助进程；为它们增加 `publisher` / `version` / `install_location` 字段不划算。

因此：注册表不进入扫描链路；无快捷方式的应用由后续「手动添加 exe」兜底。

## 14. 后续细化

- 绿色软件目录扫描、手动添加 exe / 文件夹
- 托盘常驻、全局热键、开机自启
- 应用别名、分组图标与颜色、组内拖拽排序
- 自动建议分组（基于名称关键词 / 使用频率），但必须保持用户可改
- 使用统计：启动次数、最近使用、久未使用提醒
- 导入导出、换机迁移
- 安装/卸载监听，扫描改为增量事件驱动

## 15. 实现状态

- 开始菜单扫描、快捷方式解析、规则过滤、去重、图标缓存读取与手动提取
- SQLite 存储、扫描对账、缺失应用标记与归属保留
- 未分组池、分组增删改、多对多归属、批量与拖拽归组（行首握把入口，拖拽中目标高亮）、移出分组；分组支持手动 / 名称 / 创建顺序与正序 / 倒序，手动排序可拖拽或键盘调整
- 来源：开始菜单 `.lnk` 与 Store/UWP AUMID；Store / Developer 签名进入应用，其他打包应用进已忽略「Store 自动忽略应用」；行名称旁显示 `start` / `store` 徽标；开始菜单扫描根为 `Start Menu` 本身，包含根级 `.lnk`
- 已忽略栏：与未分组平级，按原因折叠分组并支持搜索；组头吸顶，重复快捷方式独立成组，行内可定位 `.lnk`；折叠组抽成通用 `AccordionSection`
- 全部应用栏：可选「包含已忽略项」，在应用列表下方追加规则忽略项并参与搜索；默认不加载，重复项不列入
- 手动忽略：应用行尾入口，状态落库；已忽略栏顶部独立分组，可取消忽略，拖入分组时自动恢复
- 统一行布局：RowLayout 六列，AppRow / IgnoredShortcutRow / ManualIgnoredAppRow 覆盖应用、规则忽略与手动忽略行；备注单行 10 字、只在中间列、无备注 hover 显示添加、参与搜索，路径仅 hover；备注落库，重启保留
- 帮助/更新/卸载规则区分产品名与功能入口；重复快捷方式单独计数
- 图标缓存优化：`pg-icon://` 协议、扫描无变化跳过二次刷新、失败负缓存、`.lnk` mtime 失效判断
- 扫描状态：右下角进度卡片显示阶段与进度条，扫描结束后底部居中显示结果提示；刷新按钮固定宽度、扫描期间禁用
- 滚动：`html/body/#app` 用 `overflow: clip` 裁切，主列表是唯一滚动容器；备注聚焦只滚动主列表，不带动外层页面
- 搜索、启动、空态、轻提示
- 展示方式：只保留列表，不提供网格视图；整理场景不需要布局切换
- 原生下拉：`:root` 声明 `color-scheme: dark`，「选择分组」用 `appearance: base-select` 定制深色弹层与选项；触发器垂直居中，固定宽度容纳 4 个中文字；箭头自绘并随文字垂直居中，用 `component :is` 渲染 button 消除 select 嵌套告警
- dev / e2e 数据隔离与 electron-log 日志
