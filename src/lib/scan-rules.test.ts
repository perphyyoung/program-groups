import { describe, expect, it } from "vitest";
import {
  appIdForExe,
  cleanShortcutName,
  isIgnoredShortcut,
  normalizeExePath,
  pickBestShortcuts,
  type ShortcutCandidate,
} from "./scan-rules";

function candidate(overrides: Partial<ShortcutCandidate>): ShortcutCandidate {
  return {
    id: "abc",
    name: "示例",
    launchPath: "C:\\Start\\示例.lnk",
    launchKind: "lnk",
    exePath: "C:\\Apps\\demo.exe",
    targetPath: "C:\\Apps\\demo.exe",
    arguments: "",
    iconLocation: null,
    iconIndex: null,
    relativePath: "工具\\示例.lnk",
    ...overrides,
  };
}

describe("scan rules", () => {
  it("清理快捷方式名", () => {
    expect(cleanShortcutName("看图王 - 快捷方式.lnk")).toBe("看图王");
    expect(cleanShortcutName("VLC.lnk")).toBe("VLC");
  });

  it("规范化路径并生成稳定 ID", () => {
    const a = normalizeExePath('"C:\\Apps\\Demo.exe"');
    const b = normalizeExePath("c:/apps/demo.exe");
    expect(a).toBe(b);
    expect(appIdForExe(a)).toHaveLength(16);
    expect(appIdForExe(a)).toBe(appIdForExe(b));
  });

  it("过滤卸载/帮助/更新入口，不误伤产品名与功能入口", () => {
    const base = "C:\\Apps\\app.exe";
    expect(
      isIgnoredShortcut("卸载 Demo", "C:\\Apps\\unins000.exe", "", "Demo\\卸载 Demo.lnk"),
    ).toBe("uninstall");
    expect(isIgnoredShortcut("7-Zip 卸载", "C:\\Apps\\Uninstall.exe", "", "7-Zip\\卸载.lnk")).toBe(
      "uninstall",
    );
    expect(
      isIgnoredShortcut(
        "MSI App",
        "C:\\Windows\\System32\\msiexec.exe",
        "/x {GUID}",
        "MSI App\\卸载.lnk",
      ),
    ).toBe("uninstall");
    expect(
      isIgnoredShortcut(
        "Wise Program Uninstaller",
        "C:\\Program Files (x86)\\Wise\\Wise Program Uninstaller\\WiseProgramUninstaller.exe",
        "",
        "Wise Program Uninstaller\\Wise Program Uninstaller.lnk",
      ),
    ).toBeNull();
    expect(
      isIgnoredShortcut("Uninstall Tool", "C:\\Apps\\UninstallTool.exe", "", "Uninstall Tool.lnk"),
    ).toBeNull();
    expect(
      isIgnoredShortcut(
        "Uninstall IrfanView",
        "D:\\program-py\\IrfanView\\iv_uninstall.exe",
        "",
        "IrfanView\\Uninstall IrfanView.lnk",
      ),
    ).toBe("uninstall");
    expect(
      isIgnoredShortcut(
        "卸载 腾讯会议",
        "C:\\Program Files (x86)\\Tencent\\WeMeet\\3.14.8.405\\WeMeetUninstall.exe",
        "",
        "腾讯会议\\卸载 腾讯会议.lnk",
      ),
    ).toBe("uninstall");
    expect(
      isIgnoredShortcut(
        "卸载迅雷",
        "D:\\program-py\\Thunder\\program\\ThunderUninstall.exe",
        "",
        "迅雷\\卸载迅雷.lnk",
      ),
    ).toBe("uninstall");
    expect(
      isIgnoredShortcut(
        "卸载小绿鲸英文文献阅读器",
        "C:\\Program Files\\xljsci\\Uninstall 小绿鲸英文文献阅读器.exe",
        "",
        "小绿鲸\\卸载小绿鲸英文文献阅读器.lnk",
      ),
    ).toBe("uninstall");

    expect(
      isIgnoredShortcut(
        "金山文档",
        "C:\\Program Files (x86)\\金山文档\\金山文档.exe",
        "",
        "金山文档\\金山文档.lnk",
      ),
    ).toBeNull();
    expect(
      isIgnoredShortcut(
        "查看稻壳阅读器使用手册",
        "C:\\Users\\py\\AppData\\Local\\Programs\\DocBox\\DocBox.exe",
        "",
        "DocBox\\查看稻壳阅读器使用手册.lnk",
      ),
    ).toBe("help");
    expect(
      isIgnoredShortcut(
        "微信输入法",
        "C:\\Program Files\\Tencent\\WeType\\3.0.1.35\\wetype_update.exe",
        "-showsetting",
        "微信输入法\\微信输入法.lnk",
      ),
    ).toBeNull();
    expect(
      isIgnoredShortcut(
        "隔空传送",
        "C:\\Program Files\\Tencent\\WeType\\3.0.1.35\\wetype_update.exe",
        "-showfiletransfer",
        "微信输入法\\隔空传送.lnk",
      ),
    ).toBeNull();

    expect(isIgnoredShortcut("Demo 帮助", base, "", "Demo\\帮助.lnk")).toBe("help");
    expect(isIgnoredShortcut("About Java", base, "", "Java\\About Java.lnk")).toBe("help");
    expect(isIgnoredShortcut("Administrative Tools", base, "", "Administrative Tools.lnk")).toBe(
      "system",
    );
    expect(isIgnoredShortcut("检查更新", base, "", "Demo\\更新.lnk")).toBe("website");
    expect(isIgnoredShortcut("检查更新", "C:\\Apps\\update.exe", "", "Demo\\更新.lnk")).toBe(
      "website",
    );
    expect(
      isIgnoredShortcut("记事本", "C:\\Windows\\notepad.exe", "", "Windows 附件\\记事本.lnk"),
    ).toBe("system");
    expect(isIgnoredShortcut("Demo", "C:\\Apps\\setup.exe", "", "Demo\\Demo.lnk")).toBe(
      "installer",
    );
    expect(isIgnoredShortcut("看图王", base, "", "看图\\看图王.lnk")).toBeNull();
  });

  it("同一 exe 只保留最浅、名称最稳定的快捷方式", () => {
    const picked = pickBestShortcuts([
      candidate({
        name: "Beta",
        relativePath: "a\\b\\Other.lnk",
        launchPath: "C:\\Start\\a\\b\\Other.lnk",
      }),
      candidate({ name: "A", relativePath: "A.lnk", launchPath: "C:\\Start\\A.lnk" }),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.name).toBe("A");
  });

  it("同一 exe 有多个入口时，优先选择与父文件夹同名的快捷方式", () => {
    const picked = pickBestShortcuts([
      candidate({
        name: "隔空传送",
        relativePath: "微信输入法\\隔空传送.lnk",
        launchPath: "C:\\Start\\微信输入法\\隔空传送.lnk",
      }),
      candidate({
        name: "微信输入法",
        relativePath: "微信输入法\\微信输入法.lnk",
        launchPath: "C:\\Start\\微信输入法\\微信输入法.lnk",
      }),
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.name).toBe("微信输入法");
  });
});
