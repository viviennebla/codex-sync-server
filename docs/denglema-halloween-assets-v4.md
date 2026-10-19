# 万圣节 v4 · 当前唯一有效素材与分层合同

> **当前版本（2026-10-19）**：以本文件和 `public/themes/halloween/manifest.json` 为准。
> 旧 `denglema-halloween-layered-v2.md`、`denglema-halloween-office-theme.md` 仅记录历史，不是可直接照抄的生产路径。

## 1. 规范

全景办公室与双赛道使用相同的 **2048×768、8:3 左上原点**。生成时未把固定黑猫、蝙蝠和亮起的南瓜灯芯画进背景。下列 4 种逻辑美术层相互独立，浏览器里统一采用 `background-position:center; background-size:cover`：

| 逻辑层 | 当前文件 | 行为 |
| --- | --- | --- |
| 暗底图 `base` | `art/base-1920.webp` / `base-2560.webp` / `base-3840.webp` | 由浏览器按 DPR 选择；图片里没有固定猫/蝙蝠与亮灯南瓜脸 |
| `bats-static` | `art/bats-static.webp` | 同画布透明蝙蝠，可以单独隐藏 |
| `cats-static` | `art/cats-static.webp` | 同画布透明黑猫，不遮挡点击 |
| `pumpkin-glow` | `art/glow-pumpkins.webp` | 同画布透明橙光，0.10→1 循环呼吸 |

两个可偶发飞行的蝙蝠精灵为 `sprites/bat-flyover-01.webp` 和 `sprites/bat-flyover-02.webp`，从同一蝙蝠素材组提取。它们是独立动态装饰，不属于位图全景的配准层。全部视觉元素设 `pointer-events:none`，不改变骑手双赛道与拖动逻辑。

**母图**：`art/base-master-2048.webp` 是仓库保留的无损母图，不作为公网静态路由；正式资源仅使用 manifest 记录的白名单路径。3 个 base 档位都是同一母图导出，其中 3840×1440 **不代表原生 3840 的新细节**。要做真正原生高清，需未来另行绘制母图。

## 2. 如何替换素材而不发生错位

- 所有全景透明层保持相同 **2048×768 canvas**，不能分别按元素裁剪后再当作全景加载。
- glow 中南瓜的中心位置来自同一创作构图，先在 2048 原生像素下叠加看定位，再实际以 1440 和 375 网页截图确认 `cover` 裁切；不靠 CSS 的 `left/top` 修补错位。
- 静态 bat/cat 可独立关闭，不能重复烘焙进底图。真正的角色头像、交通方式仍由实时 DOM 渲染。
- 新一轮换图时，用新文件名导出并更新 Manifest + server 白名单；不得恢复已删除的旧 `base-dark`、旧 `glow-pumpkins-aligned` 和旧 `office-stage-halloween.svg`。

## 3. 运行与回滚

`?season=halloween` 启用，`?season=off` 完全退回普通四车道；此两种模式无数据迁移。当前 UI、身份、Usage、动态栏、个人位置权限均保持不变。部署时需要检查 `denglema-dev.service :1600`、Funnel、`/health`、`/api/riders`；不能只看 GitHub CI 的绿色状态。要退回上一套万圣节美术，可以从 Git 历史找到 PR #71 的资源，但不应把已废弃文件留在当前主分支制造混淆。

## 4. 这次清理的范围

只删除 **`public/themes/halloween/`** 下的旧版本生产文件：旧 AVIF、旧背景变体、旧南瓜/吊灯 glow、旧 glints、早期 SVG 办公室/道路/icons 和旧蝙蝠 SVG。其余业务素材、普通版 `public/office-stage.svg`、`docs/assets/` 里的用户设计稿与参考图保留。

旧 `docs/denglema-halloween-layered-v2.md` 记录为何此前错位及临时调光策略；那些参数并非当前实现。
