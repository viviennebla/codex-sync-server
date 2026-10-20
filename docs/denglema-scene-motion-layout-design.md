# 蹬了吗 · 场景空间、人物动画与气泡避让设计（v1）

> **状态：设计方案，未实现。** 本文针对万圣节像素背景与后续季节主题；人物与交通工具 Sprite 美术由另一个 Session 负责。本方案只定义空间定位、动态占位、动作播放、气泡排布与验收合同。
>
> 代码基线：2026-10-20 合并 PR #72 后的 `main`。本文中的 scene 坐标与可站立区域**需要基于最终美术实测**，不把示意数值当成已标注的素材事实。

## 1. 目标与非目标

**目标**
- 背景定义可站立的空间：基于素材坐标提供两条真实道路的可走/可站区域与脚底基准点，人物只负责造型、动作及自己的可视足迹。
- 保留原来的 **4 条逻辑车道 → 2 条视觉道路** 映射：逻辑 1/2 → 上路，3/4 → 下路；普通 `?season=off` 仍为原四车道。**禁止改成三条道路。**
- 人物大小由背景尺度、可用宽度和素材规格共同确定，不再叠加随机放大；位置具有稳定性、可拖动性和不遮挡主要 UI 的边界。
- 留言气泡与人物脱钩，由统一的 Overlay/Layout 层决定朝向和避让，保留最新留言、自动展示、点选置顶和 7s 自动消失的现有语义。
- 独立动作系统能接入后续 Sprite Sheet，不要求现在制作/替换美术；尽量保留现有 DOM、行为调度器和六种交通方式。
- 不让 token、排名成为人物尺寸或动作高级程度的依据。

**非目标**
- 不制作人物/交通工具像素素材，不改上传、账户、数据库和 server Usage 协议。
- 不重写 `MOTION_ACTIONS` 的玩法规则，不引入 PixiJS、Canvas 游戏引擎或重型物理模拟。
- 本文不直接改 `public/app.js`、`public/styles.css` 或 `public/themes/halloween/manifest.json`，避免与美术 Session 冲突。

## 2. 现有实现：经代码确认

- `public/app.js`：`lanePlan()` 将手动位置的 1/2 映射成可见 DOM lane 1、3/4 映射成 3；`seasonalTrackLanes` 在万圣节仅有 `[1,3]`，**行为正确**。用户跨路拖动由持久 `.race-stage` 接管 pointer capture，这是应保留的修复。
- `positionPlan()`：可用 X 区间 `22–78%`，`OFFICE_HARD_GAP=7.5`；自动位置是稳定 hash + 随机化间距 + jitter，缺少背景几何、实际屏幕尺寸与人物可见边界校验。`scheduleAmbientDrift()` 还能改动 left 值。
- `renderRiders()`：每个新人物写入 `--scale=1.06 + (hash % 5)*0.035`，而 `.rider-inner` 又 `scale(1.13)`；全局 CSS 还有后续覆盖的 166×136 人物轮廓。当前叠加效果不以背景为基准。
- `riderMarkup()` 在人物内部生成 `.rider-message-bubble`。CSS 设置 `max-width:220px`，只通过 `is-near-right` 翻转左右；`showRiderMessage()` 管理置顶/定时，但无全局气泡避让。
- 背景和 glow 在 `.app-shell` 中按同一 `center / cover` 渲染，`.season-layer-host` 与 `.app-shell::before` 对齐，桌面顶端避开 82px、窄窗 72px。`.race-stage` 是另一个 DOM 坐标空间，**不能直接将场景图片 y 百分比当成 stage y 百分比**。
- `MOTION_ACTIONS`、`chooseMotion()`、`triggerMotion()`、`activeMotion` 已分离动作选择与 CSS 动画触发；这层保留。当前 `reduced-motion` 已有降级。

## 3. 空间模型：Scene Geometry 为单一真相

### 3.1 独立场景几何合同

新增（**建议文件**，需实际美术标注后才可启用）：
`public/themes/halloween/scene-geometry.json`，与素材 Manifest **绑定版本**，但不修改美术 Session 管理的素材 Manifest。

概念结构（示意，无虚构坐标）：

