# 蹬了吗 · 旧 SVG 素材清理核验（2026-10-22）

## 结论

本次核验基于 `main@0db8bc6`。**旧版粗糙人物 SVG 和废弃的节日 SVG 已经从当前文件树移除，因此没有仍待删除的旧 SVG 文件。** 不创建无实际差异的删除提交。

### 已删除且不可恢复为生产资源

| 废弃路径 | 原用途 |
| --- | --- |
| `public/riders/presets/helmet-commuter/head.svg` | 旧头部 |
| `public/riders/presets/helmet-commuter/body.svg` | 旧身体 |
| `public/riders/presets/helmet-commuter/backpack.svg` | 旧背包 |
| `public/riders/presets/helmet-commuter/bike.svg` | 旧整车 |
| `docs/assets/denglema/helmet-commuter-v01-design-board.svg` | 被否决的工程设计板 |
| `public/themes/halloween/office-stage-halloween.svg` | 被现有万圣节分层图片方案替换的早期场景 |

核验时以上 5 个公共资源旧地址均返回 HTTP 404（设计板仅检查 Git 文件不存在）；`test/retired-svg-art.test.js` 保护这些旧文件不会重新出现在当前代码树中。

### 当前仍在使用，**不能误删**的 SVG（7 个）

| 文件 | 正在使用的地方 |
| --- | --- |
| `public/office-stage.svg` | 普通主题背景，`public/styles.css` 中仍引用 |
| `public/riders/presets/helmet-commuter/bike-frame.svg` | 自行车车架，骑手 Manifest 与 Runtime |
| `public/riders/presets/helmet-commuter/bike-wheel.svg` | 自行车及其他载具的转轮，骑手 Manifest 与 Runtime |
| `public/riders/presets/helmet-commuter/scooter.svg` | 滑板车视觉 |
| `public/riders/presets/helmet-commuter/skateboard.svg` | 滑板视觉 |
| `public/riders/presets/helmet-commuter/surf.svg` | 冲浪视觉 |
| `public/riders/presets/helmet-commuter/skate.svg` | 轮滑视觉 |

以上是**当前版本清单**，不是要求未来永远保留这七个文件。

## 与 PNG 人物迁移的边界

并行 PR #81 正在研究逐帧 PNG 角色。该 PR 的 `scripts/export-rider-frames.py` 当前仍依赖自行车 `bike-frame.svg` / `bike-wheel.svg`，所以在 PNG 素材未完善、导出流程未迁移前，不应提前删除这些源文件。

当 PNG 逐帧素材覆盖实际全部六种载具，且生产 Runtime、静态路由、导出脚本与测试均不再引用旧 SVG 后，可以开独立的真正文件删除 PR。清理时应按**引用关系而不是扩展名**判断素材是否废弃。

## 验证方式

```bash
npm test
git ls-files '*.svg'
git grep -n 'office-stage.svg'
```

本记录不修改任何网站运行逻辑、头像、赛道或素材路由；线上版本不因此变更。
