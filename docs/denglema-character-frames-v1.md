# 蹬了吗 · Rider Pack 实装协议（代码合同 v2）

> 本文件不是让 Agent 自己猜“怎么切图”的说明，而是与 `src/rider-assets.js`、`scripts/rider-packs.mjs`、`public/rider-frame-runtime.js` 和 CI 对应的可执行素材合同。

## 用户 → Agent → 平台：当前已支持的流程

1. 用户提供自己制作且有权发布的透明 PNG 素材，指挥 Agent 制作一个 **Rider Pack 文件夹**。
2. Agent 在自己的开发环境执行 `npm run riders:import -- /绝对路径/my-character`。该命令复制角色包到仓库 `public/riders/frames/<id>/`，并自动登记 `public/riders/frames/manifest.json`。不用修改 `app.js`、`server.js` 或角色选择 UI。
3. Agent 执行 `npm run riders:validate`、`npm test`，并在独立预览页 `/rider-preview` 验收 PNG 动画与外观。
4. Agent 将资源+Manifest 提交至 feature 分支，发起 PR。**CI 会重新验证完整注册表和素材**；只有 review、视觉验收后才合并。
5. 合并 `main` 触发已有 GitHub Actions 部署。服务重启后扫描已发布 Manifest，`GET /api/rider-catalog` 自动返回新角色；`/me` 根据 API 自动加入下拉选项。用户选择后 `PUT /api/me/rider-appearance` 保存 ID，`GET /api/riders` 对外投影，首页 PNG Runtime 会加载对应人物。
6. 用户修改现有角色：直接在对应目录替换 PNG、更新同一个 Manifest（不必重复注册）→重新验证→PR→部署。已有用户继续引用同一个 preset ID；新的图片内容会生成不同 `asset_revision`，浏览器资源 URL 自动换版本，不依赖旧图缓存过期。

**不提供未经审核的公网任意文件上传接口**：用户使用 Agent 提交 GitHub PR；将来可以建设带身份和审核流程的上传界面，其发布目标仍应是同一套仓库素材注册表。

## Rider Pack 包结构

最小有效文件夹（可以没有背包、只有一个表情）：

```text
my-character/
  manifest.json
  heads/neutral.png
  walk/plain/00.png
  walk/plain/01.png
  ...
```

示例 `manifest.json`（此示例用 2 帧说明格式，正式建议 6–12 帧）：

```json
{
  "schema_version": 1,
  "id": "pixel-cat",
  "label": "像素猫猫",
  "description": "快乐下班的像素猫",
  "canvas": { "width": 128, "height": 100 },
  "heads": { "neutral": "heads/neutral.png" },
  "emoji_head": { "left_percent": 55, "top_percent": 16, "font_size_px": 39 },
  "fallback_transport": "walk",
  "transports": {
    "walk": {
      "frames": 2,
      "fps": 8,
      "head_offset": { "x": 0, "y": 0 },
      "layers": { "plain": ["walk/plain/00.png", "walk/plain/01.png"] }
    }
  }
}
```

**注意：** JSON 里的文件名全部是**相对于包目录**的路径；不允许绝对路径或 `..`。头部以整张透明 128×100 图层叠在人物主体上，不将头颅重复烘焙进主体帧。相同画布对齐，不需要关节、裁剪 UV 或运行时 SVG。

可选：
- `heads.happy/focused/tired`：缺省时沿用 neutral。
- `layers.pack`：有背包的身体帧序列；没提供时背包开关使用 plain（不会假装已经有背包）。
- `transports.bike/scooter/skateboard/surf/skate`：给每种真正制作了 PNG 的交通方式登记状态；未登记时明确退回 `fallback_transport` 的普通姿态，不显示假载具。
- `emoji_head`：可选的 Emoji 文本定位；Emoji **不是 SVG**，使用文字叠层。
- `head_offset`：某交通姿态上的头部像素偏移，避免复杂骨架运算。

## 多角色复用载具：可选独立 Vehicle Pack

身体帧与载具帧可以不烘焙到同一张 PNG。先把独立载具放入另一个包：

```text
my-vehicle/
  manifest.json
  back/00.png
  back/01.png
  front/00.png          # 可选，例如车把需盖在手前面
  front/01.png
```

```json
{
  "schema_version": 1,
  "id": "city-scooter",
  "label": "城市滑板车",
  "transport": "scooter",
  "canvas": { "width": 128, "height": 100 },
  "frames": 2,
  "fps": 8,
  "layers": {
    "back": ["back/00.png", "back/01.png"],
    "front": ["front/00.png", "front/01.png"]
  }
}
```

Agent 运行 `npm run vehicles:import -- /绝对路径/my-vehicle`，车辆将注册到根 Manifest 的 `vehicles` 字典中。角色对应交通动作再增加 `"vehicle_id": "city-scooter"`，服务端校验其已注册且类型为 scooter。

运行时按 `vehicle-back → body PNG → vehicle-front → head PNG/Emoji` 顺序合成；身体和车辆有**各自 FPS 与帧数**，但共享 128×100 原点及地面线。同一辆车可以被多个角色引用，角色须提供适配该载具的身体姿势帧。无 SVG、无骨骼计算。旧头盔通勤客的首批 bike 主体 PNG 目前已烘焙了车，因而不声明 vehicle_id；后续新美术可以逐步采用此组合模式。

## 校验与发布规则（由代码执行）

`npm run riders:validate` 会读取根注册表与所有已注册包，拒绝：
- 重复或错误注册、未知默认角色、损坏或缺失 Manifest、未经注册的 vehicle_id；
- 路径穿越、越界文件、符号链接，或不存在的素材；
- 非透明的 PNG / 损坏的图片 / 非 128×100 RGBA8 画布；
- 不合法 FPS/帧数、空序列、配置帧数与文件数不一致、资源过大；
- 用户选择未发布的 preset ID（由 `PUT /api/me/rider-appearance` 验证）。

CI 在 `npm test` 之前执行该校验。服务端只开放 Manifest 实际声明的 PNG 静态 URL，用户数据只保存可验证的 preset ID 以及头部、表情、背包选项。

## 动画作者约束

- 静态 PNG 的世界画布统一为 128×100，右向，透明；每帧画布必须完全相同，主体和车的原点需对齐。
- 逐帧绘制真实动作，建议 6–12 帧、6–12 FPS；不要靠 Agent 旋转肢体模拟好几个“不同帧”。
- `prefers-reduced-motion` 固定播放第 0 帧；页面隐藏暂停帧调度。
- 浏览器验收必须覆盖 `/rider-preview`、首页、375px、多人场景、头部切换及两种主题；CI 不能取代审美验收。
- 包含版权或许可不明确的素材不要直接合并到公共仓库。

## 代码所有权

- **导入和验证**：`scripts/rider-packs.mjs` + `src/rider-assets.js`
- **已发布目录**：`public/riders/frames/manifest.json` + 各自 `manifest.json`
- **运行时目录 API**：`GET /api/rider-catalog`
- **用户选择 API**：`PUT /api/me/rider-appearance`
- **场景挂载、动态换装、帧渲染**：`public/rider-frame-runtime.js`
- **前端角色选项自动生成**：`public/profile.js`
- **合并门禁**：`.github/workflows/ci.yml`

以后新增普通人物或载具，应**只修改素材仓库部分、注册表和文档**；不应该为每个新角色都修改服务器白名单、角色选择硬编码或渲染器。