```js
{
  schemaVersion: 1,
  artManifestId: "halloween-office-2026-v5-user-art",
  canvas: { width: 2048, height: 768 },
  roads: [
    {
      id: "upper",
      logicalLanes: [1, 2],
      walkablePolygon: [/* 由实际底图实测的 x,y 顶点 */],
      footPath: [/* 按 x 排序的中心/落脚线采样点 */],
      exclusions: [/* 不可站立的前景障碍区域，可为空 */]
    },
    {
      id: "lower",
      logicalLanes: [3, 4],
      walkablePolygon: [/* ... */],
      footPath: [/* ... */],
      exclusions: [/* ... */]
    }
  ]
}
```

- 单位是 **2048×768 原始母图坐标**，不是 viewport px、stage 百分比，也不是 3840 导出图像坐标。
- `footPath` 给角色**脚底锚点**（不是头顶或 DOM 左上角），`walkablePolygon` 决定可选中心点/路幅，`exclusions` 为固定不可进入区域。
- 场景几何需根据美术标注和实际合成截图确认；**不能用固定 52%/71% 的 DOM 车道高度冒充道路几何**。
- 字段要能在未来复用另一节日背景；新美术若调整视角/构图必须同步升级绑定 ID，错配时拒绝使用过期 geometry 并退回当前布局，而不是让人站在屋顶上。
- 必须向素材 Session 收集：道路轮廓、脚底中心线、遮挡/可见边界、画面聚焦区；提供独立标注文件即可，不要求修改/重画其 Sprite。

### 3.2 Cover 变换与投影

用背景层实际可视容器的 `getBoundingClientRect()`（推荐 `.season-layer-host`）为唯一基准，保证基础图和人物投影使用**相同裁切**。若其宽高为 `W,H`，原画 `Iw=2048, Ih=768`：

```text
s = max(W / Iw, H / Ih)
offsetX = (W - Iw * s) / 2
offsetY = (H - Ih * s) / 2

clientX = sceneRect.left + offsetX + artX * s
clientY = sceneRect.top  + offsetY + artY * s

artX = (clientX - sceneRect.left - offsetX) / s
artY = (clientY - sceneRect.top  - offsetY) / s
```

最后再转换成 `.race-stage` 局部坐标以摆放 Rider。不能让 `background-position:cover` 和 Rider 使用不同的缩放/裁切。应实测 DOM rect，避免把桌面 82px/窄窗 72px 硬编码两遍。

- 桌面、窄屏、DPR 变动仅改变投影，不改变逻辑道路和母图坐标。
- 视口裁切后先计算 **道路在屏幕中可见的交集**；避免任何角色落在裁掉的画面之外。
- Stage 点击/拖动反向投影到 scene，只有 walkable + stage 有效区域中最近的合法落脚点才能接受。经过两条道路间区域时显示最近合法落点/暂不移动，松手不能保存到不可站立区域。
- 若特窄屏导致一条道路完全不可见，先验证背景的 cover/focus 策略；不能为了填屏创造第三条道路。

### 3.3 逻辑车道与持久化兼容

显式区分：
- `logicalLane`: 后端 `office_position.lane`，取 1–4，旧数据保留；
- `visualRoad`: 上/下两个道路之一；映射是 `[1,2]→upper`, `[3,4]→lower`；
- `sceneFoot`: 临时 `{x,y}` 落脚点（渲染坐标，不加后端字段）；
- `renderRect`: 屏幕人物可视/碰撞矩形。

读入现有 `office_position.x` 时，保留其 0–100 约定，将其作为**期望横向比例**投射到可见 road 候选位置；受裁切与避让调整的仅是**呈现位置**，不能静默回写。正式拖动保存时再把 sceneX 反算成当前后端接受的 x 百分比，保持 `PUT /api/me/office-position {lane,x,expected_layout_version}` 不变。

同一道路内拖动尽量保留原逻辑 lane (1 或 2 / 3 或 4)；跨道路时使用新道路的 canonical lane（上路 1，下路 3），后端不引入 `visualRoad`。保留 `stage.setPointerCapture(pointerId)`，并保留 409 冲突重试提示与 rollback。

## 4. 人物占位：背景决定尺度，Renderer 决定外观

### 4.1 一个尺寸来源

取消 `renderRiders()` 的 hash 尺寸 jitter 和 `.rider-inner` 的第二级 1.13 放大（仅万圣节阶段先做，普通主题保持不变）。

建立单一 `--actor-scale`，根据：
1. 由 Sprite/现有 DOM 造型暴露的**脚底锚点、原始宽高与非透明视觉矩形**；
2. 人物在背景中与办公室物件/道路的视觉参照大小；
3. 实际可用舞台面积、用户缩放和人群密度；
4. 交通方式具体碰撞足迹（自行车宽、徒步窄）。

