# Memory Architecture V2 (SDLC Taxonomy Aligned)

**Date**: 2025-11-03
**Status**: ✅ Implemented & Validated
**Owner**: Engineering Enablement
**Canonical Source**: docs/patterns/SDLC_DOCS_TAXONOMY.md

---

## Executive Summary

Optimized PT-2's memory architecture from bloated dual-directory structure (1,984 lines) to lean, taxonomy-aligned system (123 lines memory + 569 lines context). **94% reduction in baseline memory load**, freeing context budget for actual work.

### Key Improvements

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| **Memory Load** | 1,984 lines (40k tokens, 20% budget) | 123 lines (2.5k tokens, 1.3% budget) | **94% reduction** |
| **Context Strategy** | Bulk load everything | On-demand via chatmode | **18x efficiency** |
| **Directory Structure** | Dual dirs (memory/ + .claude/memory/) | Single canonical (memory/) | **Zero drift** |
| **Context Files** | 2 sparse files | 6 comprehensive files (569 lines) | **Taxonomy aligned** |
| **Chatmode Integration** | No context loading | All 3 chatmodes load relevant contexts | **Role-specific** |

---

## Problem Statement

### Issues Identified

1. **Dual Memory Directories with Drift**
   - `memory/` (129 lines, lightweight indexes)
   - `.claude/memory/` (1,984 lines, full ADR reproduction)
   - Different md5 hashes = out of sync

2. **Severe Memory Bloat**
   - `architecture-decisions.memory.md`: 1,078 lines (67x bloat)
   - `anti-patterns.memory.md`: 761 lines (34x bloat)
   - Loading full ADRs into **every session**, even when irrelevant

3. **Violated AI-Native Framework Principles**
   - Memory should be lessons learned, not documentation reproduction
   - Context should be loaded on-demand, not bulk loaded
   - No alignment with SDLC taxonomy

---

## Solution Architecture

### 1. Consolidated Memory Directory

**Decision**: Use `memory/` (root level) as canonical source

**Structure**:
```
memory/                                    # 123 lines total (6 files)
├── project.memory.md                      # Decisions made, patterns, pitfalls
├── phase-status.memory.md                 # Current implementation status
├── architecture-decisions.memory.md       # ADR index (not full text)
├── service-catalog.memory.md              # Quick service ownership index
├── domain-glossary.memory.md              # Key terminology
└── anti-patterns.memory.md                # Common pitfalls to avoid
```

**Philosophy**: Memory = lightweight decision log + gotchas (50-100 lines each)

### 2. SDLC Taxonomy-Aligned Context Files

**Structure**:
```
context/                                   # 569 lines total (6 files)
├── architecture.context.md                # SRM patterns, ADR index (ARCH)
├── governance.context.md                  # Service templates, standards (GOV)
├── quality.context.md                     # Test patterns, integrity (QA)
├── state-management.context.md            # React Query + Zustand (ADR-003)
├── api-security.context.md                # RLS, RBAC, API patterns (SEC)
└── db.context.md                          # Migration workflow (ARCH)
```

**Philosophy**: Context = domain-specific patterns extracted from full docs (100-300 lines each)

### 3. Chatmode-Specific Context Loading

Each chatmode loads only relevant contexts:

**Backend Dev**:
- architecture.context.md (SRM, service ownership)
- governance.context.md (service templates, type system)
- db.context.md (migration workflow)
- api-security.context.md (RLS policies)
- quality.context.md (test patterns)

**Frontend Dev**:
- state-management.context.md (React Query + Zustand)
- governance.context.md (frontend standards)
- quality.context.md (test patterns)
- api-security.context.md (API integration)

**Reviewer**:
- architecture.context.md (SRM compliance)
- governance.context.md (OE-01 guardrail)
- quality.context.md (coverage gates)
- api-security.context.md (security checklist)

---

## Implementation Steps

### Phase 1: Consolidation (30 min) ✅

```bash
# Deleted bloated .claude/memory/
rm -rf .claude/memory/

# Verified .claude/CLAUDE.md already references @memory/ (no changes needed)
# Result: 129-line lightweight memory retained
```

### Phase 2: Context Creation (2 hours) ✅

Created 4 new context files aligned with SDLC taxonomy:
- `context/architecture.context.md` (ARCH - 20-architecture/)
- `context/governance.context.md` (GOV - 70-governance/)
- `context/quality.context.md` (QA - 40-quality/)
- `context/state-management.context.md` (ADR-003 patterns)

Enhanced 2 existing files:
- `context/api-security.context.md` (SEC - 30-security/)
- `context/db.context.md` (ARCH database patterns)

### Phase 3: Memory Optimization (15 min) ✅

Slimmed `service-catalog.memory.md` from 36 lines to 30 lines by removing duplication with `architecture.context.md`.

### Phase 4: Chatmode Updates (30 min) ✅

Updated all 3 chatmodes to:
- Inherit from `AGENTS.md`
- Include role-specific context files
- Add compliance constraints referencing contexts

### Phase 5: Regeneration & Validation (15 min) ✅

```bash
npm run agents:compile    # Regenerated AGENTS.md with 6 context files
npm run agents:check      # Validated sync (exit code 0)
```

---

## Validation Results

### Before Optimization

