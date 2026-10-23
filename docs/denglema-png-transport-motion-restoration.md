# 蹬了吗 · 六种交通方式动作恢复（PNG）

## 事故与来源

- #80 的原始实现是 `public/rider-runtime.js`：角色通过 SVG 部件骨架执行四种专属动作，并按 `*_ride` / `*_glide` 切换；渲染的头部、主体、四肢和载具彼此独立。
- #81 用 PNG-only 帧渲染替代旧 SVG runtime。最初只提供 bike 和 walk，四种载具被明确标记为待补充。
- #91 注册四个静态载具，但复用了 `walk/pack` 与 `walk/plain` 身体 6 帧；因此六种模式虽然有不同车，腿和手还在一起走路。
- 本次从**仓库保存的 #80 动作代码**（不从想象或概念图）确定性渲染四种专属姿态，再导出新的、允许被审核与缓存版本控制的 128×100 透明 PNG。生产运行仍使用 `rider-frame-runtime.js`，不会启用旧 SVG/CSS renderer。

## 映射

| Transport | 旧行为（#80） | 新数据 |
| --- | --- | --- |
| bike | 踩踏、滑行、刹车 | 原 bike PNG 未变 |
| walk | 交替步行/脚尖方向变化 | 原 walk PNG 未变 |
| scooter | 站板脚 + 另一脚交替蹬地、握车把、轮子滚动 | 6 ride + 2 glide 个体帧与 6+2 车帧 |
| skateboard | 双腿屈伸、双臂平衡、板身轻摇、车轮旋转 | 6 ride + 2 glide 个体帧与 6+2 车帧 |
| surf | 双臂展开平衡、板/水波一起上下轻摆 | 6 ride + 2 glide 个体帧与 6+2 车帧 |
| skate | 双腿交替滑步、摆臂与轮子运动 | 6 ride + 2 glide 个体帧与 6+2 车帧 |

每种身体同时提供 `pack` 和 `plain`，头部依然独立使用当前 Emoji/头像或原装 PNG，不烘焙进身体。

## Runtime 协议

已有 `transports[mode].layers`、`Vehicle Pack.layers` 保持兼容；每个对象可以**可选**声明：

```json
{
  "glide": {
    "frames": 2,
    "fps": 4,
    "layers": { "pack": ["..."], "plain": ["..."] }
  }
}
```

Vehicle Pack 的 `glide.layers` 为 `back` / `front`。运行时在 `.rider.is-coasting` 时使用 glide；否则使用 ride。切换时从新状态的首帧开始，`prefers-reduced-motion` 下固定第 0 帧。没有声明 glide 的第三方包继续按原序列运行。

服务端检验动画帧、透明 RGBA PNG、路径、安全白名单及总资产预算。自定义 Rider/Vehicle Pack 不需要升级 schema，也不需要改前端硬编码。

## 素材再生成

脚本 `scripts/export-legacy-transport-motion.mjs` **仅为素材制作工具**，依赖开发者自行安装的 Chromium 与 Playwright，并使用仓库保留的 `public/rider-runtime.js` 原始姿态。脚本启动一次本地 HTTP，只为截图暂时注入手动 ticker；**不修改或打包到生产页面**，产物是本仓库素材目录中的透明 PNG。

示例（在准备了 Playwright 的开发机器运行）：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_PATH=/absolute/path/to/chrome \
node scripts/export-legacy-transport-motion.mjs
npm run riders:validate
npm test
```

生成后**必须人工比较**姿势节奏、小尺寸轮子/手/脚与 old #80 设计文档和动态预览；不要以“图片加载成功”代替动作验收。工具仅用于当前旧通勤客素材的再生成，未来高质量替代素材仍应由人物/载具包的作者提供。
