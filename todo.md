# todo

## 使用说明

- 本文件仅供临时性的进度追踪，其它文件不得引用
- todo 部分按照 [] 格式书写，并根据实现进度更新；背景等其他部分可以自由格式
- 新增时，在下方增加一个二级标题

## e2e 优化清单（来源：playwright-cli skill 审查，2026-11-28）

### 已做

- [x] refresh 等按钮恢复 enabled（11-recent-changes 内）；提取共享、覆盖其余文件 → 见 P1
- [x] e2e 失败隔离 / debug 日志基建 / clock 用法沉淀 → 已进 11 号与文档

### 待做

- [x] P1 refresh helper 提取到 e2e-helper.ts，02 / 06 / 10 / 11 统一等 enabled（扫描守卫竞态）
- [x] P2 slot teardown 检查 testInfo.status，失败时 dispose，下个用例拿干净实例
- [x] P6 删 07:32 冗余 `timeout: 5000`（等于默认值）
- [x] P8 e2e-readme 约定节补调试工作流：`pnpm e2e --debug=cli` + `playwright-cli attach`
- [ ] P3 计数断言改精确——评估后缓期：假绿需计数膨胀 10 倍，当前 fixture 无此路径；锚定正则侵入 15+ 处断言，等计数场景复杂化再做
- [ ] P4 大用例 test.step 分段（02 五场景、03 排序 150 行），失败 trace 可定位到段（随下次改动顺带）
- [ ] P5 fixture 支持自定义 greenDirs，08 / 09 / 10 收编回 fixtures——单独一轮：09 来源计数等断言会连锁变化
- [x] P7 02 吸顶验证改 `mouse.wheel`，替代 programmatic scrollTop（可选）
- [x] P9 config 加 `screenshot: "only-on-failure"`（可选，trace 已覆盖）
