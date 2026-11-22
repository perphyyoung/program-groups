import { describe, expect, it } from "vitest";
import { appIdForAumid, parseStoreApps, toStoreApps } from "./store-apps";

const aumid = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";

describe("store apps", () => {
  it("AUMID 生成稳定 ID", () => {
    expect(appIdForAumid(aumid)).toBe(appIdForAumid(aumid));
    expect(appIdForAumid(aumid)).toMatch(/^store:[0-9a-f]{16}$/u);
    expect(appIdForAumid(aumid)).not.toBe(appIdForAumid(`${aumid}2`));
  });

  it("解析数组、单对象并去重", () => {
    expect(parseStoreApps([{ Name: "计算器", AppID: aumid }])).toEqual([{ name: "计算器", aumid }]);
    expect(parseStoreApps({ Name: "计算器", AppID: aumid })).toEqual([{ name: "计算器", aumid }]);
    expect(
      parseStoreApps([
        { Name: "计算器", AppID: aumid },
        { Name: "计算器副本", AppID: aumid },
      ]),
    ).toEqual([{ name: "计算器副本", aumid }]);
  });

  it("丢弃无效项", () => {
    expect(
      parseStoreApps([
        null,
        {},
        { Name: "", AppID: aumid },
        { Name: "普通快捷方式", AppID: "C:\\Apps\\a.exe" },
        { Name: 1, AppID: aumid },
      ]),
    ).toEqual([]);
  });

  it("转换为扫描候选", () => {
    const [app] = toStoreApps([{ name: "计算器", aumid }]);
    expect(app).toEqual({
      id: appIdForAumid(aumid),
      name: "计算器",
      launchPath: aumid,
      launchKind: "aumid",
      exePath: "",
      source: "store",
      iconFile: null,
    });
  });
});
