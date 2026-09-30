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
