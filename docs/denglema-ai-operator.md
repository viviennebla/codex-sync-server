# 蹬了吗 · AI Operator / 虚拟运营 Admin 设计

> 状态：Design
>
> 目标：给「蹬了吗」增加一个由 AI 承担的虚拟运营角色。它不对应某个真人管理员账号，而是通过受限、可审计的运营 API 负责轻量内容运营。

---

## 1. 为什么需要 AI Operator

「蹬了吗」已经逐渐具备社交产品的形态：

- 24h Event Feed；
- 用户留言与人物气泡；
- Release announcement；
- 成就与趣味称号；
- 多交通工具 / 人物动作；
- usage / reset / 节奏等可公开展示的聚合数据。

继续把每一条运营动作都写死在源码里，会出现两个问题：

1. **运营动作和代码发布耦合**  
   例如只是发一条公告，也要改常量、提 PR、merge、deploy。

2. **缺少持续的“产品人格”**  
   页面虽然有数据和人物，但没有一个长期存在的运营角色主动总结、吐槽、解释更新或参与互动。

因此引入一个虚拟角色：

```
Denglema AI Operator
```

它不是“给某个人 admin 权限”，而是一个系统级 actor，由 AI Agent 在明确权限范围内调用运营接口。

第一使用者可以是 ChatGPT，也可以在未来替换成其他 Agent。

---

## 2. 产品定位

AI Operator 更像：

```
吉祥物
+
社区运营
+
轻量主持人
+
产品内置 AI
```

而不是：

```
系统管理员
数据库管理员
绩效分析器
自动开发 Agent
```

它负责让「蹬了吗」更自然、更好玩，而不是管理用户。

建议产品名可以继续使用中性系统身份：

- 蹬了吗 AI
- AI Operator
- 蹬仔（如果后续需要人格化）

内部 actor id 建议固定：

```
ai_operator
```

不要把它伪装成普通用户，也不要使用某个真人 user_id。

---

## 3. 身份模型

事件系统当前主要区分：

```
user event
system / release event
```

未来建议增加显式 actor：

```json
{
  "actor": {
    "type": "ai_operator",
    "id": "ai_operator",
    "display_name": "蹬了吗 AI",
    "avatar_emoji": "🤖"
  }
}
```

普通用户仍然是：

```
actor.type = user
```

系统自动事件可以是：

```
actor.type = system
```

这样前端不需要假装 AI 是一个真实 rider。

AI Operator 可以出现在 Event Feed 或聊天区域，但默认不需要出现在赛道人物列表。

---

## 4. v1 能力范围

### 4.1 发布运营公告

AI 可以通过 API 发布：

- 新功能公告；
- 临时通知；
- 使用提示；
- 活动说明；
- 服务恢复通知；
- 有趣但低干扰的站内消息。

示例：

```
💬 蹬了吗更新 · 支持在线 24h 留言和更多交通工具
```

公告仍然遵守 Event Feed 的轻量规则：

- 默认 TTL 24h；
- 可以带 emoji；
- 可以带站内 href；
- 支持 idempotency key；
- 不因服务重启重复发布。

### 4.2 每周锐评

AI 每周可以基于**允许公开展示的聚合数据**生成一条「本周锐评」。

例如：

```
🤖 本周锐评

有人稳定巡航，有人的 burn-rate 像心电图。
轮滑派开始增多，但古法通勤依然拒绝科技进步。
本周最忙的不是某个人，是模型切换按钮。
```

“锐评”必须是趣味内容，不是绩效评价。

允许依据：

- 公开榜单数据；
- 聚合 token usage；
- model / project 聚合；
- 成就；
- transport 分布；
- 公开留言数量；
- 工作节奏类聚合；
- reset 状态；
- Event Feed 中本来就公开的事件。

禁止依据：

- Prompt；
- 对话正文；
- 源代码；
- Tool input/output；
- 完整路径；
- 私有 thread；
- installation token；
- 用户未公开的个人信息。

### 4.3 轻量社区互动

AI 可以发布：

- 欢迎新功能；
- 节日 / 周五梗；
- 对全站公开事件的轻量回应；
- 对用户明确 @AI 的公开留言进行回复。

默认不要自动回复所有用户留言。

建议只有以下条件之一满足才回复：

```
用户显式 @AI
或
系统主动发起一个公开话题
或
固定低频运营任务
```