尺寸上限、下限、不同 transport 的相对尺寸必须通过**截图选定后配置**；不宣称当前存在经过美术验证的像素尺寸值。头像/名字可读性与点击热区独立于视觉缩放，移动端不能因缩小 Sprite 导致无法操作。视觉图层与热区分开：足迹决定避让，热区保证可用。

### 4.2 占位规划算法（确定性，低干扰）

1. 取得当前 viewport、场景可视道路多边形、前景遮挡、动态 UI 避让区（例如 event rail）。
2. 投影每个 road 的候选脚底位置。优先保留用户主动摆放的手动锚点；其次偏好上一次分配的可行位置；新用户按稳定 hash 排序。
3. 以**投影后的屏幕像素级碰撞足迹**（视觉主体 + 小幅余量）检测重叠，而不是固定百分比 `OFFICE_HARD_GAP`。允许预设轻量深度/纵向错位，但脚底必须留在道路边界中。
4. 用确定性评分选点：靠近期望 X、避开道路边缘/遮挡、避免人物穿插、与上次位置差最小。相同用户列表和 viewport 应复现布局，无持续随机洗牌。
5. 当人数超过可展示容量：不无限缩小、不把人物挤到人行道外，也不悄悄丢掉用户；使用路边可点击的 `+N riders` 聚合标记/列表作为**未来拥挤降级**，至少保留本人可见。聚合显示是 UI 方案，须单独验收后启用。

`scheduleAmbientDrift()` 在万圣节不能再任意 `left += delta`：只允许沿已标注脚底路径的短距离滑动，并在目标合法、目标碰撞可接受、没有正在拖动/正在展开 UI 时运行。布局更新不能每次刷新都把角色跳去新位置。

## 5. Motion Runtime：保留动作意图，更换视觉实现

**不改** `chooseMotion()` 的现有趣味策略、`MOTION_ACTIONS` 命名和 `activeMotion` 单动作互斥。新增薄 `MotionPresenter`：
- 输入 `{riderId, transport, action, startedAt, duration, reducedMotion}`；
- 输出渲染状态 `idle / moving / waving / sipping / stretching / yawning / coasting / sprinting / celebrating / bonking`；
- 两种 presenter：现有 CSS（普通主题/降级）与未来 PixelSprite（美术 Session 提供素材后）。场景空间布局器**完全不依赖 sprite 文件名**。
- 精灵资源合同由美术 Session 定义帧宽高、帧数、FPS、透明边界、角色脚底锚点、交通工具与动作对应关系；没有素材时绝不靠 CSS 拉扯像素角色冒充新帧。
- 像素动作用离散帧（CSS `steps()` 或轻量 frameIndex），位置插值和气泡布局可以平滑，但角色肢体不能无限连续拉伸。Glow 4.1s 呼吸灯保持独立，不需要强改逐帧。
- `prefers-reduced-motion`：保留位置、轮廓与静态状态，停帧与短动效；`document.hidden` 暂停高频更新，避免闲置浪费。
- 动作触发应及时通知 Overlay 锚点变化；不要让背景 layout 随手臂晃动而不停重新打乱所有人物。

## 6. 气泡 Layout：脱离每个人物内部

### 6.1 独立渲染宿主

在 `.app-shell`（必要时 fixed 级 Portal）创建**一个** `bubble-overlay`。气泡数据仍由现有 `showRiderMessage()/closeRiderMessage()`、`latestCommentByRider`、`pinnedMessageRiderId` 管理，视觉节点不再放入 `.rider`。人物提供可投影的 `head/face anchor` 与最新矩形，Overlay 只负责排布。

现有最新留言显示、单置顶、7 秒自动关闭、留言按钮与无障碍播报不应因为换 DOM 被删除。Overlay `pointer-events:none`；仍需交互的按钮继续留在 Rider，或者明确移至拥有 `pointer-events:auto` 的独立控件容器。气泡展示应避免压在事件栏/顶栏/登录层之上。

### 6.2 全局候选与优先级

每个气泡根据锚点生成多种候选（上左、上右、下左、下右；空间不足再考虑侧向）；动态测量真实文字宽高，最大宽度 `min(220px, viewportSafeWidth)` 是**约束而非固定占位**。统一选择一个全局可行排布：
- **硬约束**：视口安全边界、顶栏、event rail/交互按钮避让、其他已放置气泡重叠；
- **软目标**：距所属人物脸最近，尾巴准确指回原人，减少跨路覆盖与重新跳位；
- **优先级**：用户置顶 > 用户正在主动查看 > 自动新留言 > 动作趣味气泡；不让随机动作气泡压住留言。

