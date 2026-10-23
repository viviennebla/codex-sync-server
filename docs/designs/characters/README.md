# 蹬了吗 · 已确认的人物美术母版

本目录用于**审定的角色概念设计稿**，不放临时浏览器截图、测试对照图、自动生成的候选海报或工程渲染图。

## 2026-10-22 六角色原稿

![蹬了吗六角色原始审定设计稿](abstract-mascots-approved-2026-10-22.png)

- **审定原稿**：[abstract-mascots-approved-2026-10-22.png](abstract-mascots-approved-2026-10-22.png)（用户提供，保留原始 PNG 字节，未经二次编码）。
- 源图片规格：**1448 × 1086，PNG**；原件 SHA-256：`d4186c7c642f4e72813cac075c5138a146ca5e292694877de65f799e1639849a`。
- 角色顺序：**头盔通勤客 / 泡泡套装客 / 胶囊连帽客 / 雨衣豆豆客 / 迷你机器人客 / 软萌团子客**。
- 视觉要求：一致右向侧视、无性别特征、四肢和表情、保留原稿角色轮廓与配色，可适配不同载具。
- 工程边界：原图仅是审定美术母版，并非已切好的透明 PNG 帧序列；角色素材应在 `public/riders/frames/` 下根据 Rider Pack 规则单独生产，不可直接把整张海报当角色图集裁剪并用于正式渲染。

当前最新的角色加载合同见 [Rider Pack 文档](../../denglema-character-frames-v1.md)。

## 临时图片清理规则

- 本目录仅保留用户明确确认的参考母版；未确认的 AI 候选图和临时演示图不应入库。
- 开发截图统一放 [`docs/qa/riders/`](../../qa/riders/README.md) 并保留文档引用。不能把这些历史截图误标为审定设计稿。

## 2026-10-23 工程实现

六角色原稿仍是权威视觉基准，但用户明确决定 **本轮只实装 ② 泡泡套装客、④ 雨衣豆豆客、⑥ 软萌团子客**；保留已有头盔通勤客，原稿中的③胶囊连帽客与⑤迷你机器人客不注册、不发布。

- 生成脚本：`scripts/generate-approved-mascot-packs.py`。在 128×100 像素网格上重新绘制不透明轮廓、明暗面和高光，独立产生透明 PNG；**不从原稿或生成的概念海报直接裁图**。
- 三角色各有独立四种表情头、walk 八帧（plain/pack）；泡泡套装客另有 scooter 八帧、软萌团子客另有 skate 八帧。未登记的交通方式按合同回退 walk。
- Windows 开发目录：`D:\workspace\codex-sync-server-mascot-art`。双击根目录 `open-rider-preview.cmd` 可在本机浏览器打开已有 `/rider-preview` 页面，也可执行 `node scripts/rider-preview-local.mjs`，访问 `http://127.0.0.1:17881/rider-preview`。
- 本地 Preview 只提供已审核 Rider Pack 清单/API 和静态文件，复用线上 PNG Runtime，不连接账号、Usage 或生产数据库。
- Windows Chrome 1440×900、375×812 已验证角色切换、逐帧更新、PNG 解码、无 HTTP 资源错误与 JS 页面异常；截图在 `docs/qa/riders/selected-*-windows.png`。
- **美术限制**：这批为基于审定稿的程序化像素重绘，并非人工逐像素精修的最终美术；人眼确认大尺寸细节后再合并。
