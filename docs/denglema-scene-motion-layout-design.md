# 蹬了吗 · 双布局、人物位置与气泡动画方案（v2）

> 状态：设计，尚未修改运行时代码。**本版替代 v1 中过度设计的 walkablePolygon / footPath / scene-geometry.json 提案。** 2026-10-20 按用户澄清：普通四车道与万圣节双道路是**两套展示布局**；不新增道路或可站立位置。人物 Sprite 素材由独立 Session 负责。

## 1. 两套布局，不是三条路

| 项 | 普通模式 | 万圣节模式 |
| --- | --- | --- |
| Layout ID | `office-four-lane` | `halloween-two-road` |
| 视觉空间 | 原 `.race-stage` 四条 `#lane1…#lane4` | 万圣节背景中上、下两条道路 |
| 可见承载 DOM | 四条 lane | `#lane1`（上路）、`#lane3`（下路），`#lane2/#lane4` 隐藏 |
| 历史逻辑位置 | 1、2、3、4 各自显示 | 1/2 → 上路，3/4 → 下路 |
| 定位算法 | 基于原四车道的可用矩形 | 基于现有两条 lane 的屏幕矩形与背景校准 |
| 动作/气泡 | 共用 Motion 与 Bubble | 共用 Motion 与 Bubble |

当前 `app.js` 的 `lanePlan()` / `seasonalTrackLanes` 已实现万圣节 4→2 投影，**保留**。不将两条道路变成三条，也不向办公室、马路外新增站位。普通 `?season=off` 继续显示四条。

注意：「两套展示布局」不等于已存在「两套独立保存的手动坐标」。现有 API 只保存一组 `office_position {lane,x}`。本阶段两个布局通过同一已有数据各自投影；若以后要求普通/万圣节各自记住一次拖动位置，需要另立独立持久化需求，不能暗中修改接口或覆盖历史含义。

## 2. 从当前页面取得道路区域，不新造空间描述文件

### 已有可信布局

当前 `public/halloween-theme.css`：

```css
body.season-halloween #lane1 { top: 52%; height: 16%; }
body.season-halloween #lane3 { top: 71%; height: 16%; }
body.season-halloween #lane2,
body.season-halloween #lane4 { display: none; }
```

这就是**当前前端正在使用**的上/下道路布局区间。运行时直接读：

```js
const upperRoadRect = document.querySelector("#lane1").getBoundingClientRect();
const lowerRoadRect = document.querySelector("#lane3").getBoundingClientRect();
const stageRect = document.querySelector(".race-stage").getBoundingClientRect();
```

普通模式则直接读四个 lane 的矩形。以当前 DOM 的可见边界做横向和纵向约束，统一将人物脚底点落到对应道路，而不是另存一套人工推测的多边形。

**关键限制**：52%/71% 是 CSS 设计区间，并不自动证明其与背景美术的「实际像素道路边缘」完全重合。背景采用 `.app-shell::before` 的 `center / cover`，舞台又处于不同的 grid 区域；若截图发现脚底偏上/偏下，应依据**当前实际截图**校准这两条 lane 的 `top/height` 或简单 foot baseline 常量。无需请另一 Session 重新标记 polygon，更不能让 `.race-stage` 百分比冒充背景原图百分比。

推荐抽象一个 `LayoutAdapter`：
- `getVisualLanes(stage)`：返回当前模式下 4 或 2 个可见 DOM lane 的 `rect`；
- `resolveVisualLane(logicalLane)`：普通模式 1→1 等，万圣节 1/2→1、3/4→3；
- `getFootBaseline(laneRect, transport)`：从 lane 矩形计算屏幕脚底线，可通过视觉验收微调；
- `toPersistentPosition(footPoint)`：拖动后转换到现有的 `{lane,x}`；
- `getUIExclusions()`：事件栏和必须保护的交互区域；不改变背景自身素材。

无需生成新的「可站立点列表」或新增可站立区类型：候选点始终在已有 lane 范围内连续选择。

## 3. 人物位置与尺寸：用真实占位取代随机缩放和百分比硬间距

目前 `positionPlan()` 在 `OFFICE_X_MIN=22` / `OFFICE_X_MAX=78` 之间排人，使用 `OFFICE_HARD_GAP=7.5` 和 hash 间距；新人物写入 `--scale=1.06 + 0.035*(hash%5)`，内部仍有 `.rider-inner { transform:scale(1.13) }`，显得偏大。

