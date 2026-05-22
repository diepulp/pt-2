## P2 archive draft for ref/adr-050 (W2-W5 scope)

Wait before acting — need confirmation on one mechanism. The harness *catalog* scans `.claude/skills/*/SKILL.md` (1-deep). If I move items to `.claude/skills/_archive/<name>/SKILL.md`, most harness implementations ignore them because they don't match the top-level glob. If Claude Code does a recursive scan, this trick fails and I'd need to actually `git rm` them (still recoverable from history). **Tell me if you know the scan behavior; default assumption below is 1-deep.**

### Keep list (6 skills + 5 commands)

Load-bearing for W2-W5 per EXEC-068:

| Artifact                         | Why keep                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| `skills/build-pipeline`          | Orchestrator currently running this session                  |
| `skills/frontend-design-pt-2`    | W2 executor (realtime hook + mount)                          |
| `skills/e2e-testing`             | W3 executor (Playwright + integration tests)                 |
| `skills/lead-architect`          | W4 + W5 executor (registry promotion, Replication Checklist) |
| `skills/devils-advocate`         | Possible DA re-review on new EXEC revisions                  |
| `skills/backend-service-builder` | W0 already used; fallback for any migration follow-up        |
| `commands/build.md`              | Active slash command (`/build PRD-068 --resume`)             |
| `commands/create-worktree.md`    | Cross-worktree hygiene if a parallel slice spins up          |
| `commands/remove-worktree.md`    | Cleanup when ref/adr-050 lands                               |
| `commands/mvp-status.md`         | Phase 1 exit reporting at end of build                       |
| `commands/validation-gate.md`    | Manual gate replay if build-pipeline crashes                 |

### Archive list (13 skills + 27 commands)

#### Project skills (13) — dormant on this branch

| Skill                                                                                                              | Reason to archive                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `api-builder`                                                                                                      | No new API surfaces in W0-W5 (EXEC-068 explicitly disclaims this)  |
| `devops-pt2`                                                                                                       | No CI/deploy work; migration gate ran via direct bash              |
| `perf-audit`                                                                                                       | Multi-stream audit — not the pilot's shape                         |
| `performance-engineer`                                                                                             | No query optimization in W2-W5                                     |
| `playwright-cli`                                                                                                   | Overlap with `e2e-testing` (project skill is richer)               |
| `prd-writer`                                                                                                       | PRD-068 already written; W4 just re-statuses PRD-066               |
| `qa-specialist`                                                                                                    | Gate runs are bash commands inside build-pipeline, not skill calls |
| `rls-expert`                                                                                                       | No RLS delta per EXEC-068 §"Out of Scope" (TBT already Pattern C)  |
| `scrum-master`                                                                                                     | Jira integration not in use on this branch                         |
| `theme-factory`                                                                                                    | Slide/doc styling — not casino pit work                            |
| `vercel-deploy`                                                                                                    | Consistent with project-level vercel-plugin drop                   |
| `web-design-guidelines`                                                                                            | UI review overlaps with frontend-design-pt-2 patterns              |
| `frontend-design-pt-2` alternative names in user-level plugin `frontend-design@claude-code-plugins` also duplicate | (see plugins section)                                              |

#### Project commands (27) — dormant or superseded

| Group                       | Commands                                                                                                                                                                                                         | Reason                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Feature pipeline (6)        | `feature.md`, `feature-start.md`, `feature-resume.md`, `feature-status.md`, `feature-gate.md`, `feature-freeze-adr.md`                                                                                           | Different workflow than build-pipeline; not used for PRD-068        |
| Checkpoint save/restore (8) | `api-checkpoint.md`, `arch-checkpoint.md`, `backend-checkpoint.md`, `frontend-checkpoint.md`, `issue-checkpoint.md`, `skill-checkpoint.md`, `chatmode-architect-checkpoint.md`, `chatmode-service-checkpoint.md` | build-pipeline manages its own checkpoint file directly             |
| Issue tracking (4)          | `issue-log.md`, `issue-resolve.md`, `issue-status.md`, `issue-checkpoint.md`                                                                                                                                     | No active issue logging on this branch                              |
| Memori (4)                  | `memori-status.md`, `memori-cleanup.md`, `load-memory.md`, `memory-recall.md`                                                                                                                                    | Memori not currently exercised on ref/adr-050                       |
| Session state (2)           | `session-status.md`, `end-session.md`                                                                                                                                                                            | Not in active use                                                   |
| Misc (3)                    | `arch-memory.md`, `implement-context-mgmt.md`, `backend-status.md`, `exec-spec-execute.md`                                                                                                                       | `exec-spec-execute` superseded by `/build EXEC-XXX`; others dormant |

