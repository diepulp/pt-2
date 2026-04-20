---
id: ISSUE-HARNESS-TOKEN-LEAKAGE
title: Harness / plugin stack burns ~10x context per session via duplicated hook + plugin reminders
severity: immediate
status: open
opened_at: 2026-04-19
opened_by: user report (PRD-067 build session)
owner: unassigned
tags: [devops, harness-config, token-budget]
---

# Harness token leakage in Claude Code session

## Observed

A routine `/build --resume` → commit → push → PR session for PRD-067 burned ~156K tokens.
Breakdown from that session:

| Bucket | Approx. tokens | Notes |
|---|---|---|
| Real work (Read checkpoint, 3 Edits, 1 rebase, 1 push, 1 `gh pr create`) | ~15K | Expected |
| SessionStart dumps (Vercel knowledge-update x2, CLI-outdated warning x2) | ~8K | Duplicate injections |
| `build-pipeline` SKILL.md load | ~20K | Expected one-off |
| Repeated `<system-reminder>` with **full skills catalog** after every tool call | ~100K | ~8 firings × ~12–15K each |
| Misc hook/lint-staged chatter + long PR body | ~13K | Expected |

Real-work-to-overhead ratio was roughly **1 : 9**.

## Evidence — configs that compound

**`~/.claude/settings.json` (user level):**
- `PreToolUse:Skill` has the **same `npx -y ccstatusline@latest --hook`** hook declared **twice** (two identical entries under the same matcher). Same pattern in `UserPromptSubmit`.
- `enabledPlugins` activates 9 plugins: `agent-sdk-dev`, `frontend-design`, `typescript-lsp`, `code-simplifier`, `pyright-lsp`, `playwright`, `ralph-loop`, `supabase`, `vercel-plugin`.
- `npx -y ccstatusline@latest` is also the `statusLine.command` — a network-backed `npx` runs on every prompt/Skill call, which is slow but doesn't directly consume tokens; the `--hook` variant on PreToolUse does.

**`.claude/settings.json` (project level, checked into the worktree):**
- `enabledPlugins` adds 7 more: `typescript-lsp`, `pyright-lsp`, `skill-creator`, `superpowers`, `code-review`, `vercel`, `sentry`.
- **Vercel overlap:** `vercel-plugin` at user level AND `vercel` at project level — both register `knowledge-update` skills that emit the same ~4K `<system-reminder>` at SessionStart. This is why the Vercel knowledge-update document appeared **twice** at start.
- **TypeScript/Pyright LSP overlap:** enabled at both user and project level — harmless but redundant.

**Skills catalog side-effect:**
- ~250 skill entries (project skills + superpowers + Vercel sub-skills + Sentry sub-skills + agent-sdk + …) re-serialize into every `<system-reminder>` fired by hook infra. Each firing is ~12–15K tokens. The reminder fires on the UserPromptSubmit hook *and* opportunistically after some tool returns.

## Why this is urgent

- A trivial ops task (3-line edit + rebase + push + PR) should not consume 75%+ of a 200K-token session budget.
- This cost amortizes across **every** session on this host — quiet compounding drag on delivery.
- Prompt-cache TTL is 5 minutes; large repeated reminders invalidate + re-prime the cache every tool call, multiplying latency cost beyond the token count.

## Proposed actions (in priority order)

### P0 — De-duplicate hooks (15 min)

Edit `~/.claude/settings.json`:

- Collapse the two identical `PreToolUse:Skill` hook blocks into one.
- Collapse the two identical `UserPromptSubmit` hook blocks into one.

Each duplicated hook block triggers a separate `<system-reminder>` round-trip. Removing them immediately halves the firing count for those events.

### P1 — Resolve Vercel plugin overlap (10 min)

Pick one:

- Keep `vercel-plugin@vercel-vercel-plugin` (user level) and disable `vercel@claude-plugins-official` (project level) — or vice versa.
- They expose overlapping skills (`:deploy`, `:env`, `:bootstrap`, `:marketplace`, `:status`) plus the large `knowledge-update` reminder.

Also fold duplicate LSP plugins: `typescript-lsp` / `pyright-lsp` enabled at both user and project — keep project-level only.

### P2 — Audit project skill surface (30 min)

