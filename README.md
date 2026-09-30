# 蹬了吗 / Codex Sync Server

> **仓库定位：公开的「蹬了吗」网站 + Harness-Agnostic Usage Server。**
>
> 本仓库负责赛道、燃烧榜、我的主页、用户身份、installation / usage 存储、Denglema Usage Contract、服务端 API、Codex reset 刘海和部署。
>
> **Agent Harness 如何读取自己的 usage 不由服务端决定。** Codex 默认 adapter、portable Skill 和本地 Dashboard 位于：
> [viviennebla/codex-usage-dashboard](https://github.com/viviennebla/codex-usage-dashboard)

公开入口：<https://vimo-dev-server.taila62aff.ts.net/>

## 两个仓库怎么配合

```text
Codex / Cursor / Claude Code / Other Harness
        │
        ▼
Harness Adapter
├─ Codex MCP adapter
├─ Portable Denglema Skill
└─ Harness-native usage source
        │
        ▼
Denglema schema v2
        │
        ▼
codex-sync-server             ← 本仓库
├─ 蹬了吗网站
├─ 用户 / installation / usage 存储
├─ 赛道 / 燃烧榜 / 我的主页
└─ Codex reset 刘海 / 服务端 API
```

简单判断：

- 想改 **蹬了吗首页、跑道、燃烧榜、用户系统、服务端 API、reset 交互** → 改本仓库。
- 想改 **本地日志解析、Plugin、snapshot、上传逻辑** → 改 `codex-usage-dashboard`。

## 主要页面

| 路径 | 说明 |
| --- | --- |
| `/` | 蹬了吗首页 / 骑手赛道 |
| `/leaderboards` | Model / Project 燃烧榜 |
| `/me` | 当前骑手主页、设备与历史趋势 |
| `/plugin` | 使用教程 |

首页还会通过 CodexRunway 的公开数据展示精简的 Codex reset 状态；「求重置」互动计数由蹬了吗自己维护。

## 数据流

1. 当前 Agent Harness 通过自己的 adapter 读取可信 usage，并生成同一份 schema v2 snapshot。
2. Codex 默认使用 `codex-usage-dashboard` MCP adapter；Cursor / Claude Code / 其他 harness 可以复用同一个 Skill / HTTP Contract。
3. 首次接入会绑定当前 rider，并上传第一份 snapshot.
4. 服务端按 `user -> installation -> daily usage` 保存数据。
5. 多个 installation 会聚合到同一个 rider。
6. 当天没有 usage 的真实用户仍会显示在赛道上，token 为 `0`；历史日期数据不会因为跨天消失。

Canonical 协议：[`docs/denglema-usage-contract.md`](docs/denglema-usage-contract.md)。

上传的 usage 明细只包含聚合信息，例如：

- 日期 / observation time
- 累计 token
- Model 名称 + token 聚合
- Workspace basename + token 聚合

不会保存 prompt、源代码、完整项目路径或完整对话。

## 本地运行

要求：Node.js `>= 20`。

```bash
npm install
npm start
```

默认监听：

```text
0.0.0.0:34777
```

开发模式：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

## 常用环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `34777` | HTTP 端口 |
| `BIND` | `0.0.0.0` | 监听地址 |
| `STATE_DIR` | `state` | 用户、installation、usage 等运行时状态 |
| `SKILLS_DIR` | `skills-store` | Skill bundle 存储目录 |
| `DASHBOARD_TOKEN` | 空 | 旧同步接口的 Bearer token；为空时禁用该层认证 |
| `DENGLEMA_TIMEZONE` | `Asia/Shanghai` | 日榜 / usage 日期边界；工作节奏 09:00–18:00 也使用此产品时区 |
| `DENGLEMA_BASE_URL` | 当前 bind/port | 外部访问地址，用于安全 cookie 判断 |
| `DENGLEMA_SESSION_SECRET` | `DASHBOARD_TOKEN` | Web rider session 签名密钥 |
| `DENGLEMA_SESSION_TTL_SECONDS` | 90 天 | Web session 有效期 |
| `DENGLEMA_OPERATOR_TOKEN` | 空（Operator API 关闭） | AI Operator 专用 Bearer token；不与 Web session / DASHBOARD_TOKEN 共用 |

生产部署必须配置稳定的 `DENGLEMA_SESSION_SECRET`。

## 运行时状态

主要数据保存在 `STATE_DIR/denglema/`：

```text
denglema/
├─ users.json
├─ installations.json
├─ pairing-codes.json
├─ events.sqlite3
├─ reset-beg.json
├─ operator.json
└─ usage/
   └─ YYYY-MM-DD.json
```

`events.sqlite3` 保存 24h Event Feed、留言和 release announcement 发布状态。首次启动 SQLite 版本时会自动导入旧的 `events.json` / `announcements.json`；旧 JSON 不会被删除，保留作为回滚备份。若回滚版本又写入了新的 legacy event，再次升级时会按文件变化增量导入并按 event / announcement id 去重。

`usage/YYYY-MM-DD.json` 目前仍按天保存，因此新的一天会从 0 开始，但历史文件仍然保留。

## AI Operator A1

配置 `DENGLEMA_OPERATOR_TOKEN` 后，会启用受限的运行时运营接口。未配置时接口返回 503，不会自动放开。

发布公告：

```http
POST /api/operator/announcements
Authorization: Bearer <DENGLEMA_OPERATOR_TOKEN>
Content-Type: application/json
```

```json
{
  "idempotency_key": "web-social-transports-2026-09",
  "message": "蹬了吗更新 · 支持在线 24h 留言和更多交通工具",
  "emoji": "💬",
  "href": "/plugin#web-social-transports",
  "ttl_hours": 24
}
```

规则：

- `idempotency_key` 相同且内容相同：返回原 event，不重复发布；
- 同一个 key 对应不同内容：返回 400；
- `href` 仅允许站内 `/` 路径；
- `ttl_hours` 当前限制为 1–24 小时；
- Operator event 会写入 24h Event Feed，并携带 `actor.type=ai_operator`；
- idempotency 和 audit 都保存在有界的 `STATE_DIR/denglema/operator.json` 中；
- Operator token 不会写入 audit 或事件。

读取最近 audit：

```http
GET /api/operator/audit?limit=50
Authorization: Bearer <DENGLEMA_OPERATOR_TOKEN>
```

A1 不允许 AI Operator 修改 usage、成就、榜单、用户资料或 installation。

## 当前部署

内部服务：

```text
http://10.21.5.77:1600
```

公开入口：

```text
https://vimo-dev-server.taila62aff.ts.net/
```

当前线上服务由 `denglema-dev.service` 运行；部署工作区与个人开发 worktree 分开。

### Runner-based 自动部署

正式部署由 GitHub Actions 驱动，不再由服务器每分钟 polling GitHub。

```text
PR
  ↓
GitHub-hosted Node.js tests

merge main
  ↓
GitHub-hosted Node.js tests
  ↓ success
10.21.5.77 self-hosted runner
  ├─ Deploy Family Sync :34777
  └─ Deploy Denglema :1600
```

Denglema deploy job 使用已经通过 CI 的精确 `GITHUB_SHA`：

```text
fetch origin/main
  ↓
校验 origin/main == 当前 pipeline SHA
  ↓
checkout 精确 SHA 到独立 production worktree
  ↓
依赖 manifest 变化时 npm ci / npm install
  ↓
restart denglema-dev.service
  ↓
GET /health
  ↓
成功后关闭 legacy polling timer
```

生产部署 worktree：

```text
/home/feiyan/workspace/codex-sync-server-denglema-feishu
```

生产服务：

```text
denglema-dev.service
http://10.21.5.77:1600
```

如果 restart、依赖安装或健康检查失败，部署脚本会切回上一个 production SHA 并重新启动旧版本。

部署脚本与旧 polling 脚本共用同一个 deploy lock，因此首次切换期间也不会并发覆盖生产 worktree。首次 runner deploy 健康检查成功后会执行：

```bash
systemctl --user disable --now denglema-auto-deploy.timer
```

旧的 `scripts/pull-deploy.sh` / `scripts/install-auto-deploy.sh` 仅保留作回滚工具，不再是正式部署入口。

正式 pipeline 可直接在 GitHub Actions 中查看 test、deploy、health check、rollback 错误和耗时。

## 项目结构

```text
public/
  index.html          首页赛道
  app.js              赛道、接入、reset 交互
  leaderboards.html   燃烧榜
  profile.html        我的主页
  plugin.html         使用教程
  styles.css          页面样式
src/
  server.js           HTTP / API 入口
  denglema-state.js   rider / installation / usage 状态
  denglema-auth.js    Web session
  codex-runway.js     CodexRunway 公共 reset 数据缓存
  state.js            旧 device snapshot 存储
test/
  *.test.js
```

## 相关仓库

- Plugin / Client / Local Dashboard: [viviennebla/codex-usage-dashboard](https://github.com/viviennebla/codex-usage-dashboard)
- Web / Server: **本仓库**