避免把 24h Event Feed 变成 AI 刷屏。

---

## 5. 后续能力

### Phase 2：每周栏目

可以形成固定栏目：

- 本周锐评；
- 本周奇怪成就；
- 本周交通工具观察；
- 本周模型迁徙；
- reset 周报；
- “本周发生了什么”。

这些栏目可以通过 scheduler 定期触发 AI Operator。

### Phase 3：站内聊天机器人

未来可以增加：

```
用户
  ↓
@蹬了吗 AI
  ↓
AI Operator
  ↓
公开 reply / thread
```

适合回答：

- “这个成就是怎么拿到的？”
- “为什么我今天没有匀速巡航？”
- “怎么换成冲浪？”
- “自动上传怎么打开？”
- “今天 reset 了吗？”

聊天机器人应优先回答产品内信息，不默认变成通用 ChatGPT。

### Phase 4：主动运营

在低频、可控的情况下，AI 可以主动：

- 发现新功能上线后发公告；
- 每周生成一次锐评；
- 在 reset completed 后发一句趣味通知；
- 当赛道长期过于安静时偶尔发一句环境对白。

不做高频主动推送。

---

## 6. Operator API

建议不要继续让运营公告依赖源码常量。

### 6.1 发布公告

```
POST /api/operator/announcements
```

请求：

```json
{
  "idempotency_key": "web-social-transports-2026-09",
  "message": "蹬了吗更新 · 支持在线 24h 留言和更多交通工具",
  "emoji": "💬",
  "href": "/plugin#web-social-transports",
  "ttl_hours": 24
}
```

返回：

```json
{
  "ok": true,
  "event_id": "evt_xxx",
  "published_at": "2026-09-30T08:00:00Z"
}
```

同一个 `idempotency_key` 再次调用应返回已有发布结果，而不是重复创建。

### 6.2 发布 AI 内容

```
POST /api/operator/posts
```

用途：

- weekly commentary；
- 轻量运营内容；
- AI 主动话题。

请求建议：

```json
{
  "kind": "weekly_commentary",
  "idempotency_key": "weekly-commentary-2026-W40",
  "message": "本周锐评……",
  "emoji": "🤖",
  "ttl_hours": 48
}
```

### 6.3 获取运营上下文

```
GET /api/operator/context?window=7d
```

返回**已经过隐私边界过滤**的数据，而不是让 AI 直接读 state 文件。

例如：

```json
{
  "window": "7d",
  "rider_count": 12,
  "active_days": 5,
  "transport_distribution": {},
  "model_distribution": {},
  "project_distribution": {},
  "achievement_events": [],
  "public_comments": [],
  "reset_summary": {}
}
```

服务端负责决定哪些字段允许作为运营上下文。

### 6.4 审计

```
GET /api/operator/audit
```

每次写操作记录：

```json
{
  "action_id": "op_xxx",
  "actor": "ai_operator",
  "action": "publish_announcement",
  "idempotency_key": "web-social-transports-2026-09",
  "created_at": "..."
}
```

公开内容本身可以记录在 audit 中；凭据不能记录。

---

## 7. 认证方式

AI Operator 不应复用普通 Web Session。

建议独立认证：

```
Authorization: Bearer <operator token>
```

服务端配置：

```
DENGLEMA_OPERATOR_TOKEN
```

这个 token：

- 只允许调用 `/api/operator/*`；
- 不等价于服务器 shell；
- 不等价于 GitHub 写权限；
- 不允许访问 installation token；
- 不允许写 usage；
- 不允许修改用户身份。

未来如果 ChatGPT / Agent Connector 有服务身份，可以再替换静态 token。

---

## 8. 权限边界

### AI Operator 可以

```
发布 / 撤下自己的运营内容
生成每周锐评
读取公开或安全聚合上下文
回复公开 @AI 留言
查看自己的 audit
```

### AI Operator 不可以

```
修改 token usage
修改用户成就结果
修改 leaderboard 数据
修改用户头像 / transport
删除用户
查看凭据
查看 Prompt / 代码 / Tool 内容
直接修改生产数据库
部署代码
merge PR
操作服务器 shell
```

代码开发 Agent 和 AI Operator 必须视为两个不同 capability。

即使同一个 ChatGPT 实例可以同时连接 GitHub 和 Operator API，也不应该因为“它都是 AI”就合并权限模型。

---

## 9. 每周锐评规则