`.claude/skills/` contains heavy workflows (`build-pipeline`, `feature-pipeline`, `lead-architect`, `backend-service-builder`, `devils-advocate`, etc.). Each registers in the skills catalog and bulks every `<system-reminder>`.

Review whether all skills should be **advertised every turn** vs **available on demand** (the Skill tool already supports explicit invocation without catalog listing — worth checking what the harness does with non-advertised skills).

### P3 — Disable `ccstatusline --hook` on PreToolUse (5 min)

`npx -y ccstatusline@latest --hook` is invoked on every Skill tool call (and every user prompt). It's a status-line refresh, not a safety hook. It emits output that may or may not feed into a reminder, but even a silent cold-start `npx` run per tool call is cost. Consider moving to `statusLine.command` only, not the hook variant.

### P4 — Keep destructive-action hook (no change)

`.claude/hooks/prevent-destructive.sh` on PreToolUse:Bash is the one hook that should stay — it's a safety rail, not telemetry.

## Verification after changes

After each P0–P3 change, start a fresh `claude-code` session and measure:

```
/clear
# then run a small diagnostic prompt: "read one file, grep for X, answer in one sentence"
# compare token usage before/after per round trip
```

Expected outcome: per-tool-call reminder size drops from ~15K to <1K, session overhead drops from ~140K to <20K.

## Not in scope

- Core harness behavior (the fact that the system re-emits catalogs at all) is upstream of this repo and belongs in a separate upstream feedback loop, not this issue.
- Memory files and MEMORY.md are ~3K steady-state — not a meaningful contributor.

## Related

- No prior ISSUE in `docs/issues/` references harness/plugin cost.
- PRD-067 build session (2026-04-19) is the observed instance; session transcript in `~/.claude/history.jsonl`.

----------------------------------------------------

## P2 explained: the skills-catalog burn

### What the "skills catalog" is

Every `<system-reminder>` that shows up between tool calls contains a rendered list of every available skill — one line per skill with its name + description, grouped by source. In this session I've seen it appear ~4 times. Each firing is roughly 12-15K tokens.

**Here's the concrete count for this branch right now:**

| Source                                     | Count  | Notes                                                                                                                  |
| ------------------------------------------ | -----: | ---------------------------------------------------------------------------------------------------------------------- |
| Project skills (`.claude/skills/*/`)       | **19** | `build-pipeline`, `lead-architect`, `backend-service-builder`, `devils-advocate`, `e2e-testing`, `rls-expert`, 13 more |
| Project commands (`.claude/commands/*.md`) | **32** | Lots of checkpoint/memori/chatmode variants                                                                            |
| User-level plugins                         | 4      | `frontend-design`, `code-simplifier`, `playwright`, `supabase`                                                         |
| Project-level plugins (post-trim)          | 2      | `skill-creator`, `sentry`                                                                                              |
| Plugin sub-skills (union)                  | ~25-30 | `supabase:*`, `frontend-design:*`, `sentry:*` etc.                                                                     |

Round numbers: **~80 skill entries × ~100 tokens each ≈ 8-12K per emission.** Matches the issue's 12-15K figure.

### Why this is expensive in a way P0/P1 weren't

**P0/P1 fixed duplication** — hooks or plugins firing twice. P2 is different: the catalog fires **the correct number of times**, but each firing is already expensive because the catalog is big. You can't de-duplicate a single honest emission; you can only shrink what's inside it.

**Prompt cache implications:**
- Anthropic's cache TTL is 5 min
- The catalog is part of the `<system-reminder>` stream that mutates turn-to-turn (different skill names get highlighted based on context)
- When the cache key changes, the whole prefix replays uncached → slower + costlier
- A large catalog means every cache miss is expensive

**Per-turn cost profile:**
```
Small edit that triggers one system-reminder:
  ~15K reminder + ~2K actual work = ~17K per turn, mostly overhead
A /build session with 20 turns → 20 × ~15K = ~300K reminder tokens
```

### What's fixable repo-side vs upstream-only

**Repo-side (things you can do to this branch):**

1. **Archive dormant project skills.** Move unused skill dirs into `.claude/skills/_archive/`. The harness only reads direct children of `.claude/skills/`, so archived skills disappear from the catalog but the files stay git-tracked for later revival. Candidates on this branch that aren't load-bearing for ADR-050 work:
   - `scrum-master` (Jira integration — not used here)
   - `theme-factory` (slide/doc styling — not casino pit work)
   - `web-design-guidelines` / `vercel-deploy` (deployment not the focus of this tree)
   - `playwright-cli` (we use `e2e-testing` instead — overlap)

