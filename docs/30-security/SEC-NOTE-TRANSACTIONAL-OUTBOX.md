# SEC Note: Transactional Outbox (GAP-F1 Closure)

**Feature:** transactional-outbox (FIB-H-W2-OUTBOX-001)
**Date:** 2026-05-10
**Author:** Vladimir Ivanov
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `finance_outbox.payload` (JSONB) | Financial | Contains transaction amounts, event type, and financial fact metadata; breach exposes casino financial throughput |
| `finance_outbox.player_id` (Class A rows) | PII | Identifies player on ledger-class events; NULL on Class B and Dependency Events by construction |
| `finance_outbox.casino_id` | Operational | Casino-scoped tenancy boundary; cross-casino read is a regulatory violation |
| `table_buyin_telemetry.amount_cents` | Operational | Table-level grind amounts; no PII but operationally sensitive |
| `processed_messages` records | Operational | Consumer idempotency state; tampering could cause duplicate projection side effects |
| `CRON_SECRET` relay auth credential | Operational | Internal credential authorizing relay endpoint invocations; exposure allows arbitrary relay triggers |
| `origin_label` integrity | Compliance | Provenance label (`actual` / `estimated`) is immutable by design (ADR-052 R4); unauthorized upgrade corrupts financial authority classification |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino outbox data leak | High | Low | P1 |
| T2: Unauthorized relay endpoint invocation | High | Medium | P1 |
| T3: `origin_label` upgrade by consumer (`estimated` → `actual`) | High | Low | P1 |
| T4: Fabricated outbox row injection (outside RPC transaction) | High | Low | P1 |
| T5: Duplicate projection side effect from replay | Medium | Medium | P2 |
| T6: Relay lifecycle metadata misuse as financial authority | Medium | Low | P2 |
| T7: SECURITY DEFINER search_path exploit | High | Low | P1 |

### Threat Details

**T1: Cross-casino outbox data leak**
- **Description:** A compromised internal path or future RLS-exposed read path exposes `finance_outbox` rows belonging to a different casino.
- **Attack vector:** Future tenant-facing read path that lacks casino scoping; downstream projection ownership boundary drift; or misuse of service-role access outside the relay's bounded internal transport role.
- **Impact:** Financial data from Casino A visible to Casino B; regulatory violation.

**T2: Unauthorized relay endpoint invocation**
- **Description:** External actor triggers `/api/internal/outbox-relay` without a valid `CRON_SECRET`.
- **Attack vector:** Direct HTTP POST to the relay route from an unauthenticated source.
- **Impact:** Unauthorized relay invocation could force replay processing, trigger unnecessary relay load, or accelerate delivery attempts outside expected scheduler cadence. The relay does not dynamically target arbitrary consumers; the topology is bounded and internal.

**T3: `origin_label` upgrade by consumer**
- **Description:** A consumer reads an `estimated`-labeled event and writes it downstream as `actual`, granting false settlement authority.
- **Attack vector:** Consumer code that ignores `origin_label` or contains a mapping error; no DB-level enforcement on the consumer side.
- **Impact:** Corrupts financial authority classification; downstream projections treat non-ledger facts as authoritative.

**T4: Fabricated outbox row injection**
- **Description:** A caller inserts directly into `finance_outbox` outside the SECURITY DEFINER RPC transaction boundary.
- **Attack vector:** Direct INSERT via authenticated or service-role client, bypassing the atomic PFT/grind + outbox boundary; or semantically invalid outbox rows authored through legitimate RPC paths due to incorrect event classification, malformed payload construction, or parity violations.
- **Impact:** Breaks I1 atomicity invariant; fabricated events are relayed to consumers; projection state is corrupted.

**T5: Duplicate projection side effect from replay**
- **Description:** Consumer processes the same `event_id` twice, applying its projection side effect twice.
- **Attack vector:** Relay delivers a batch, crashes before setting `processed_at`, re-delivers on next cycle; consumer lacks idempotency check.
- **Impact:** Double-counted financial projections; incorrect shift totals or session summaries.

**T6: Relay lifecycle metadata misuse as financial authority**
- **Description:** Downstream code reads `delivery_attempts`, `last_attempted_at`, or `last_error` as financial signals rather than relay diagnostics.
- **Attack vector:** Implementation drift — developer treats delivery state as projection authority.
- **Impact:** Relay infrastructure state conflated with financial fact state; non-authoritative data surfaces as operational truth.
- **Boundary:** Relay lifecycle metadata MUST NOT be used to derive financial completeness, settlement confidence, or projection authority. `processed_at` is relay lifecycle state only. `delivery_attempts` and `last_error` are transport diagnostics only. Relay metadata is never financial truth.

