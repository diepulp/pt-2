# Governance Validation Checklist

**Purpose**: Detect and rectify documentation inconsistencies before/after architectural changes.

---

## Pre-Architecture Validation

### 1. SRM Check
**Location**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

- [ ] Identify all services/bounded contexts affected
- [ ] Verify SRM entries accurately reflect implementation
- [ ] Check for orphaned services (documented but not implemented)
- [ ] Check for undocumented services (implemented but not in SRM)
- [ ] Validate dependencies match actual call patterns

### 2. Schema Consistency
**Location**: `types/database.types.ts` + `supabase/migrations/`

- [ ] Verify types reflect latest migrations
- [ ] Migration names follow `YYYYMMDDHHMMSS_description.sql`
- [ ] RLS policies exist for user-facing tables
- [ ] Foreign keys match documented data model

**Quick Check**:
```bash
npm run db:types
git diff types/database.types.ts  # Should show no changes if in sync
```

### 3. ADR Consistency
**Location**: `docs/80-adrs/`

- [ ] Read all ADRs related to affected domain
- [ ] Check for contradicting decisions
- [ ] Verify superseded ADRs are marked
- [ ] Current implementation matches active ADRs

### 4. Anti-Pattern Check
- [ ] No class-based services
- [ ] No `ReturnType` inference
- [ ] No global singletons
- [ ] No `as any` casting

---

## Post-Architecture Validation

### 5. Cross-Reference Updates
- [ ] List all docs affected by change
- [ ] Update all atomically (all or nothing)
- [ ] New docs follow conventions (folder, ID, front-matter)
- [ ] Timestamps/versions updated

### 6. Implementation-Doc Alignment
- [ ] Code structure matches documented architecture
- [ ] Service paths align with SRM ownership
- [ ] Type definitions match schema docs
- [ ] RLS policies match proposed implementation

---

## Red Flags (Stop & Escalate)

- Multiple contradictory ADRs (not marked superseded)
- Schema types out of sync with migrations
- SRM shows non-existent services
- Anti-patterns in affected domain
- RLS missing on user-facing tables

---

## Remediation

### Option A: Rectify to Patterns
When current patterns are sufficient:
1. Identify canonical source (most recent ADR or pattern doc)
2. Update conflicting docs to align
3. Update implementation if drifted

### Option B: Propose Robust Solution
When patterns are insufficient:
1. Document the gap
2. Propose pattern enhancement
3. Create new ADR
4. Update all affected docs

---

## Doc Locations Reference

| Need | Location |
|------|----------|
| **Database types (SOT)** | `types/database.types.ts` |
| Service boundaries | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Patterns | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| Implementation reality | `docs/70-governance/SERVICE_TEMPLATE.md` |
| ADRs | `docs/80-adrs/` |
| RLS/RBAC | `docs/30-security/` |
| API contracts | `docs/25-api-data/` |
| Taxonomy (master index) | `docs/SDLC_DOCS_TAXONOMY.md` |
