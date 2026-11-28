import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECENT_WINDOW_DAYS,
  formatChangeDate,
  isRecentWindowDays,
  parseRecentWindowDays,
  recentCutoff,
  recentChanges,
} from "./recent-changes";
import type { AppEntry } from "./types";

const NOW = new Date("2026-11-28T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function entry(overrides: Partial<AppEntry> & { id: string }): AppEntry {
  return {
    name: overrides.id,
    launchPath: `C:\\apps\\${overrides.id}.lnk`,
    launchKind: "lnk",
    exePath: `C:\\apps\\${overrides.id}.exe`,
    iconFile: null,
    source: "start",
    status: "active",
    firstSeenAt: "2020-01-01T00:00:00.000Z",
    lastSeenAt: "2020-01-01T00:00:00.000Z",
    statusChangedAt: null,
    groupIds: [],
    iconUrl: null,
    ...overrides,
  };
}

describe("recentCutoff", () => {
  it("按 n×24h 滚动窗口计算起点", () => {
    expect(recentCutoff(NOW, 7)).toBe(new Date(NOW.getTime() - 7 * DAY).toISOString());
  });
});

describe("isRecentWindowDays / parseRecentWindowDays", () => {
  it("接受范围内的整数", () => {
    expect(isRecentWindowDays(1)).toBe(true);
    expect(isRecentWindowDays(365)).toBe(true);
    expect(parseRecentWindowDays(" 30 ")).toBe(30);
  });

  it("拒绝小数、越界与非数字", () => {
    expect(isRecentWindowDays(0)).toBe(false);
    expect(isRecentWindowDays(366)).toBe(false);
    expect(isRecentWindowDays(7.5)).toBe(false);
    expect(parseRecentWindowDays("abc")).toBeNull();
    expect(parseRecentWindowDays("")).toBeNull();
    expect(parseRecentWindowDays("400")).toBeNull();
  });

  it("默认窗口为 7 天", () => {
    expect(DEFAULT_RECENT_WINDOW_DAYS).toBe(7);
  });
});

describe("recentChanges", () => {
  it("窗口内首次出现的应用归入新增", () => {
    const app = entry({ id: "a", firstSeenAt: "2026-11-27T00:00:00.000Z" });
    const result = recentChanges([app], [], 7, NOW);
    expect(result.added).toEqual([app]);
    expect(result.restored).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("窗口外首次出现但最近变回 active 的应用归入恢复", () => {
    const app = entry({
      id: "b",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      statusChangedAt: "2026-11-27T00:00:00.000Z",
    });
    const result = recentChanges([app], [], 7, NOW);
    expect(result.restored).toEqual([app]);
    expect(result.added).toEqual([]);
  });

  it("窗口内变缺失的应用归入缺失", () => {
    const app = entry({
      id: "c",
      status: "missing",
      statusChangedAt: "2026-11-26T00:00:00.000Z",
    });
    const result = recentChanges([], [app], 7, NOW);
    expect(result.missing).toEqual([app]);
  });

  it("优先级：firstSeenAt 在窗口内时即使刚恢复也归入新增", () => {
    const app = entry({
      id: "d",
      firstSeenAt: "2026-11-26T00:00:00.000Z",
      statusChangedAt: "2026-11-27T00:00:00.000Z",
    });
    const result = recentChanges([app], [], 7, NOW);
    expect(result.added).toEqual([app]);
    expect(result.restored).toEqual([]);
  });

  it("无变化时间的应用不进入任何分类", () => {
    const app = entry({ id: "e" });
    const result = recentChanges([app], [entry({ id: "f", status: "missing" })], 7, NOW);
    expect(result.added).toEqual([]);
    expect(result.restored).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("窗口外的缺失不出现", () => {
    const app = entry({
      id: "g",
      status: "missing",
      statusChangedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(recentChanges([], [app], 7, NOW).missing).toEqual([]);
    expect(recentChanges([], [app], 365, NOW).missing).toEqual([app]);
  });

  it("恰好等于窗口起点的时间戳仍在窗口内", () => {
    const cutoff = recentCutoff(NOW, 7);
    const added = entry({ id: "h", firstSeenAt: cutoff });
    const restored = entry({
      id: "i",
      firstSeenAt: "2020-01-01T00:00:00.000Z",
      statusChangedAt: cutoff,
    });
    const missing = entry({ id: "j", status: "missing", statusChangedAt: cutoff });
    const result = recentChanges([added, restored], [missing], 7, NOW);
    expect(result.added).toEqual([added]);
    expect(result.restored).toEqual([restored]);
    expect(result.missing).toEqual([missing]);
  });

  it("各块按变化时间倒序，同时间按名称", () => {
    const old = entry({ id: "h", firstSeenAt: "2026-11-27T00:00:00.000Z" });
    const newer = entry({ id: "h", firstSeenAt: "2026-11-28T00:00:00.000Z" });
    const sameA = entry({ id: "甲", firstSeenAt: "2026-11-28T00:00:00.000Z" });
    const result = recentChanges([old, newer, sameA], [], 7, NOW);
    expect(result.added.map((app) => app.firstSeenAt)).toEqual([
      "2026-11-28T00:00:00.000Z",
      "2026-11-28T00:00:00.000Z",
      "2026-11-27T00:00:00.000Z",
    ]);
  });
});

describe("formatChangeDate", () => {
  it("格式化为本地日期", () => {
    expect(formatChangeDate("2026-11-28T08:30:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("非法时间返回空串", () => {
    expect(formatChangeDate("not-a-date")).toBe("");
  });
});