2. **Trim commands in `.claude/commands/`**. You have 32 commands including 9 `*-checkpoint` variants, 4 `memori-*`, 2 `chatmode-*`, plus `load-memory`, `session-status`, `end-session`, etc. Many of these are "state-management plumbing" that's useful once or twice per session but advertised every turn. Candidates to archive:
   - `api-checkpoint`, `backend-checkpoint`, `arch-checkpoint`, `frontend-checkpoint`, `issue-checkpoint`, `skill-checkpoint`, `chatmode-*-checkpoint` (7 entries)
   - `memori-*` (4 entries) if Memori isn't actively in use on this branch
   - `implement-context-mgmt`, `load-memory`, `memory-recall`, `session-status`, `end-session` if not routinely invoked

3. **Tighten `description:` front-matter** on skills you keep. The difference between:
   ```
   description: PT-2 Row-Level Security (RLS) specialist for implementing, validating, and troubleshooting casino-scoped RLS policies. This skill should be used when creating new database tables, writing RLS policies, implementing SECURITY DEFINER RPCs, or auditing existing policies for ADR-015/ADR-020/ADR-024/ADR-030/ADR-035 compliance. [continues for 4 more lines]
   ```
   vs:
   ```
   description: RLS policies for PT-2 (Pattern C hybrid, SECURITY DEFINER RPCs, ADR-015/020/024/030 compliance). Use for new tables, policy writes, or multi-tenant troubleshooting.
   ```
   ~200 tokens saved on a single skill. Across 20 skills, that's 4K per catalog emission × many emissions = noticeable.

4. **Disable more plugins.** You just dropped Vercel from project level. Next candidate is `skill-creator@claude-plugins-official` — it's useful when *building* a skill but adds ~4 sub-skills (`skill-creator:*`) to every catalog emission. If you're not authoring skills on this branch, drop it.

**Upstream-only (not fixable in this repo):**

- **The fact that the catalog re-emits every turn instead of once.** If Anthropic's harness treated skill registration like tool registration (sent once at session start, not re-rendered), this problem disappears. That's a feedback-to-Anthropic item, not a PT-2 fix.
- **The format of each catalog entry.** The harness controls how skill descriptions are rendered into the reminder — we only control the raw description string length.
- **Auto-triggering behavior.** Claude decides whether to invoke a skill based on its description. Shortening descriptions risks triggering accuracy — there's a tradeoff between token size and skill discovery.

### The tradeoff that makes P2 "audit" and not "just do it"

If you archive `devils-advocate`, the DA team stage in `build-pipeline` breaks. If you archive `lead-architect`, Stage 1 of EXEC-SPEC generation breaks. If you shorten the `e2e-testing` skill description too aggressively, Claude may stop auto-routing Playwright work to it and you start writing E2E tests inline. Each removal needs a judgment call: "is this skill load-bearing for the workflow currently running on this branch, or dormant?"

Hence the 30-minute estimate in the issue — it's not the edit that's slow, it's deciding *which* skills matter right now.

### Rough ROI estimate for this branch

If you archive ~10 dormant project skills + ~12 dormant commands + trim descriptions on the survivors, catalog emissions drop from ~12-15K → ~6-8K. On a 20-turn session, that saves ~140K tokens. For this tree's immediate W2-W5 work, that's meaningful — probably worth a 30-minute session before resuming W2.

### What I'd *not* recommend

- **Don't** delete skills outright. Archive them (move to `_archive/` subdir) so git history stays clean and revival is one `git mv` away.
- **Don't** tighten descriptions on the skills you know Claude needs to auto-route to for ADR-050 work (`frontend-design-pt-2`, `backend-service-builder`, `e2e-testing`, `build-pipeline`, `lead-architect`). Those are load-bearing for the remaining workstreams.
- **Don't** touch plugin sub-skills — you can only disable plugins wholesale, and targeted removal isn't worth the compatibility risk.

Want me to draft the archive list with specific candidates and a one-command migration?

"enabledPlugins": {
    "frontend-design@claude-code-plugins": true,
    "code-simplifier@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "supabase@claude-plugins-official": true
  },