**T7: SECURITY DEFINER search_path exploit**
- **Description:** A malicious schema placed earlier in the search_path intercepts calls inside a SECURITY DEFINER function.
- **Attack vector:** Missing `SET search_path = ''` in a new SECURITY DEFINER RPC that produces outbox rows.
- **Impact:** Function body executes in attacker-controlled schema context; SQL injection or data exfiltration.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | Casino-scoped RPC authoring and bounded relay access | All outbox INSERTs issued inside SECURITY DEFINER RPCs that derive `casino_id` from `set_rls_context_from_staff()` (ADR-024); relay operates under service-role access and intentionally processes all casino-scoped rows. Cross-casino isolation is enforced at the authoring/RPC boundary and at downstream projection ownership boundaries, not via relay-level filtering. |
| T2 | `CRON_SECRET` header validation | Relay route rejects requests without a matching `CRON_SECRET` header before any DB access |
| T3 | `origin_label` immutability contract | `origin_label` hardcoded per class at RPC authoring boundary; DTO contract documents no-upgrade rule; consumer backbone enforces read-and-propagate, no upgrade path |
| T4 | SECURITY DEFINER–only write path | No direct INSERT grants on `finance_outbox`, `table_buyin_telemetry`, or `processed_messages` to `authenticated` role; all writes go through RPCs |
| T5 | `processed_messages` idempotency | Consumer atomically inserts `(message_id, casino_id)` with `ON CONFLICT DO NOTHING RETURNING message_id`; no row returned = duplicate, skip |
| T6 | Lifecycle fields declared as diagnostics only | RFC-006 §4.1 explicitly prohibits treating `processed_at`, `delivery_attempts`, or `last_error` as financial completeness, settlement confidence, projection authority, DLQ state, or authority signal; ADR-056 will codify this boundary |
| T7 | `SET search_path = ''` mandate | Pre-commit hook enforces `SET search_path = ''` on all SECURITY DEFINER functions (ADR-018); new RPCs must pass hook before commit |

### Control Details

**C1: Casino-scoped RPC authoring**
- **Type:** Preventive
- **Location:** Database (SECURITY DEFINER RPCs)
- **Enforcement:** Database — `set_rls_context_from_staff()` sets `app.casino_id`; RPC reads `current_setting('app.casino_id')` for every INSERT
- **Tested by:** Integration tests for `rpc_create_financial_txn`, `rpc_record_grind_observation`, `rpc_request_table_fill`
- **Relay boundary:** Relay operates under service-role access and intentionally processes all casino-scoped rows. It is an internal transport mechanism, not a tenant-facing read path. Cross-casino isolation is enforced at the authoring/RPC boundary and at downstream projection ownership boundaries, not via relay-level filtering.

**C2: `CRON_SECRET` validation**
- **Type:** Preventive
- **Location:** Application (Next.js API route `/api/internal/outbox-relay`)
- **Enforcement:** Application — validates header before any DB query; returns 401 on mismatch
- **Tested by:** Route handler unit test; I1–I4 failure harness includes relay auth scenarios

**C3: `origin_label` no-upgrade rule**
- **Type:** Preventive + Detective
- **Location:** Application (FinancialOutboxEventDTO contract) + Database (hardcoded at INSERT)
- **Enforcement:** Both — hardcoded at RPC layer, documented on DTO, enforced by consumer code review and type system (no mutable field)
- **Tested by:** I3 idempotency test verifies `origin_label` travels unchanged through relay → consumer

**C4: SECURITY DEFINER–only write path**
- **Type:** Preventive
- **Location:** Database (role grants)
- **Enforcement:** Database — no `INSERT` privilege granted on the three new tables to `authenticated`; only service role via SECURITY DEFINER RPCs
- **Tested by:** Migration review gate; RLS policy matrix (SEC-001) will be updated in Phase 5

**C5: `processed_messages` idempotency**
- **Type:** Preventive
- **Location:** Database (consumer transaction)
- **Enforcement:** Database — `ON CONFLICT DO NOTHING RETURNING` is atomic; no application-layer TOCTOU window
- **Tested by:** I3 failure harness — `runConsumer()` twice assertion