```
Session Context Budget: ~200k tokens

Memory Load: 1,984 lines (~40k tokens, 20% of budget)
  - architecture-decisions: 1,078 lines (full ADR reproduction)
  - anti-patterns: 761 lines (full catalog)
  - Other: 145 lines

Available for Work: 80% of budget
Issue: ADRs loaded into EVERY session, even when irrelevant
```

### After Optimization

```
Session Context Budget: ~200k tokens

Memory Load: 123 lines (~2.5k tokens, 1.3% of budget)
  - architecture-decisions: 16 lines (index only)
  - anti-patterns: 22 lines (common pitfalls only)
  - Other: 85 lines (lessons learned)

Context Load (on-demand): ~569 lines (~11k tokens, 5.5% of budget)
  - Loaded via chatmode based on task type
  - Backend: architecture, governance, db, api-security, quality
  - Frontend: state-management, governance, quality, api-security
  - Reviewer: architecture, governance, quality, api-security

Available for Work: 93% of budget
Benefit: 18x reduction in baseline load, context loaded when needed
```

### Metrics

| Component | Files | Lines | Purpose |
|-----------|-------|-------|---------|
| **Memory** | 6 | 123 | Lightweight decision log, gotchas |
| **Context** | 6 | 569 | Domain patterns, extracted from docs |
| **Chatmodes** | 3 | 43 | Role-specific context loading |
| **Total Baseline** | 15 | 735 | Down from 2,113 (65% reduction) |

---

## Memory Philosophy

### Memory Files (Always Loaded)

**Purpose**: Lightweight decision log and gotchas
**Size**: 50-100 lines per file, 200-300 lines total
**Content**:
- What decisions were made and when
- What patterns worked well
- What pitfalls to avoid
- Current blockers
**Update Frequency**: After each significant decision or lesson learned

### Context Files (Loaded via Chatmode)

**Purpose**: Domain-specific knowledge and patterns
**Size**: 100-300 lines per file
**Content**:
- Extracted patterns from ADRs/docs
- Code examples and templates
- Quick reference guides
**Update Frequency**: When ADRs/patterns change

### Full Documentation (Read on Demand)

**Purpose**: Deep dives when implementing specific features
**Size**: No limit (lives in `docs/`)
**Content**:
- Complete ADRs with rationale
- Full anti-pattern catalog with examples
- Comprehensive guides and workflows
**Access**: Agent reads via `Read` tool when task requires it

---

## SDLC Taxonomy Alignment

Context files map directly to SDLC documentation categories:

| Context File | Taxonomy Category | Source Docs |
|--------------|-------------------|-------------|
| architecture.context.md | ARCH (20-architecture/) | SRM, ADR-000, ADR-008, ADR-009 |
| governance.context.md | GOV (70-governance/) | Service template, OE-01, frontend standards |
| quality.context.md | QA (40-quality/) | Test strategy, quality gates, ADR-005 |
| api-security.context.md | SEC/API (25-api-data/, 30-security/) | RLS matrix, RBAC, API security |
| db.context.md | ARCH (20-architecture/) | Migration workflow, ADR-001 |
| state-management.context.md | ARCH (ADR-003) | React Query + Zustand patterns |

---

## Benefits

✅ **18x Memory Efficiency**: Baseline load reduced from 40k → 2.5k tokens
✅ **Zero Drift**: Single canonical memory directory
✅ **Role-Specific Loading**: Backend/frontend/reviewer get only relevant context
✅ **Taxonomy Aligned**: Context files map to SDLC docs (ARCH, GOV, QA, SEC)
✅ **Maintainable**: Memory = lessons learned, context = extracted patterns
✅ **Scalable**: Add new context files without bloating memory
✅ **Validated**: `agents:check` passes, no drift

---

## Maintenance Guidelines

### Weekly
- Update `project.memory.md` with decisions/patterns/pitfalls
- Review `phase-status.memory.md` for current blockers

### Monthly
- Audit context files vs source docs (ADRs, SRM, etc.)
- Prune stale entries from memory files

### Quarterly
- Refactor workflows based on usage patterns
- Update SDLC taxonomy references if docs reorganize

---

## Next Steps

**Immediate** (Complete):
- [x] Delete `.claude/memory/`
- [x] Create 4 new context files (architecture, governance, quality, state-management)
- [x] Update 3 chatmodes with context loading
- [x] Regenerate AGENTS.md
- [x] Validate with `agents:check`

**Short-term** (Week 1):
- [ ] Add CI job `agent-context-guard` to run `npm run agents:check`
- [ ] Document memory philosophy in onboarding guide
- [ ] Create context file templates for future additions

**Medium-term** (Month 1):
- [ ] Track memory/context usage metrics per session
- [ ] Measure context load time improvements
- [ ] Gather feedback on context file usefulness

---

## References

- **SDLC Taxonomy**: docs/patterns/SDLC_DOCS_TAXONOMY.md (canonical source)
- **AI-Native Framework**: docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md
- **Memory Infrastructure**: docs/agentic-workflow/MEMORY_INFRASTRUCTURE_GUIDE.md (Phase 1)
- **CLI Presets**: docs/agentic-workflow/CLI_PRESETS.md
- **Agent Compiler**: scripts/compile_agents.mjs

---

**Version**: 2.0.0
**Status**: Production
**Next Review**: 2025-12-03