锐评应遵循：

### 可以

- 调侃整体趋势；
- 描述模型 / transport / 成就的有趣变化；
- 使用匿名化或公开昵称；
- 对公开事件做轻松总结；
- 使用“心电图骑手”“古法通勤”等产品自己的梗。

### 不可以

- “谁工作最努力”；
- “谁效率最高”；
- “谁产出最低”；
- 根据 token 推断工作质量；
- 用夜间 / 周末 usage 表扬加班；
- 对个人做羞辱性评价；
- 推断用户真实工作内容。

推荐口吻：

```
荒诞
轻松
短
有梗
不端着
```

而不是：

```
绩效总结
管理评价
周报点评
KPI 排名
```

---

## 10. 自动化模型

AI Operator 可以由 scheduler 唤起：

```
每周五 17:30
      ↓
GET /api/operator/context?window=7d
      ↓
生成本周锐评
      ↓
POST /api/operator/posts
      ↓
写 audit
```

公告则可以由人或 Agent 显式触发：

```
“发一个更新公告：支持 24h 留言和更多交通工具”
      ↓
AI 组织短文案
      ↓
POST /api/operator/announcements
```

这里不需要为“发公告”创建 Git commit。

---

## 11. 与现有 Release Announcement 的关系

当前 `DENGLEMA_RELEASE_ANNOUNCEMENTS` 仍然有价值，但用途应收窄为：

```
代码版本强绑定公告
```

例如：

- 一次数据迁移必须告知用户；
- 某 Plugin 版本上线时必须伴随固定公告；
- 某项功能第一次部署时需要 guaranteed announcement。

普通运营公告应该改走 Operator API。

长期可以形成：

```
Code-bound announcement
    → source-controlled
    → 随版本发布

AI / Ops announcement
    → runtime API
    → 不需要 PR
```

---

## 12. UI 表现

AI Operator 的内容建议有稳定标识：

```
🤖 蹬了吗 AI
```

但不要占用正常 rider 的人物位置。

Event Feed：

```
🤖 蹬了吗 AI
本周锐评：……
```

如果未来增加聊天，可以显示独立的小机器人头像。

AI 内容应该和：

- 用户 comment；
- release；
- achievement；
- system event

在视觉上可区分。

---

## 13. 失败与降级

AI Operator 是增强能力，不应影响主站。

如果：

- AI 不可用；
- Operator API token 失效；
- scheduler 失败；
- 内容生成失败；

则：

```
赛道继续正常运行
usage 上传继续正常
Event Feed 继续正常
只是没有新的 AI 运营内容
```

不要让 AI Operator 成为主站启动依赖。

---

## 14. 推荐实施顺序

### A1 — Operator 基础设施

实现：

- `DENGLEMA_OPERATOR_TOKEN`
- `POST /api/operator/announcements`
- idempotency
- audit log
- 24h TTL
- 最小测试

完成后，普通公告不再需要 PR。

### A2 — AI Context + Weekly Commentary

实现：

- `GET /api/operator/context?window=7d`
- `POST /api/operator/posts`
- weekly commentary event kind
- 每周锐评 prompt / 内容规则
- scheduler

### A3 — @AI

实现：

- 公开留言中 @AI detection；
- bounded conversation context；
- AI reply；
- rate limit；
- anti-spam。

### A4 — 内置机器人

如果 @AI 使用频率足够高，再考虑：

- 独立 bot panel；
- thread；
- FAQ / product help；
- 更完整 conversation UX。

不要一开始就做完整聊天系统。

---

## 15. 验收原则

A1 至少验证：

- 未授权请求返回 401/403；
- operator token 不能调用普通敏感内部接口；
- 相同 idempotency key 不重复发公告；
- 公告进入 Event Feed；
- TTL 后自然消失；
- 服务重启不会重复；
- audit 有记录；
- 不泄漏 operator token。

A2 至少验证：

- context 不包含 Prompt / code / full path；
- 锐评生成失败不影响主站；
- 每周任务幂等；
- 不产生“生产力评分”。

---

## 16. 最终原则

AI Operator 的价值不是“替代一个管理员”。

更准确的关系是：

```
人定义产品边界
        ↓
代码定义权限
        ↓
AI 在边界内持续运营
```

它应该让「蹬了吗」看起来像一个**自己会活着、会说话的小产品**。

而不是让 AI 获得一个无边界的超级管理员账号。
