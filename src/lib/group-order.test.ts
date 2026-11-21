import { describe, expect, it } from "vitest";
import { moveGroupOrder, sortGroups, toStoredOrder } from "./group-order";
import type { GroupEntry } from "./types";

function group(id: string, name: string, sort: number, createdAt: string): GroupEntry {
  return { id, name, sort, count: 0, createdAt };
}

const manual = [
  group("b", "乙组", 2, "2026-01-02T00:00:00.000Z"),
  group("a", "甲组", 1, "2026-01-03T00:00:00.000Z"),
  group("c", "丙组", 3, "2026-01-01T00:00:00.000Z"),
];

describe("sortGroups", () => {
  it("手动排序按 sort 升序", () => {
    expect(sortGroups(manual, "manual").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("名称排序按中文名称", () => {
    expect(sortGroups(manual, "name").map((item) => item.name)).toEqual(["丙组", "甲组", "乙组"]);
  });

  it("创建顺序按时间升序", () => {
    expect(sortGroups(manual, "created").map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("三种方式倒序都是升序的镜像", () => {
    expect(sortGroups(manual, "manual", "desc").map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(sortGroups(manual, "name", "desc").map((item) => item.name)).toEqual([
      "乙组",
      "甲组",
      "丙组",
    ]);
    expect(sortGroups(manual, "created", "desc").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("toStoredOrder", () => {
  const visible = ["a", "b", "c"];

  it("手动正序原样写回", () => {
    expect(toStoredOrder(visible, "manual", "asc")).toEqual(["a", "b", "c"]);
  });

  it("手动倒序反转为升序", () => {
    expect(toStoredOrder(visible, "manual", "desc")).toEqual(["c", "b", "a"]);
  });

  it("自动排序不反写", () => {
    expect(toStoredOrder(visible, "name", "desc")).toEqual(["a", "b", "c"]);
  });
});

describe("moveGroupOrder", () => {
  const ids = ["a", "b", "c"];

  it("下移一位", () => {
    expect(moveGroupOrder(ids, "a", 2)).toEqual(["b", "a", "c"]);
  });

  it("上移一位", () => {
    expect(moveGroupOrder(ids, "c", 1)).toEqual(["a", "c", "b"]);
  });

  it("移到末尾", () => {
    expect(moveGroupOrder(ids, "a", 3)).toEqual(["b", "c", "a"]);
  });

  it("移到开头", () => {
    expect(moveGroupOrder(ids, "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("原位投放不改变顺序", () => {
    expect(moveGroupOrder(ids, "b", 1)).toEqual(ids);
    expect(moveGroupOrder(ids, "b", 2)).toEqual(ids);
  });

  it("未知 ID 返回原顺序副本", () => {
    const result = moveGroupOrder(ids, "x", 0);
    expect(result).toEqual(ids);
    expect(result).not.toBe(ids);
  });

  it("手动倒序拖拽：可见顺序反写为升序", () => {
    const nextVisible = moveGroupOrder(ids, "a", 3);
    expect(nextVisible).toEqual(["b", "c", "a"]);
    expect(toStoredOrder(nextVisible, "manual", "desc")).toEqual(["a", "c", "b"]);
  });
});
