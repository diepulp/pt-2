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
