# 蹬了吗 / Codex Sync Server

> **仓库定位：公开的「蹬了吗」网站 + 服务端。**
>
> 本仓库负责赛道、燃烧榜、我的主页、用户身份、installation / usage 存储、服务端 API、Codex reset 刘海和部署。
>
> **本地 Codex 日志解析、snapshot 生成、Plugin / MCP / Skill 不在这里**，它们位于：
> [viviennebla/codex-usage-dashboard](https://github.com/viviennebla/codex-usage-dashboard)

公开入口：<https://vimo-dev-server.taila62aff.ts.net/>

## 两个仓库怎么配合

```text
本机 Codex / Claude Code 日志
        │
        ▼
codex-usage-dashboard
├─ 本地 Dashboard
├─ Denglema Plugin / MCP / Skill
├─ schema v2 snapshot
└─ 安装 / 绑定 / 上传
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

1. `codex-usage-dashboard` Plugin 在本地读取 Codex 日志并生成 schema v2 snapshot。
2. 首次接入会绑定当前 rider，并上传第一份 snapshot。
3. 服务端按 `user -> installation -> daily usage` 保存数据。
4. 多个 installation 会聚合到同一个 rider。
5. 当天没有 usage 的真实用户仍会显示在赛道上，token 为 `0`；历史日期数据不会因为跨天消失。

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
| `DENGLEMA_TIMEZONE` | `UTC` | 日榜 / usage 日期边界 |
| `DENGLEMA_BASE_URL` | 当前 bind/port | 外部访问地址，用于安全 cookie 判断 |
| `DENGLEMA_SESSION_SECRET` | `DASHBOARD_TOKEN` | Web rider session 签名密钥 |
| `DENGLEMA_SESSION_TTL_SECONDS` | 90 天 | Web session 有效期 |

生产部署必须配置稳定的 `DENGLEMA_SESSION_SECRET`。

## 运行时状态

主要数据保存在 `STATE_DIR/denglema/`：

```text
denglema/
├─ users.json
├─ installations.json
├─ pairing-codes.json
├─ reset-beg.json
└─ usage/
   └─ YYYY-MM-DD.json
```

`usage/YYYY-MM-DD.json` 按天保存，因此新的一天会从 0 开始，但历史文件仍然保留。

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
