 Cross-Doc Findings (before touching the SRM)

  - Security state vs “target” wording – The dedicated security set already documents the deployed posture:
    SECURITY_TENANCY_UPGRADE.md captures the enforced anon-key + SET LOCAL workflow and explicitly mandates
    the staff.user_id column (docs/30-security/SECURITY_TENANCY_UPGRADE.md:1-120). SEC-002 reiterates that
    CasinoService is the sole temporal authority and that service RPCs must flow through the same pattern (docs/30-
    security/SEC-002-casino-scoped-security-model.md:1-35). SEC-003 enumerates every staff/service claim and who
    can read/write each context (docs/30-security/SEC-003-rbac-matrix.md:1-52). These siblings already answer the
    audit’s “current vs target” and “role taxonomy” concerns—the SRM just isn’t citing them.
  - Chip custody vs finance boundary – The TableContext addendum makes the split explicit: TableContext records
    operational custody data (including amount_cents metadata) while Finance remains the monetary ledger (docs/20-
    architecture/SRM_Addendum_TableContext_PostMVP.md:3-118). Vision’s glossary repeats the definition (“chip
    custody = non-monetary tracking; finance handles ledgers”) so the contradiction can be resolved by pointing SRM
    readers to those docs (docs/00-vision/VIS-001-VISION-AND-SCOPE.md:580-584).
  - Event system & realtime mechanics – ADR-004 (real-time strategy) lays out channel naming, batching,
    reconnection, and hook hygiene (docs/80-adrs/ADR-004-real-time-strategy.md:1-120). Observability Spec
    §4 provides concrete payload tables, query-key invalidation helpers, and throttling rules (docs/50-ops/
    OBSERVABILITY_SPEC.md:239-337). The API folder even has a mini event catalog for cache actions (docs/25-api-
    data/REAL_TIME_EVENTS_MAP.md:1-21). These cover the audit’s “ingestion job” vagueness; the SRM just needs to
    cross-link.
  - Service factories & DTO-only boundaries – Governance PRD §3.3 spells out the service-factory interface pattern,
    typing rules, and prohibitions on ad-hoc Supabase clients (docs/70-governance/CANONICAL_BLUEPRINT_MVP_PRD.md:1-
    140). ADR-003 reinforces the CQRS-light rule (“DTO/RPC only” and projections for hot telemetry) and explains
    what “light” means in practice (docs/80-adrs/ADR-003-state-management-strategy.md:1-120), while the Vision
    glossary summarizes the CQRS-light definition (docs/00-vision/VIS-001-VISION-AND-SCOPE.md:582-584).
  - Idempotency naming & custody request IDs – The API surface doc clarifies that custody endpoints require x-
    idempotency-key; when callers omit request_id, the router copies the header so (casino_id, request_id) behaves
    like the other ledgers’ idempotency_key fields (docs/25-api-data/API_SURFACE_MVP.md:553-770). That directly
    addresses cohesion issue 3.1.
  - Gaming-day temporal authority & SLO/KPI expectations – SEC-002 and PRD-001 describe casino_settings as the
    single temporal authority and point to compute_gaming_day triggers already in migrations (docs/30-security/SEC-
    002-casino-scoped-security-model.md:12-32; docs/00-vision/VIS-001-VISION-AND-SCOPE.md:229-245). Observability
    Spec §5 lists the KPIs/SLOs the SRM was missing (docs/50-ops/OBSERVABILITY_SPEC.md:330-420).
  - Outbox + worker responsibilities – The Vision doc’s responsibilities table calls out both loyalty_outbox
    and finance_outbox plus the FOR UPDATE SKIP LOCKED draining pattern (docs/00-vision/VIS-001-VISION-AND-
    SCOPE.md:229-245). Observability Spec points to the pending runbooks for those workers (docs/50-ops/
    OBSERVABILITY_SPEC.md:359-420).
  - Audit-log contract – The Observability Spec defines the canonical audit entry shape that includes dto_before/
    dto_after and correlation IDs (docs/50-ops/OBSERVABILITY_SPEC.md:40-120), so the schema mismatch called out in
    the audit is already documented elsewhere; the SRM simply isn’t reconciled with it yet.

  Gaps That Sibling Docs Do Not Close Yet

  - Audit table vs canonical shape – No doc currently explains why audit_log still has details/created_at instead
    of the {dto_before, dto_after} contract; Observability Spec says what it should be, but there is no migration/
    reference documenting the delta.
  - CI validation scripts – DTO Canonical Standard explicitly tags validate-srm-ownership.js, validate-dto-
    fields.js, etc. as TODOs (docs/25-api-data/DTO_CANONICAL_STANDARD.md:310-336); there isn’t another doc or
    script implementation to fall back on.
  - Outbox runbooks/worker playbooks – Ops spec lists them as placeholders (docs/50-ops/OBSERVABILITY_SPEC.md:359-
    422), so operational guidance still needs to be written.
  - “Circular FK” clarification – None of the reviewed sibling docs explain the Visit ↔ RatingSlip relationship
    highlighted in the audit, so that explanation still has to be added (likely to SRM or an ADR).
  - DTO catalog references – Edge Transport Policy references docs/25-api-data/DTO_CATALOG.md which doesn’t exist
    yet (docs/20-architecture/EDGE_TRANSPORT_POLICY.md:1-90); audit concern about DTO drift can’t lean on another
    finished doc.

  Summary
  Most of the audit’s contradictions and vagueness stem from the SRM drifting away from its peers: the Security
  suite, Vision/Architecture references, ADR-003/004, Observability Spec, and API docs already encode the
  “real” contracts (security state, event wiring, service factories, custody semantics, CQRS-light, KPI targets,
  idempotency flow). Before we edit the SRM again we should plan to cross-link those authoritative siblings and
  reuse their terminology rather than re-describing everything inline. Only a handful of findings (audit table
  upgrade, missing CI scripts/runbooks, unclarified circular FK) lack supporting documentation elsewhere; those
  will need new work, but the rest can be resolved by reconciling the SRM with the existing SDLC taxonomy.

  docs/patterns/SDLC_DOCS_TAXONOMY.md
  