import { join } from "node:path";
import log from "electron-log";

/**
 * e2e 与主进程共用项目根的 pg.log：
 * 一次运行里「测试做了什么 → 应用响应了什么」写在同一份文件，便于对照排查。
 */
log.transports.file.resolvePathFn = () => join(process.cwd(), "pg.log");
log.transports.file.level = "debug";
log.transports.console.level = "warn";

export { log };
