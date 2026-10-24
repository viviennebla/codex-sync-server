# Unified Usage Data Model — Public / Personal

状态：`design / proposed`，2026-10-19。**尚未实现新协议、数据存储或线上合并。**
数据合同归属 `codex-sync-server`；采集适配属于 `codex-usage-dashboard`；Run / Task 归因属于 `codex-workbench` / Board。

## 目标与边界

让蹬了吗与 Codex Family 作为**同一 Usage 服务的两个消费者**，共享采集事实，分开授权与展示。

~~~text
Harness logs / usage API
    ↓  Collector / Adapter（每台设备）
    ├─ Daily Cumulative Sample（已有 schema v2）
    └─ Session Usage Delta（仅支持事件采集的 Harness）
              ↓
       Unified Usage Server（目标）
       ├─ Public projection → Denglema leaderboard / rider
       └─ Personal projection → Codex Family Session / Run usage
~~~

“统一数据”指**统一的来源、身份、去重与查询责任**，不是强制只有一种原始记录格式。
**Daily 累计样本无法逆推出 Session 事件**；没有可信事件级数据时 Personal 显示 unavailable，不得猜。

## 当前事实（保留兼容）

| 已实现入口 / 存储 | 数据粒度 | 现状 |
| --- | --- | --- |
| `POST /api/usage/sample` | installation + local date 的累计 schema v2 | Denglema 使用；重复上传按累计最大值合并 |
| `STATE_DIR/denglema/usage/YYYY-MM-DD.json` | installation/day 归档 | Denglema 榜单与历史数据 |
| `codex-usage-dashboard POST /api/session-usage` | sessionId + [since, until] 的 delta events 聚合 | 本机查询，不是 Sync Server 现有接口 |
| `Workbench /api/runtime` | Board Run 的 threadId + 时间窗 | 只使用 Run 自身持久化的 threadId；缺数据返回 unknown |
| Family `:34777`、Denglema `:1600` | 两套独立部署 / STATE_DIR | 当前不是同一数据库，不能假定已经共享 |

旧版 schema v2、排行榜公开 API 和现有 Family 本机查询保持可用，不改变旧数据含义。

## 目标事实模型

`DailySample`（已有，兼容字段）：
`owner/rider`（服务端按 pairing 解析）、`installation_id`、`harness`、`date`（Denglema 产品时区）、`observed_at`、`total_tokens`、`models[]`、`projects[]`、可选 `usage_limits`。
**不得**从该快照伪造 `sessionId`、时间戳事件或 Token 分类。

`SessionDelta`（新增私有事实，**建议字段**）：

~~~json
{
  "schema_version": 1,
  "source_id": "device-installation-A",
  "harness": "codex",
  "event_id": "stable-native-or-deterministic-id",
  "timestamp": "2026-10-19T02:00:05.000Z",
  "session_id": "native-codex-thread-id",
  "model": "example-model",
  "usage": {
    "inputTokens": 10,
    "cacheCreationTokens": 0,
    "cacheReadTokens": 40,
    "outputTokens": 5,
    "reasoningOutputTokens": 2,
    "totalTokens": 55
  }
}
~~~

- 服务端由已认证的**私有主体**确定 `owner_id`，不得信任客户端传入任意 owner；`source_id` 必须绑定该主体及设备。
- `session_id` 是 Collector 原生 session/thread 身份，必须能与 Family Run **自己的** `threadId` 对应；不得从 Session 当前绑定猜历史 Run。
- `event_id` 在同一 `owner_id + source_id` 范围内稳定。相同 ID + 相同 payload 重传幂等；相同 ID + 不同 payload 拒绝并标记 conflict。
- `timestamp` 用 UTC 精确时刻，计数为非负安全整数；各 token 分类保留 Adapter 原有定义，不人为强制分类相加等于 total。
- 模型、缓存分类等来源没有提供时可为空 / unknown，不能编造 0；cost 可由查询侧按带版本的价格表**估算**，不能当真实订阅账单。
- 只同步 usage metadata，**不上传** prompt、回复、tool 正文、完整路径、项目名、thread title 或 transcript。

## 两种 Query Projection（建议接口，未实现）