当屏幕太窄，允许自动/低优先级气泡降级成小指示标记，点击仍能查看；禁止让气泡叠在一起或挤压人物坐标来给气泡腾位置。

`ResizeObserver` / resize / rider render / drag / message open-close / 场景转换后调度 layout；同一帧合并测量与写入，移动中仅对**活跃气泡**做节流位置更新。避免每个 rider 都装独立监听器，更不要为静态 100 人每帧扫描全部矩形。气泡重排不得反复更新文本或打断 `aria-live`。

## 7. 分阶段开发、文件所有权与停止线

| Phase | 我方变更 | 通过条件 |
| --- | --- | --- |
| A：场景几何 | 新 `public/scene-projection.js`、`public/scene-placement.js`、`public/themes/halloween/scene-geometry.json`（待美术标注）、纯逻辑测试 | 两道路有效落脚区在桌面/手机截图与背景贴合；4→2 映射不变 |
| B：位置与缩放 | 集成 `app.js` 位置计算与 drag，少量 `styles.css` / halloween CSS | 无双重缩放、无道路外落脚、手动位置稳定、跨路拖动 200/409 路径不退化 |
| C：气泡 Overlay | 新 `public/bubble-layout.js`、容器 CSS、`app.js` 留言逻辑接线 | 置顶、自动关闭、长中文、多人同屏和窄窗无重叠或遮挡 |
| D：Sprite 适配 | 新 `public/motion-presenter.js`，按美术 Session 提供的合同实现 | 现有动作调度保留、Sprite FPS/脚锚点正确、降级仍可用 |

**文件边界**：素材 Session 拥有 `public/themes/halloween/art/**`、角色 Sprite 素材/配置和其美术导出；我方拥有空间几何、位置与气泡算法及 MotionPresenter。跨会话唯一共享热点 `app.js` / `styles.css` 需要按顺序合 PR，不允许双方同时覆盖。美术 Manifest 的修改由素材 Session 完成，我方建议 geometry sidecar 避免争抢 Manifest。

**兼容停止线**：不迁移 `office_position` 存储、不改 `/api/me/office-position` 请求、不改普通四车道、不改 Usage 和用户身份、不改变 glow 与静态蝙蝠/猫的既定行为。

## 8. 验收矩阵

- 1440 宽桌面、375 窄屏、不同宽高比、DPR 1/2、窗口 resize：两条真实道路上脚底锚点始终合理，`center/cover` 裁切不导致偏移，舞台没有凭空生成第三条路。
- 1、2、6、20+ rider；极长昵称、0 token、大 token、六种 transport；位置稳定、场景可见、交互热区足够、拥挤时有明确策略。
- 先前保存逻辑 lane 1/2/3/4 的用户刷新后仍投影到对应两条路，`?season=off` 恢复四条独立车道；拖动跨路和保存失败回滚，且拖拽不会被气泡或 glow 拦截。
- 同时出现 2–8 个自动留言/动作气泡、220px 长句、昵称较长、右边缘人物、打开 event rail：无不可读重叠，置顶更高优先级，7s 逻辑/按钮/ARIA 不退化。
- `prefers-reduced-motion`、页面切后台、缓慢设备：静态图层与人物可见，布局无定时无限重排，动画不造成明显卡顿。
- Phase A–C 优先写纯函数测试（投影互逆、合法区域、排布无重叠、稳定 hash、优先级）；UI 每阶段实际桌面与窄窗截图人工视觉验收。

## 9. 与素材 Session 的最小接口

请素材 Session 仅返回以下**美术事实**（不需要改我们的逻辑文件）：
1. 最终使用的背景 Master 文件、2048×768 画布版本/编号；
2. 上/下两条道路在 Master 中的可站立多边形，以及人物脚底中心路径采样点；
3. 不可站立遮挡区和重要前景/UI 不应覆盖的区域；
4. 每种骑手/交通工具 Sprite 的原始宽高、透明可视边界、脚底锚点、帧布局/FPS、推荐在背景中呈现的大小参考。

在这些几何事实到手前，可以先实现独立的投影与气泡避让纯函数及其测试；**不要把猜测的道路坐标提交为正式生产参数**。