### 新位置算法

1. 获取本模式可见 lane 矩形、真实舞台宽度、人物（或未来 Sprite）的视觉边界与脚底锚点，换算每人屏幕宽高和安全占位。
2. 原有手动 `office_position.x` 作为优先目标 X，其他人物沿用稳定 hash 的偏好；**不要每次重绘改变人群顺序**。
3. 在 lane 的**可用横向范围**中布置人物，使用人物的屏幕像素宽度、交通工具占位和实际间隔判断碰撞。允许沿现有路面小幅横移以避让，但脚底不能脱离道路的合法矩形。
4. 密集时最先压缩空白间距，之后启用明确的聚合/列表降级；不靠随机减小个别人物或丢掉用户来维持空间。
5. 现有 `scheduleAmbientDrift()` 改成只在当前 lane 范围内、碰撞检查通过时允许轻微漂移；拖动/悬停/打开留言期间暂停，避免持续自动洗牌。

### 自动移动规则（不能在布局重构时丢掉）

**当前行为（源码 `public/app.js`）：**

- `scheduleAmbientDrift()` 每 **4200ms** 遍历可见骑手；每次尝试的 `drift` 增量为 **-0.7～+0.7 个 X 百分点**，累积偏移限制在原基准 X **±2.2 个百分点**，最终 X 被裁剪到 **22%～78%**。
- 对于**正在执行动作**（`activeMotion`）和**正在被拖动**的骑手跳过漂移；同车道与其他骑手的 X 距离不足 `OFFICE_HARD_GAP=7.5` 时不移动。这是**暂时的显示位置漂移**，不调用保存 API、也不主动跨车道。
- `.rider` 的 `left` 变化使用 **6.4s transition**。由于漂移循环短于过渡时间，连续目标可能造成长时间缓慢移动；旧百分比碰撞检查也未充分反映人物当前实际屏幕占位。
- `scheduleDirector()` 每约 **2.6～5.2 秒**挑选一个行为；若两名同可见 lane 骑手在记录 X 上相距不超过 22 个百分点，最多约 34% 的轮次会优先尝试双人 `wave`。这里的 `sprint`、`coast`、`wheelie` 等主要是人物内部动作，不是保存的真实位置移动。
- `startRaceRuntime()` 在页面隐藏时不运行定时器；显示期间每 **20s**刷新骑手/事件。当前留言置顶、hover 并不是漂移的直接暂停条件；这是**新增设计要求**，不是现状。

**新设计：保留活力，但让空间布局拥有最终决定权。**

1. **初始位置 / 手动位置优先**：LayoutAdapter 产出脚底目标点，手动保存位置为锚点。自动漂移只能改变临时视觉位置，不回写 `office_position`，不能为了动画把用户挪到另一条道路。
2. **两种布局、同一行为调度**：普通四车道内漂移只留在原 lane；万圣节只沿上/下可见 road 的当前 lane 矩形漂移，绝不增加第三条道路。切换布局后按该模式重新计算合法目标并清掉过期的临时偏移。
3. **以视觉占位检查合法移动**：由 actor 碰撞矩形和道路屏幕边界确定最大漂移距离和与邻人的安全间隙；取代简单 `±2.2% / 7.5%` 硬编码。移动前后及过渡途中的占位尽量不穿插；目标不合法就静止，**不要强行挤压其他人**。
4. **降低持续运动感**：保留轻量、偶发的随机移动，但不要求每轮都移动；对同一个 Rider 等前次过渡完成或冷却后再产生新目标，避免 4.2s 刷新追着 6.4s transition 跑。休息/社交的停顿本身也是表现的一部分。
5. **动作、气泡与拖动的优先级**：用户拖动/主动查看/置顶留言优先；之后是动作播放；最后是无交互时的 ambient drift。漂移时 bubble overlay 只追踪其 Rider 锚点，不反过来驱动人物变换位置。
6. **确定性与性能**：静态布局取稳定 hash，不因为网络刷新无故重洗牌；短时漂移随机可以存在，但检查只针对相关道路内的人物。隐藏标签页、`prefers-reduced-motion` 时停漂移或保持静态落脚点。

**验收重点**：同一 Rider 刷新时不离开原路；自动漂移不跨上/下道路、不覆盖手动保存位置；运动中不穿过邻居；拖动立即夺取控制权；多人并排时可能保持静止而非不断抖动；动作、留言与移动互不抢占坐标。

### 新尺度算法