| | Public / Denglema | Personal / Family |
| --- | --- | --- |
| 消费范围 | 榜单日期、已获允许的公开 Rider 统计 | 当前授权主体自己的 devices / sessions / time windows |
| 最小查询 | 继续现有 Rider / leaderboard API | 建议 `POST /api/personal/usage/session-windows` |
| 返回 | date、total、model/project **允许公开**的聚合、成就 | window key、sourceId、sessionId、token breakdown、eventCount、costEstimate、coverage |
| 明确禁止 | 暴露 sessionId、eventId、设备凭据、私有项目明细 | 查询其他 owner；猜测缺失 Session 数据 |

Personal 窗口请求示意（`source_id` 必须来自可信的 Run→Device 映射）：

~~~json
{
  "windows": [
    {
      "key": "run-123",
      "source_id": "device-installation-A",
      "sessionId": "native-codex-thread-id",
      "since": "2026-10-19T02:00:00.000Z",
      "until": "2026-10-19T02:10:00.000Z"
    }
  ]
}
~~~

响应沿用本机 `/api/session-usage` 的 `matched / no_events`、`usage` 聚合形状，但**新增来源覆盖状态**：

- `matched`：已有匹配事件；只能称为 session-window **估算归因**，不能保证 Session 没有外部操作。
- `no_events`：已覆盖查询区间、明确没有事件（`usage: null`，与现有 API 兼容）。
- `unavailable` / `partial`：目标设备、时间段或上传数据不完整；`usage: null`，不能作为零消耗或“已确认无事件”。
- 返回 `source_id`、`observed_at` / `complete_through` 与 `coverage`，让 Workbench 区分数据新鲜度和归因完整性。
- 多设备按 `source_id + sessionId + time` 过滤，不能仅以 Session ID 跨设备聚合。

原有本机时间窗当前是**两端包含**；设计实现时需测试相邻 / 重叠 Run 窗口是否重复计数，不能暗改兼容语义。

## 公开数据如何从统一来源派生

- Phase 1 **继续以现有 schema v2 DailySample 为榜单权威**，不把私有 delta 追加到每日累计上。
- 只有当某个 installation/day 的 delta 覆盖完整、与 schema v2 计量口径和时区一致，才允许比较后逐步切换为 delta 派生；两者**二选一**，不能相加。
- 仅提供每日累计的 Harness 继续上传 schema v2；Private Session 明细标记 `not_supported`。
- Rider 身份、installation pairing 与私有 Personal owner **不自动互通**：需要明确的账户关联和私有上传授权，现有 Public installation token 不能直接授权读取私有事件。
- Public 查询只能使用公开许可后的聚合，不允许借助私有查询泄露原始 Session。

## 实施顺序（本 PR 不修改运行代码）

1. **合同 / 权限**：明确 `owner_id / source_id`、幂等事件 ID、时区、覆盖状态、保留/删除、私有认证与用户授权；Public v2 不变。
2. **私有数据面**：Sync Server 新增私有事件写入与时间窗读接口、租户隔离和重复上传测试；可以独立存储，但属于同一个 Usage domain。
3. **Collector opt-in**：复用本机 parser 的 Usage Delta，按稳定 event ID 增量上传；失败可重传，不重复扫描全量日志；没有 opt-in 不上传私有 Session。
4. **Workbench 双读验证**：把本机 `/api/session-usage` 与私有 Server 的同一 `Run.threadId` 窗口对账；缺 Device 映射或 coverage 时保持 unknown。
5. **切换和收敛部署**：只有 Public 数值不回退、私有隔离/精度/性能通过真实验收后，才考虑把 :1600、:34777 的服务收敛；不得直接合并现有 `STATE_DIR` 或关闭实例。

## 最低验收

- schema v2 历史兼容；两种输入不会对同一天重复计数。
- 相同 delta 重传不重复；冲突事件不静默覆盖；两个设备相同 sessionId 不串账。
- 缺失时间窗 / 设备离线 / 仅日汇总的 Harness 均返回 unknown，而非 0。
- Query 必须按 owner 授权；Public API 永不返回 session/event 私有字段。
- Session rebind 后历史 Run 不改归因；UTC 时间与 Denglema 本地日界处理清楚。
- 迁移期间现有 Denglema 与 Family 部署保持隔离，具有明确回退路径。

相关现行合同：[Denglema schema v2](denglema-usage-contract.md)、
[Family Usage Attribution](https://github.com/viviennebla/codex-family/blob/main/docs/features/usage-attribution.md)。