### Project-level plugins — trim to zero

| Plugin                                  | Action     | Why                                                                                                                                                          |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skill-creator@claude-plugins-official` | **Remove** | Not authoring new skills on this branch                                                                                                                      |
| `sentry@claude-plugins-official`        | **Remove** | Not debugging production issues; Sentry integration continues to work via its own codepaths, independent of the plugin's sub-skills appearing in the catalog |

Result: `enabledPlugins: {}` at project level. User-level plugins (`frontend-design`, `code-simplifier`, `playwright`, `supabase`) still propagate.

### User-level plugins — advisory, not auto-applied

These affect ALL worktrees, so I'm not proposing changes without your explicit go-ahead:

- `frontend-design@claude-code-plugins` (user) **overlaps** with `frontend-design-pt-2` (project). The project skill is PT-2-specific and more valuable. If this branch is a reasonable sample, consider dropping the user-level plugin globally.
- `playwright@claude-plugins-official` (user) **overlaps** with `e2e-testing` (project) and the now-archived `playwright-cli` (project). Consider dropping user-level.
- `supabase@claude-plugins-official` (user) — low-footprint; keep.
- `code-simplifier@claude-plugins-official` (user) — low-footprint; keep.

### Migration script

```bash
cd /home/diepulp/projects/pt-2/trees/ref/adr-050

# Archive project skills (13)
mkdir -p .claude/skills/_archive
git mv .claude/skills/api-builder .claude/skills/_archive/
git mv .claude/skills/devops-pt2 .claude/skills/_archive/
git mv .claude/skills/perf-audit .claude/skills/_archive/
git mv .claude/skills/performance-engineer .claude/skills/_archive/
git mv .claude/skills/playwright-cli .claude/skills/_archive/
git mv .claude/skills/prd-writer .claude/skills/_archive/
git mv .claude/skills/qa-specialist .claude/skills/_archive/
git mv .claude/skills/rls-expert .claude/skills/_archive/
git mv .claude/skills/scrum-master .claude/skills/_archive/
git mv .claude/skills/theme-factory .claude/skills/_archive/
git mv .claude/skills/vercel-deploy .claude/skills/_archive/
git mv .claude/skills/web-design-guidelines .claude/skills/_archive/

# Archive project commands (27)
mkdir -p .claude/commands/_archive
for cmd in \
  api-checkpoint arch-checkpoint arch-memory backend-checkpoint backend-status \
  chatmode-architect-checkpoint chatmode-service-checkpoint end-session exec-spec-execute \
  feature feature-freeze-adr feature-gate feature-resume feature-start feature-status \
  frontend-checkpoint implement-context-mgmt issue-checkpoint issue-log issue-resolve \
  issue-status load-memory memori-cleanup memori-status memory-recall session-status \
  skill-checkpoint ; do
  git mv ".claude/commands/${cmd}.md" ".claude/commands/_archive/"
done

# Trim project plugins to zero (manual edit of .claude/settings.json enabledPlugins: {})
```

### Expected effect

- Catalog entries: ~80 → ~15-20 per emission
- Per-emission tokens: ~12-15K → ~3-5K
- For a typical build session (20 tool returns): **savings of ~180-220K tokens per session**

### Caveats / rollback

- If a workflow breaks because an archived skill is needed (e.g., build-pipeline delegates to `devils-advocate` which is kept, but if it also transitively needs `rls-expert`): `git mv .claude/skills/_archive/rls-expert .claude/skills/` and retry. Each archive is one git-mv from revival.
- Archived items stay in git history. Nothing is deleted.
- The `backend-service-builder` skill is kept but its state commands (`backend-checkpoint`, `backend-status`) are archived — if you need those back in a future session, un-archive those commands only.

**Want me to run the migration script as a single commit** (`chore(harness): archive dormant skills/commands to shrink per-turn catalog`), or do you want to tweak the Keep list first?
