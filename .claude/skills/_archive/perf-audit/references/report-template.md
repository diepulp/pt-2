# Report Template

Use this format for the consolidated audit report written to `docs/issues/perf/PERF-{NNN}-{TARGET-SLUG}-COMPREHENSIVE-AUDIT.md`.

---

```markdown
# PERF-{NNN}: {Target Name} — Comprehensive Performance, QA & Accessibility Audit

**Status:** Open
**Severity:** {highest severity found}
**Category:** Performance / Accessibility / Quality / Architecture
**Created:** {today's date}
**Investigation Method:** 5 parallel analysis agents (performance-engineer, qa-specialist, web-design-guidelines, vercel-react-best-practices, rls-expert)

---

## Executive Summary

{Key numbers: finding count, re-render count, bundle size issues, a11y violations, security gaps}

### Cross-Audit Consensus Matrix

| Finding | Perf | QA | WDG | React | Sec | Consensus |
|---------|:----:|:--:|:---:|:-----:|:---:|-----------|
| {finding summary} | X | X | | | | **2/5** |
{... one row per deduplicated finding}

---

## Affected Files

| File | Lines | Role |
|------|-------|------|
| {file path} | {line range} | {description of role} |
{... one row per affected file}

---

## P0 — Critical Issues

### P0-{N}: {Title} ({consensus}/5 consensus)

**Confirmed by:** {stream names}

**Files:** {file:line references}

{Description of issue, evidence, and impact}

**Remediation:** {specific fix instructions}

---

## P1 — High Severity Issues

{Same format as P0}

## P2 — Major Issues

{Same format as P0}

## P3 — Medium Issues

{Same format as P0}

## P4 — Low Issues

{Same format as P0}

## Remediation Phases

Group findings into actionable phases:

### Phase 1: Quick Wins (low risk, high impact)
{Bulleted list of easy fixes}

### Phase 2: Structural Changes (medium risk)
{Bulleted list of component/architecture changes}

### Phase 3: Data Flow (higher risk)
{Bulleted list of state management and data fetching changes}

### Phase 4: Testing & Validation
{Bulleted list of test coverage additions}

## Summary Scorecard

| Stream | P0 | P1 | P2 | P3 | P4 | Total |
|--------|:--:|:--:|:--:|:--:|:--:|:-----:|
| S1 Performance | | | | | | |
| S2 Quality | | | | | | |
| S3 Accessibility | | | | | | |
| S4 React/Next.js | | | | | | |
| S5 Security | | | | | | |
| **Total** | | | | | | |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation Phase |
|------|-----------|--------|-----------------|
| {risk description} | High/Med/Low | High/Med/Low | Phase N |
```
