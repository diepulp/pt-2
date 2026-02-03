---
name: perf-audit
description: >
  Deploy a parallel specialist swarm to audit a page or route for performance,
  quality, accessibility, and security. This skill should be used when the user
  asks to audit, profile, or review a frontend route or component directory for
  performance issues, accessibility gaps, quality concerns, or security problems.
  Triggers on "perf audit", "performance review", "audit this page", "a11y check",
  or "comprehensive audit". Dispatches 5 investigation streams in parallel using
  performance-engineer, qa-specialist, web-design-guidelines, vercel-react-best-practices,
  and rls-expert skills. Produces a consolidated PERF-NNN report at docs/issues/perf/.
argument-hint: <route|component|file> [--live=URL]
allowed-tools: Skill, Task, Read, Write, Edit, Glob, Grep, Bash
---

# Performance Audit Swarm

Deploy 5 specialist investigation streams in parallel to produce a comprehensive
audit report covering performance, quality, accessibility, security, and React/Next.js best practices.

## Pre-computed Context

- Next PERF ID: !`bash .claude/skills/perf-audit/scripts/resolve-perf-id.sh`

## Invocation

```
/perf-audit /players/[[...playerId]]
/perf-audit components/shift-dashboard-v3/
/perf-audit app/(dashboard)/players/[[...playerId]]/page.tsx
/perf-audit /players/[[...playerId]] --live=http://localhost:3000/players/abc-123
```

## Investigation Streams

| # | Stream | Skill | Focus |
|---|--------|-------|-------|
| S1 | Render Performance | `performance-engineer` | Re-render cascade, hook waterfalls, bundle size, query dedup |
| S2 | Quality & Reliability | `qa-specialist` | Error handling gaps, test coverage, edge cases, data integrity |
| S3 | Web Design & A11y | `web-design-guidelines` | WCAG 2.1 AA, ARIA patterns, touch targets, responsive, landmarks |
| S4 | React/Next.js Patterns | `vercel-react-best-practices` | React 19 anti-patterns, SSR/RSC optimization, bundle, hydration |
| S5 | Security & Auth Flow | `rls-expert` | Auth context derivation, data exposure, RLS compliance in UI |

## Action

Follow these steps exactly.

### Step 0: Validate Arguments

If `$ARGUMENTS` is empty or missing, stop immediately and display:

```
ERROR: Target required.

Usage: /perf-audit <route|component|file> [--live=URL]

Examples:
  /perf-audit /players/[[...playerId]]
  /perf-audit components/shift-dashboard-v3/
  /perf-audit app/(dashboard)/players/[[...playerId]]/page.tsx --live=http://localhost:3000/players/abc-123
```

Parse `$ARGUMENTS` to extract:
- **target**: The route path, component directory, or page file path (everything before `--live`)
- **live_url**: The URL after `--live=` (optional, may be absent)

### Step 1: Resolve Target & Assign Report ID

1. **Resolve the target** to a set of files:
   - Route path: find matching `app/` directory, collect all `.tsx`/`.ts` files + imported components
   - Component dir: collect all files in the directory tree
   - Page file: collect the file + trace imports to find all related components/hooks

2. **Use pre-computed PERF ID** from the "Pre-computed Context" section above. If the pre-computed value is not available, scan `docs/issues/perf/` for the highest existing PERF-NNN number and increment by 1.

3. **Generate target slug** from the route/component name (e.g., `PLAYER-360-RENDER-CASCADE`, `SHIFT-DASHBOARD-LAYOUT`).

### Step 2: Build File Manifest

Invoke the Explore agent to build the complete file manifest:

> **Action:** Use the Task tool with `subagent_type="Explore"` to analyze the target.
>
> The agent should:
> 1. List all .tsx/.ts files in the target directory
> 2. Trace imports to find all referenced components, hooks, stores, and utilities
> 3. Identify which bounded context(s) are involved (check SRM)
> 4. Count total lines of code
> 5. List all React hooks used (useState, useEffect, custom hooks)
> 6. List all Zustand stores referenced
> 7. List all TanStack Query hooks
>
> Return as a structured manifest with file paths, line counts, and dependency graph.

### Step 3: Deploy Investigation Swarm (PARALLEL)

**CRITICAL: Dispatch all 5 streams in a SINGLE message using multiple Skill tool calls.**

For each stream S1 through S5:

1. Read the corresponding reference file from this skill's `references/` directory
2. Interpolate `{target}`, `{file_manifest}`, and `{live_url}` (if present) into the checklist content
3. Invoke the skill with the interpolated checklist as the `args` parameter

| Stream | Skill to invoke | Reference to read |
|--------|----------------|-------------------|
| S1 | `performance-engineer` | `references/s1-render-performance.md` |
| S2 | `qa-specialist` | `references/s2-quality-reliability.md` |
| S3 | `web-design-guidelines` | `references/s3-accessibility.md` |
| S4 | `vercel-react-best-practices` | `references/s4-react-nextjs.md` |
| S5 | `rls-expert` | `references/s5-security-auth.md` |

All 5 Skill invocations MUST appear in a single message to enable parallel execution.

### Stream Failure Protocol

If a stream fails, its skill is unavailable, or it times out:
1. Log the failure with the skill name and error message
2. Continue with all remaining streams — do not block the audit on a single failure
3. In the final report, mark the failed stream as "Incomplete — {reason}" in the consensus matrix
4. Annotate findings from incomplete streams accordingly

### Step 4: Merge & Deduplicate Findings

After all streams return:

1. **Collect** all findings from S1-S5
2. **Deduplicate**: findings confirmed by 2+ streams receive a higher consensus rating
3. **Sort** by severity (P0 through P4), then by consensus count (descending)
4. **Build a Cross-Audit Consensus Matrix** showing which streams confirmed each finding

### Step 5: Generate Report

Read `references/report-template.md` for the canonical report format.

Write the consolidated report to:
```
docs/issues/perf/PERF-{NNN}-{TARGET-SLUG}-COMPREHENSIVE-AUDIT.md
```

### Step 6: Update PERF Index

Append the new report entry to `docs/issues/perf/INDEX.md` in the "Open Issues" table.

### Step 7: Display Summary

```
PERF AUDIT COMPLETE: PERF-{NNN}

 Target:    {target}
 Streams:   {completed}/5 completed
 Findings:  {count} total ({P0 count} critical, {P1 count} high)
 Consensus: {count} findings confirmed by 2+ streams

 Report: docs/issues/perf/PERF-{NNN}-{SLUG}-COMPREHENSIVE-AUDIT.md

 Next steps:
   /prd-execute docs/issues/perf/PERF-{NNN}-{SLUG}-COMPREHENSIVE-AUDIT.md
```
