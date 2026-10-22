# AGENTS.md

This file contains repository-level collaboration rules for `viviennebla/codex-sync-server`.

## Source of truth

- Always read the latest `main` before starting work. Do not assume a handoff SHA is still current.
- Prefer GitHub-native repo operations for source, branches, commits, PRs, reviews, and CI status.
- Use Remote Dev only for tests, runtime investigation, deployment failures, browser checks, and visual QA.
- `main` is deployed through GitHub Actions + the self-hosted runner. Do not wait for a polling timer.

## Scope discipline

- One PR should solve one clear topic.
- Do not casually refactor unrelated areas.
- `public/app.js` and `public/styles.css` are high-conflict files. Check open PRs before making large edits there.
- Preserve existing rider transport motion, social behavior, usage/privacy contracts, and opt-in upload semantics unless the task explicitly changes them.

## Validation

Before merging code changes, run the relevant checks.

Server / Web baseline:

```bash
npm test
node --check public/app.js
node --check src/server.js
```

Run `node --check` for any other changed JavaScript files.

For UI changes, verify behavior at normal desktop width and a narrow/mobile-like width. Final visual taste can be confirmed by the user; do not build heavyweight screenshot automation just for routine UI work.

## Every PR must ship a 24h announcement

Every feature, fix, UX, refactor, or meaningful docs PR for Denglema must add **one short release announcement** so the 24h event feed visibly confirms what has actually reached deployment.

Use the existing `DENGLEMA_RELEASE_ANNOUNCEMENTS` mechanism in `src/denglema-social.js`.

Requirements:

- one unique `announcement_id` / announcement `id`;
- publish only once, even after service restart;
- naturally disappear from the 24h event feed;
- keep the main change understandable in one line;
- include a useful internal link when there is a relevant page;
- once the PR number exists, make the announcement traceable to that PR when practical;
- do not skip the announcement merely because the change is “small” if it changes deployed behavior.

### Announcement tone

Every announcement must include **one short, playful, sharp comment** after the factual update.

The sharp comment should:

- be funny and slightly mean toward the software or situation, not toward a coworker;
- avoid judging individual productivity or token usage;
- avoid corporate release-note language;
- stay short enough that the event card remains easy to scan;
- describe a real quirk of the change rather than adding random jokes.

Preferred shape:

```text
<emoji> #<PR> <what changed> · <one-line playful roast>
```

Examples:

```text
🧪 #46 Rider Lab 上线 · 终于不用为了换句口号提 PR 了
🪑 #48 工位可以自己摆了 · 办公室秩序正式交给群众
💬 #49 24h 留言能翻到底了 · 之前不是失忆，只是只肯给你看 20 条
🐛 #50 修复人物漂进同事工位 · 开放办公也不能开放到重叠
```

Do not make the roast longer than the actual release information.

## PR description

A PR description should include:

```text
Why
What changed
Behavior change
Validation
Known limitations / Follow-up
Release announcement
```

The `Release announcement` section should contain the exact event-feed copy planned for this PR.

## Product tone

Denglema is a lightweight, playful Agent-usage social space, not a performance dashboard.

Prefer:

- people and social presence over KPI density;
- bright/cartoon/absurd details over enterprise SaaS styling;
- playful proxies over claims about productivity;
- cosmetic freedom over token-based unlock hierarchies.

Token usage is data, not a judgment of work quality.

## Privacy boundaries

Never upload or expose:

- prompts;
- assistant messages;
- source code;
- tool input/output;
- full local paths;
- chat/thread names;
- transcripts;
- installation tokens.

Keep user-upload permission explicit. Do not silently enable background upload.

## Rider Pack 角色/载具素材开发（Agent 必读）
当需求是“添加/替换我的蹬了吗角色或载具”时：
1. 阅读 `docs/denglema-character-frames-v1.md`，不要直接修改 UI、server 路由来硬编码新角色。
2. 帮用户准备具有发布权限的 128×100 透明 PNG 素材包（包含 manifest.json）。人物 `npm run riders:import -- /path/to/rider`，载具 `npm run vehicles:import -- /path/to/vehicle`。已经注册过的 ID 就直接修改其资源文件和 Manifest。
3. 运行 `npm run riders:validate && npm test`，然后在 `/rider-preview` 查看真实帧效果，注意不是 Agent 推算关节动画；保留截图进行视觉 review。
4. 提交独立 PR 让 CI 与 reviewer 校验，通过后 merge → runner 自动部署。切勿绕过 PR 审核、私自把未批准的资源放入服务器公开目录。
5. 只允许像素 PNG 人物/载具资源。Emoji 可以作为用户可选的文本头部，不要引回 CSS/SVG 人物兼容视觉。
