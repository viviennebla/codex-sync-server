# Denglema Usage Contract

> Status: schema v2 · harness-agnostic

蹬了吗只定义“如何把一个 Agent Harness 的当天累计 usage 交给服务端”。它不要求数据来自 Codex。

Codex、Cursor、Claude Code 或其他 Agent Harness 都可以作为 adapter，只要最终产出同一份 cumulative daily sample。

## 架构边界

```text
Agent Harness
├─ Codex
├─ Cursor
├─ Claude Code
└─ Other
      │
      ▼
Harness Adapter
├─ 找到 harness 自己可用的 usage 数据源
├─ 只做聚合，不读取/上传对话正文或源代码
└─ 产出 Denglema schema v2
      │
      ▼
Denglema HTTP Protocol
      │
      ▼
Leaderboard / Profile / History
```

`codex-usage-dashboard` 中的 Denglema MCP 是 Codex 的默认 adapter，不是协议本身。

## 绑定

网页为当前 rider 生成一次性 pairing code。Adapter 用它换取 installation credential：

```http
POST /api/installations/pair
Content-Type: application/json

{
  "code": "ONE_TIME_CODE",
  "installation_name": "Cursor on laptop"
}
```

成功响应包含：

```json
{
  "installation_id": "inst_...",
  "user_id": "usr_...",
  "token": "opaque-installation-token",
  "timezone": "Asia/Shanghai"
}
```

`token` 只属于当前 installation。Adapter 应保存在本机私有状态中，不得展示给用户、写入 prompt、提交到仓库或上传到其他服务。

## schema v2

```json
{
  "schema_version": 2,
  "harness": "cursor",
  "date": "2026-09-29",
  "observed_at": "2026-09-29T07:00:00.000Z",
  "total_tokens": 123456,
  "models": [
    { "name": "gpt-5.6-sol", "total_tokens": 100000 }
  ],
  "projects": [
    { "name": "vimo-flow", "total_tokens": 80000 }
  ]
}
```

字段：

| 字段 | 必需 | 语义 |
| --- | --- | --- |
| `schema_version` | 是 | 当前为 `2` |
| `harness` | 否 | adapter 来源，例如 `codex`、`cursor`、`claude-code` |
| `date` | 是 | leaderboard 本地日期，`YYYY-MM-DD` |
| `observed_at` | 是 | 本次采集时间，ISO-8601 |
| `total_tokens` | 是 | 当前 installation 在该日期的**累计** token |
| `models` | 是 | model-name → cumulative token；无明细可传 `[]` |
| `projects` | 是 | workspace basename → cumulative token；无明细可传 `[]` |

`harness` 是短标识，不得包含用户身份、路径或设备秘密。

## 上传

```http
POST /api/usage/sample
Authorization: Bearer <installation-token>
Content-Type: application/json
```

服务端按 installation + date 保存累计值，并对重复上传取 monotonic max。因此 adapter 可以安全重复上传同一天的最新累计快照。

如果 harness 自己的累计值暂时回退，服务端不会把已经接受的更高总量回滚。

## Adapter 规则

Adapter 必须：

1. 优先使用当前 harness 自己提供的 usage API、日志或状态文件。
2. 统计“当前日期累计值”，而不是只统计当前会话。
3. `projects[].name` 只使用 workspace basename，不上传完整路径。
4. 不为了填满 breakdown 而猜测 model/project；未知时传空数组。
5. 上传前验证数值为非负整数。
6. 普通“上传蹬了吗”应复用最新快照；只有明确要求 fresh refresh 时才重新扫描重数据源。

Adapter 不得上传：

- prompt / assistant message
- tool 输入输出正文
- 源代码
- 完整项目路径
- thread / chat title
- transcript
- installation token

## Harness 示例

- **Codex**：`codex-usage-dashboard` 的 MCP / JSONL adapter。
- **Cursor**：使用 Cursor 当前可访问的 usage 数据，聚合后发同一 schema v2。
- **Claude Code**：使用 Claude usage/log 数据，聚合后发同一 schema v2。
- **Other**：只要能得到可信的 cumulative token 数据，就可以实现 adapter。

服务端不根据 harness 类型改变排行榜语义。Harness 只负责“怎么拿到数据”，蹬了吗只负责“怎么接收和展示数据”。
