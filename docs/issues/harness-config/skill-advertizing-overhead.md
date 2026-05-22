Yes, manual edit is perfectly fine — if anything cleaner than rebase when the change is a single-file surgical edit. Just edit `.claude/settings.json` in each worktree's `.claude/` and delete `.claude/commands/prd-execute.md`. Git will silently accept the identical change when those branches later merge/rebase main.

On advertising — your model is almost right. Two invocation paths exist:

### Path A — Slash command (explicit)

User types `/build PRD-003`. The harness sees the `/<name>` pattern, looks up `.claude/commands/build.md`, and that command file instructs the model:

```
Skill(skill="build-pipeline", args="--resume")
```

The model follows. **In this path, the skill's catalog entry is not functionally needed** — the slash command routes directly. The model doesn't need to "discover" the skill.

### Path B — Natural-language trigger (implicit)

User types "build this PRD" or "execute the spec at docs/...". The harness injects all skills' metadata (the `description:` field from each `SKILL.md` frontmatter) into a `<system-reminder>`. The model reads the catalog, sees `build-pipeline`'s description — *"This skill should be used when the user asks to 'build from a PRD', 'execute a spec'..."* — and decides to invoke it via the Skill tool.

**This is where the token cost lives.** `build-pipeline`'s description is ~150 words. It's there because the skill was written to support natural-language invocation as well as the slash command.

### Where the cost comes from

Look at `.claude/skills/build-pipeline/SKILL.md` frontmatter:

```yaml
---
name: build-pipeline
description: Orchestrate specification-to-production implementation with
  phased workstream execution, validation gates, and checkpoint-based resume.
  This skill should be used when the user asks to "build from a PRD",
  "execute a spec", "implement PRD-XXX", ... (15+ trigger phrases listed)
---
```

The entire `description:` block ends up in every `<system-reminder>` turn after turn.

### How to avoid it for slash-only skills

For heavy skills you realistically *only* invoke via slash command, shorten the frontmatter description to a stub. The skill remains fully functional; it just stops auto-triggering on natural language.

```yaml
---
name: build-pipeline
description: Build-pipeline orchestrator. Invoke via /build slash command.
---
```

That drops the catalog line from ~150 words to ~10. `/build` still works because slash routing doesn't depend on the description. The only thing you lose is "if the user says 'please execute PRD-003', auto-invoke" — which for a heavy skill is arguably a feature (prevents accidental triggering during unrelated edits).

### Candidates for slash-only stub treatment

High-trigger-phrase, heavy-description skills that are realistically only invoked explicitly:

| Skill                                                                           | Current description size | Realistic trigger                                                 |
| ------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `build-pipeline`                                                                | ~150 words               | `/build` only                                                     |
| `feature-pipeline`                                                              | ~140 words               | `/feature` only                                                   |
| `lead-architect`                                                                | ~100 words               | `/lead-architect` or explicit delegation                          |
| `perf-audit`                                                                    | ~120 words               | `/perf-audit` only                                                |
| `qa-specialist`                                                                 | ~150 words               | Usually explicit                                                  |
| `devops-pt2`                                                                    | ~160 words               | Usually explicit                                                  |
| `devils-advocate`                                                               | ~120 words               | Keep — genuinely useful on natural-language "review this spec"    |
| `rls-expert`                                                                    | ~130 words               | Keep — triggers usefully on RLS-adjacent editing                  |
| `api-builder`, `backend-service-builder`, `e2e-testing`, `frontend-design-pt-2` | ~100w each               | Keep — they correctly trigger when you're working in their domain |

Trimming the first six could save ~750 words per reminder (~3K tokens) without breaking any workflow. Want me to draft the description trims for review?