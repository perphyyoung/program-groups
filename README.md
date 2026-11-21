# 软件分组 program-groups

Windows 开始菜单软件整理与分组工具：扫描快捷方式，按分组整理应用，并记住每个应用的备注与归属。

## 功能

- 扫描开始菜单快捷方式，自动忽略系统项、无效目标与重复项
- 全部应用 / 未分组 / 已忽略栏；同一应用可加入多个分组
- 分组增删改，支持手动、名称、创建顺序与正序 / 倒序；手动排序可拖拽或 `Alt+↑/↓`
- 批量选择、拖拽归组、取消忽略；应用行支持 10 字备注并参与搜索
- 行尾「启动」，右键可打开目标路径或链接路径
- 所有数据保存在本机，重启与升级不丢失

## 数据

备注、分组与归属保存在本机 SQLite：`%APPDATA%\program-groups\pg.db`。卸载应用不会删除数据。

开发模式数据写在项目根 `pg-data/pg.db`。

## 使用

从 `release/Program Groups Setup x.y.z.exe` 安装后直接运行，无需额外配置。

## 开发

```bash
pnpm install
pnpm dev
```

打包安装程序：

```bash
pnpm release
```

工程约定、命令清单、日志与 e2e 说明见 [AGENTS.md](./AGENTS.md)。

## License

GPL-3.0