**C6: Relay lifecycle metadata boundary**
- **Type:** Preventive
- **Location:** Application (relay worker + projection consumers)
- **Enforcement:** Relay metadata is documented and reviewed as transport lifecycle state only. `processed_at` records relay dispatch acknowledgment; `delivery_attempts`, `last_attempted_at`, and `last_error` are retry diagnostics. None may be used to derive financial completeness, settlement confidence, or projection authority.
- **Tested by:** Code review gate and RFC/ADR conformance checks for projection consumers

**C7: `SET search_path = ''`**
- **Type:** Preventive
- **Location:** Database (SECURITY DEFINER function header)
- **Enforcement:** Database + pre-commit hook — hook rejects commit if any SECURITY DEFINER function lacks the directive
- **Tested by:** Pre-commit hook (CI enforced)

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Dead-letter queue for poison events | Wave 2 guardrail §5.5 prohibits alerting/DLQ infrastructure in transport slice; `last_error` field provides introspection without a platform | Before scaling relay to high-volume production; a separate FIB required |
| Relay endpoint rate limiting | Pilot scale does not warrant rate limiting; Vercel cron topology limits invocation cadence by design | Before opening relay to any non-cron trigger path |
| Outbox table encryption at rest | Supabase Vault not yet provisioned; `finance_outbox.payload` stores amounts in JSONB plaintext | Before regulatory audit requirement; separate infrastructure PRD |
| Multi-consumer fan-out isolation | `processed_messages` uses a single-consumer schema assumption (Wave 2 named constraint); multi-consumer requires schema evolution | Before any second projection consumer is added |
| `player_id` presence audit (Class A rows) | RPC enforces `player_id` NOT NULL at invocation time, not via DDL constraint on the shared table | Before any future shared-table schema refactor |
| Replay amplification / replay exhaustion attacks | Pilot topology is bounded and relay invocation is authenticated; no external replay API exists | Before introducing multi-consumer replay tooling or external replay controls |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `finance_outbox.payload` | Plaintext JSONB | Required for relay delivery and consumer processing; may be linkable to `player_id` on Class A rows. `player_id` is an opaque UUID reference; sensitivity derives primarily from linkage to financial-event context rather than from the identifier value itself. |
| `finance_outbox.player_id` | UUID reference (plaintext) | Required for Class A event routing; NULL on Class B and Dependency Events; UUID reference only. Sensitivity derives primarily from linkage to financial-event context and replay history rather than from the opaque identifier value itself. |
| `finance_outbox.casino_id` | UUID reference (plaintext) | Required for tenancy scoping at producer and downstream projection ownership boundaries |
| `table_buyin_telemetry.amount_cents` | Plaintext BIGINT | Operational telemetry amount; no player attribution; not sensitive enough to warrant encryption at pilot scale |
| `processed_messages.message_id` | UUID reference (plaintext) | Idempotency key — same `event_id` as outbox; opaque UUID, no sensitive content |
| `CRON_SECRET` | Environment variable (not stored in DB) | Never persisted to any table; injected at runtime via Vercel env vars |

---

## RLS Summary

These three tables are written exclusively through SECURITY DEFINER RPCs and read by the relay worker using the service-role client. No `authenticated`-role RLS policies are required or applied. This is intentional and consistent with ADR-015 (self-injection pattern) and ADR-018 (SECURITY DEFINER governance).

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `finance_outbox` | Service role only (relay worker) | SECURITY DEFINER RPCs only | Relay worker (`processed_at`, lifecycle fields only) | Denied |
| `table_buyin_telemetry` | Service role only | SECURITY DEFINER `rpc_record_grind_observation` only | Denied | Denied |
| `processed_messages` | Service role only | SECURITY DEFINER consumer backbone only | Denied | Denied |

No authenticated-client read or write paths exist for any of these tables. Cross-casino scoping is enforced at the RPC layer by `set_rls_context_from_staff()` (ADR-024), not by table-level RLS policies.

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification
- [x] RLS / access model covers all CRUD operations
- [x] No plaintext storage of secrets (`CRON_SECRET` is env var only)
- [x] SECURITY DEFINER functions require `SET search_path = ''`
- [x] `origin_label` immutability enforced at authoring boundary, documented on consumer contract
- [x] Casino-scoped tenancy enforced on all three new tables
