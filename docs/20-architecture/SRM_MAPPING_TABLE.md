# SRM → Taxonomy Mapping

> **Status**: Link validation automated (2025-11-17)
> **Reference taxonomy inventory**: `docs/srn-modularization/SDLC_TAXONOMY_INVENTORY.md` (established categories: 00–80; emerging: 35-integration, 65-migrations, 30-security/compliance)
> **CI Check**: All links verified via `npm run check:srm-links` (GitHub Actions workflow active)

| SRM concern / section | SRM location | Target doc(s) | Status |
| --- | --- | --- | --- |
| DTO policy & catalog | SRM intro (≈49–243) | `docs/25-api-data/DTO_CATALOG.md`, `docs/25-api-data/DTO_CANONICAL_STANDARD.md` | ✅ Anchor created (stub) |
| Error taxonomy & resilience | SRM:402–585 | `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` | ✅ Exists |
| RLS patterns & tenancy | SRM:586–853 | `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SECURITY_TENANCY_UPGRADE.md` | ✅ Exists (content deployed status pending) |
| Client cache & realtime discipline | SRM:854–860 | `docs/80-adrs/ADR-003-state-management-strategy.md`, `docs/80-adrs/ADR-004-real-time-strategy.md`, `docs/50-ops/OBSERVABILITY_SPEC.md` §4, `docs/25-api-data/REAL_TIME_EVENTS_MAP.md` | ✅ Exists (needs expanded event catalog) |
| Event catalog & channel naming | SRM:854–860 (event refs) | `docs/35-integration/INT-002-event-catalog.md` | ✅ Anchor created (stub) |
| Current vs target schema, migrations | SRM:568–627 | `docs/65-migrations/MIG-001-migration-tracking-matrix.md` | ✅ Anchor created (stub) |
| Temporal patterns (gaming day authority) | SRM:897, 1923–2048 | `docs/20-architecture/TEMP-001-gaming-day-specification.md`, `docs/20-architecture/TEMP-002-temporal-authority-pattern.md` | ✅ Anchors created (stubs) |
| Compliance / MTL | SRM:2000+ | `docs/30-security/compliance/COMP-002-mtl-compliance-standard.md` | ✅ Anchor created (stub) |
| Outbox & ops runbooks | SRM:897–900 (outbox), KPIs in OBSERVABILITY | `docs/50-ops/runbooks/RUN-001-outbox-worker-playbook.md`, `docs/50-ops/runbooks/RUN-003-schema-migration-runbook.md`, `docs/50-ops/runbooks/RUN-004-rls-policy-verification.md` | ✅ Anchors created (stubs) |
| Mapper/service factory governance | SRM examples; SERVICE_TEMPLATE refs | `docs/70-governance/patterns/domain-modeling/GOV-PAT-001-service-factory-pattern.md`, `.../GOV-PAT-002-mapper-pattern.md` | ✅ Anchors created (stubs) |
| Role taxonomy | SRM security sections | `docs/30-security/SEC-005-role-taxonomy.md` | ✅ Anchor created (stub) |

---

## Mapping Status

**Legend**: ✅ exists in repo; 🚧 target doc not yet created (needs stub before linking SRM).

**Validation Status** (as of 2025-11-17):
- Total document references in SRM: 18
- Valid references: 18
- Broken references: 0
- CI Check: Automated via GitHub Actions (`.github/workflows/check-srm-links.yml`)

All links in the SRM are verified to resolve to existing files. The link checker runs automatically on:
- Push to `main` or `develop` branches
- Pull requests that modify documentation
- Manual workflow dispatch

**Script**: `scripts/check-srm-links.ts`
**Commands**:
- `npm run check:srm-links` - Check all SRM links
- `npm run check:srm-links:verbose` - Show detailed output

---

## Next Steps

1. Deepen anchor content in stub documents (DTO_CATALOG, INT-002, SEC-005, etc.)
2. Compress verbose SRM sections into summaries with links
3. Add README.md files to `35-integration/` and `65-migrations/` categories
4. Update INDEX.md to include new categories
5. Continue modularization per `docs/srn-modularization/SESSION_HANDOFF.md`
