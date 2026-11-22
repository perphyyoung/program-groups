import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appIdForExe, normalizeExePath } from "./scan-rules";
import { scanGreenDirs } from "./green-rules";

let dir: string;

function exe(path: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-green-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("scanGreenDirs", () => {
  it("递归读取全部 exe，不过滤辅助程序", () => {
    const alpha = exe(join(dir, "Alpha", "Alpha.exe"));
    const helper = exe(join(dir, "Alpha", "sub", "helper.exe"));
    const beta = exe(join(dir, "Beta", "Beta.EXE"));
    const result = scanGreenDirs([dir]);

    expect(result.readable).toBe(1);
    expect(result.scanned).toBe(3);
    expect(result.apps.map((app) => app.name).toSorted()).toEqual(["Alpha", "Beta", "helper"]);
    for (const app of result.apps) {
      expect(app.source).toBe("green");
      expect(app.launchKind).toBe("exe");
      expect(app.iconFile).toBeNull();
    }
    const byName = new Map(result.apps.map((app) => [app.name, app]));
    expect(byName.get("Alpha")?.launchPath).toBe(alpha);
    expect(byName.get("Beta")?.launchPath).toBe(beta);
    expect(byName.get("helper")?.launchPath).toBe(helper);
  });

  it("多个目录合并，id 与 exe 路径绑定", () => {
    const first = exe(join(dir, "a", "One.exe"));
    const second = exe(join(dir, "b", "Two.exe"));
    const result = scanGreenDirs([join(dir, "a"), join(dir, "b")]);

    expect(result.apps).toHaveLength(2);
    const one = result.apps.find((app) => app.name === "One");
    expect(one?.id).toBe(appIdForExe(normalizeExePath(first)));
    expect(one?.exePath).toBe(normalizeExePath(first));
    expect(result.apps.find((app) => app.name === "Two")?.launchPath).toBe(second);
  });

  it("目录不存在或为空时不产生应用", () => {
    expect(scanGreenDirs([join(dir, "missing")])).toEqual({
      apps: [],
      scanned: 0,
      readable: 0,
    });
    mkdirSync(join(dir, "empty"));
    expect(scanGreenDirs([join(dir, "empty")])).toEqual({
      apps: [],
      scanned: 0,
      readable: 1,
    });
  });
});
