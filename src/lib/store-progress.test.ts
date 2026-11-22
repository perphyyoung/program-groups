import { describe, expect, it } from "vitest";
import { parseStoreProgressLine } from "./store-progress";

describe("parseStoreProgressLine", () => {
  it("解析进度行与结果行", () => {
    expect(parseStoreProgressLine("PGPROGRESS 1 3 读取应用包")).toEqual({
      kind: "progress",
      done: 1,
      total: 3,
      detail: "读取应用包",
    });
    expect(parseStoreProgressLine('PGRESULT [{"Name":"A"}]')).toEqual({
      kind: "result",
      raw: '[{"Name":"A"}]',
    });
  });

  it("忽略 PowerShell 噪声与格式错误", () => {
    expect(parseStoreProgressLine("")).toBeNull();
    expect(parseStoreProgressLine("Get-AppxPackage: 拒绝访问")).toBeNull();
    expect(parseStoreProgressLine("PGPROGRESS x 3 读取")).toBeNull();
  });

  it("detail 允许空格，去掉首尾空白", () => {
    expect(parseStoreProgressLine("PGPROGRESS 2 3  读取 Store 启动项  ")).toEqual({
      kind: "progress",
      done: 2,
      total: 3,
      detail: "读取 Store 启动项",
    });
  });
});
