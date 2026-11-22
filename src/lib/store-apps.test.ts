import { describe, expect, it } from "vitest";
import { appIdForAumid, classifyStoreApps, parseStoreApps } from "./store-apps";

const aumid = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";

describe("store apps", () => {
  it("AUMID 生成稳定 ID", () => {
    expect(appIdForAumid(aumid)).toBe(appIdForAumid(aumid));
    expect(appIdForAumid(aumid)).toMatch(/^store:[0-9a-f]{16}$/u);
    expect(appIdForAumid(aumid)).not.toBe(appIdForAumid(`${aumid}2`));
  });

  it("解析数组、单对象并去重", () => {
    expect(parseStoreApps([{ Name: "计算器", AppID: aumid, SignatureKind: "Store" }])).toEqual([
      { name: "计算器", aumid, signatureKind: "Store" },
    ]);
    expect(parseStoreApps({ Name: "计算器", AppID: aumid })).toEqual([
      { name: "计算器", aumid, signatureKind: "未知" },
    ]);
    expect(
      parseStoreApps([
        { Name: "计算器", AppID: aumid, SignatureKind: "System" },
        { Name: "计算器副本", AppID: aumid, SignatureKind: "Store" },
      ]),
    ).toEqual([{ name: "计算器副本", aumid, signatureKind: "Store" }]);
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

  it("Store 与 Developer 归入应用，其他归入已忽略", () => {
    const result = classifyStoreApps([
      { name: "计算器", aumid, signatureKind: "Store" },
      { name: "开发应用", aumid: "DevApp_8wekyb3d8bbwe!App", signatureKind: "Developer" },
      { name: "系统应用", aumid: "SystemApp_8wekyb3d8bbwe!App", signatureKind: "System" },
      { name: "企业应用", aumid: "EntApp_8wekyb3d8bbwe!App", signatureKind: "Enterprise" },
      { name: "无签名应用", aumid: "NoneApp_8wekyb3d8bbwe!App", signatureKind: "None" },
    ]);

    expect(result.apps.map((app) => app.name)).toEqual(["计算器", "开发应用"]);
    expect(result.apps[0]).toEqual({
      id: appIdForAumid(aumid),
      name: "计算器",
      launchPath: aumid,
      launchKind: "aumid",
      exePath: "",
      source: "store",
      iconFile: null,
    });
    expect(result.ignored.map((item) => item.reason)).toEqual([
      "store-auto-ignore",
      "store-auto-ignore",
      "store-auto-ignore",
    ]);
    expect(result.ignored[0]).toMatchObject({
      source: "store",
      launchKind: "aumid",
      launchPath: "SystemApp_8wekyb3d8bbwe!App",
    });
    expect(result.ignored[0]?.shortcutPath).toBeUndefined();
  });
});
