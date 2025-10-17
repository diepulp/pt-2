-ENGINEERING GUARDRAIL Adopted phases domains Prevent MVP creep abstractions infrastructure YAGNI Single Source Truth Mutator Least Power

Wave 2 production anti-pattern generic bus log rate-limiting consumer violated MVP delayed delivery guardrail canonizes lean

Canonical Anti-Pattern Repeat-AP-01 Premature reusable infrastructure before consumer Abstract store consumer New infra trigger Duplicating idempotency uniqueness constraint Cross-cutting without incident SLO breach ADR

Non-Goals block infra justified prevent surgical hardening forbid extension points LOC infra

Golden Path 2-Domain MVP Workflows producer consumer runtime Call Server calls consumer Authoritative owning service writes state Loyalty points-Level_key UNIQUE index violation success return outcome-Level mutations RPC SELECT UPDATE Return audit log operation correlation_id trigger Mini-ADR (§7)

Red-Flag Checklist-Line two adding abstraction layer consumer Introducing infra Duplicating idempotency DB constraint Creating tables business truth before launch module >150 LOC no problem removing outcomes Yes 2 STOP File Mini-ADR remove layer

Triggers Added Complexity add infra true recorded Concrete Analytics telemetry/SLO latency call target >500 ms profiling evidence Risk met ledger logs ≥2 in-memory state fails test trigger met raise Mini-ADR

Mini-ADR Required Content page §6 trigger 3 bullets Affected modules rollback plan Metrics necessity p95 < 500 remove simplify Tech Lead reviewer

Metrics-to-end ≤500 ms Duplicate-write rate 0 Incidents missing infra >0 LOC delta value infra-only ≤150 LOC Mini-ADR

Implementation Patterns Disallowed Direct service server RPC balance updates Single ledger table audit idempotency_key constraint log correlation_id event bus Persistent event-backed rate limiting Multiple idempotency layers New infra Mini-ADR

Enforcement OE-01 Check §5 require Mini-ADR removal Gate fails OE-01 missing-Merge Weekly scan packages flag ADR

Exceptions Regulatory mandates mitigation-ADR 48 Platform constraints contract capture proof

Wave-2 Dispatcher event consumer Direct call idempotency RPC log complexity value faster delivery

Glossary Authoritative writer domain state intent end state deterministic keys DB uniqueness architecture §7

OE-01-Engineering Guardrail §6 trigger consumer SLO breach compliance Measured evidence incident mandate Idempotency DB Single service domain cross-writes Infra-only change LOC Mini-ADR Proceed Mini-ADR Reject complexity