- 万圣节先去掉 hash 尺寸 jitter 和内部 1.13 二次放大，**使用唯一的场景尺寸变量**（如 `--actor-scale`）；普通四车道布局保留原风格直到独立验收。
- 最终值由人物/交通工具的实际原尺寸、道路高度、屏幕宽度与点击可用性确定，先验收截图再配置；不要未经视觉验证硬写「统一缩放 0.8」。
- **逻辑碰撞矩形、视觉 Sprite 尺寸、点击热区可以不同**。小人物在手机上仍需要可点、可拖。
- 所有 token/leader/配额状态与物理大小解耦。

### 拖动不回归

保留 `stage.setPointerCapture(pointerId)`（跨 lane 换 DOM 后仍能拖动）、409 乐观冲突回滚、用户身份校验。pointer X/Y 转为相应布局的 lane 候选脚底位置，拖到两条道路之间或不可用 UI 时不保存非法值；`PUT /api/me/office-position` 不变。

## 4. Bubble Overlay：从人物尺寸与坐标中独立出来

现有 `.rider-message-bubble` 位于 rider DOM 内，最大 `220px` 且只靠 `is-near-right` 翻转。新建全局 `bubble-overlay`（相对舞台/页面统一测量），人物仅提供屏幕 head anchor；气泡不参与人物占位计算。

- 为每条显示中的留言测量**实际文字宽高**，在上右、上左、下右、下左等候选位置排布，统一避开顶栏、event rail、边缘、其他气泡。
- 优先级：手动置顶/主动查看 > 自动最新留言 > 趣味动作；低优先级在窄屏无法容纳时可折叠为小提示，不遮盖高优先级内容。
- 保留 `latestCommentByRider`、`pinnedMessageRiderId`、`COMMENT_BUBBLE_MS=7000`、`aria-live` 与点击按钮既有语义。
- 用统一调度处理 resize、rider re-render、拖动、留言开关与窗口尺寸变化；一帧合并 DOM read/write，不在每个骑手上启动持续碰撞循环。
- 气泡不能挡住人物拖动，整体 overlay 默认 `pointer-events:none`；可交互元素单独处理。

## 5. Motion Presenter：独立于场景和素材

保留 `MOTION_ACTIONS`、`chooseMotion()`、`triggerMotion()`、`activeMotion` 的动作选择与互斥语义。

新增薄的 `MotionPresenter`：`{riderId, transport, action, duration}` → 对应视觉动作。现有 CSS 为 fallback；像素 Sprite 素材到位后改用 frame-based / `steps()` 表现，保留脚底锚点稳定。南瓜光晕继续平滑 4.1s 呼吸，不必像素化。蝙蝠和猫仍保持静态。尊重 `prefers-reduced-motion`，不引入大型游戏引擎。

**美术 Session 只需提供** Sprite 的尺寸、脚底锚点、帧布局与推荐场景大小；不要求它标注道路多边形，也不同时修改位置/气泡算法。功能 PR 涉及 `app.js` / `styles.css` 时依次合并，避免双 Session 抢核心文件。

## 6. 实施顺序与验收

1. **Phase A · LayoutAdapter**：只抽象普通 4 lane / 万圣节 2 lane DOM 位置，验证现有坐标读取与屏幕映射，严格不增加站位。
2. **Phase B · Placement/Scale/Auto Drift**：用 lane 真实矩形、foot anchor 和人物可视宽高排布；保留轻量随机自动移动但加道路/占位/冷却约束；万圣节取消双重放大，普通主题维持原行为；drag+rollback 测试。
3. **Phase C · Bubble Overlay**：独立全局避让；验证 2–8 个同时显示、长中文 220px、事件栏、手动置顶、7 秒关闭与移动端。
4. **Phase D · Pixel Motion**：美术素材交付后接入逐帧，保留 CSS fallback，6 种交通方式逐步支持。

验收：桌面/375px；窗口 resize 与页面 cover 裁切；1/2/6/20+ Rider；四逻辑 lane 的已有用户正常映射；万圣节仅两条道路；`?season=off` 恢复四车道；跨车道拖动与 409 回滚；气泡不重叠且不挡交互；低动画偏好；无持续昂贵动画重排。

**本设计的停止线**：不新增道路或可站立区，不迁移 `office_position`，不改 Usage/身份/API，不改背景/Glow/猫蝙蝠素材；没有实际视觉截图前不声称像素级道路贴合已完成。
