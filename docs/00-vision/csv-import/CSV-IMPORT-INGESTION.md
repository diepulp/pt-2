CSV Import Ingestion (Server-Authoritative Staging Using csv-parse)

Status: Proposed
Date: 2026-02-23
Owner: PT-2

Context
We need onboarding file upload for player provisioning and loyalty claim intake. Client-side parsing (Papa/Beamworks) can assist mapping/preview but cannot be the authority (durability, auditability, trust boundary, idempotency, retries). We’re deploying the app on Vercel, which is hostile to long-running parsing inside request handlers (timeouts/limits). We need an ingestion pipeline that is server-owned and streams-first.

Decision
Implement server-authoritative ingestion that stages parsed rows into Postgres. Use csv-parse as the server CSV parser (streams-first) to avoid memory blowups and handle real-world CSV quirks.

Architecture choice (Vercel reality)

Client role:

optional: parse sample/headers for preview + create mapping_spec

upload raw file to storage (Supabase Storage or equivalent)

create/import batch metadata, then poll status

Server ingestion role (authoritative):

a background “ingestion worker” claims import_batch rows and processes them:

stream file from storage

parse with csv-parse

normalize + validate

bulk insert into import_player_stage in chunks

update batch progress and totals

Vercel constraint handling:

Do NOT run full ingestion inside a Vercel route handler (rejected: timeouts)

Run worker as a separate process/service (minimal Node worker) that can reach DB+storage

The Vercel app triggers work by creating import_batch and setting status to uploaded

Worker polls/claims batches (boring, stable)

Data model (minimal)

import_batch: casino_id, created_by, storage_path, mapping_spec, status, totals, error_summary, timestamps

import_player_stage: batch_id, casino_id, row_number, raw_row, normalized, canonical_keys, validation_errors, status

Alternatives considered

Pure client-side parse + direct writes (rejected: trust boundary + no durable audit/retry)

Vercel API route does the whole parse (rejected: unreliable timeouts/limits)

Heavy ELT platforms (NiFi/Airbyte/Kafka) (rejected: we are not building a data platform)

Consequences

One extra moving part (a small worker). Worth it.

Backend never has to “deal with raw CSV” in request/response; the worker handles it via streaming parse.

Produces durable staged rows that feed the Loyalty Reconciliation workflow cleanly.

Enables re-run/retry safely and prevents double-inserts via idempotency constraints.

Decision linkage
This ADR feeds the Loyalty Reconciliation ADR: ingestion produces staged claims; reconciliation is the only path that turns claims into truth.