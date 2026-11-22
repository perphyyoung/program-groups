import { describe, expect, it } from "vitest";
import { iconFileForId, iconMissFileForId } from "./icon-files";

describe("iconFileForId", () => {
  it("普通 ID 加 start 前缀", () => {
    expect(iconFileForId("1d6646935faee063")).toBe("icons/start_1d6646935faee063.png");
  });

  it("Store ID 的冒号转成下划线，避免 NTFS 数据流", () => {
    expect(iconFileForId("store:d6f4c2703a9b76b0")).toBe("icons/store_d6f4c2703a9b76b0.png");
    expect(iconMissFileForId("store:d6f4c2703a9b76b0")).toBe("icons/store_d6f4c2703a9b76b0.miss");
  });

  it("其它非法文件名字符也替换", () => {
    expect(iconFileForId('a<b>c:d"e/f\\g|h?i*j')).toBe("icons/start_a_b_c_d_e_f_g_h_i_j.png");
  });

  it("green 来源使用 green 前缀", () => {
    expect(iconFileForId("1d6646935faee063", "green")).toBe("icons/green_1d6646935faee063.png");
    expect(iconMissFileForId("1d6646935faee063", "green")).toBe(
      "icons/green_1d6646935faee063.miss",
    );
  });
});
