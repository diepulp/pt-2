# RFC-SERVER-CSV-INGESTION — Delta Patch (Audit Remediation)

> This file is a **delta patch**: drop-in wording/sections to apply to `RFC-SERVER-CSV-INGESTION.md`.
> It does **not** redesign the RFC; it tightens contracts and removes ambiguity.

---

## 1) Clarify `staging` semantics (stop calling it “legacy”)

### Replace / amend wording wherever `staging` is described as “legacy”
**Before (problematic intent):**
- “`staging` is a legacy value from the client-side flow…”

**After (recommended):**
- “`staging` is the **canonical ‘ready-to-execute’ state** for a batch.  
  It indicates that all `import_row` staging writes are complete and the batch can be safely consumed by `rpc_import_execute`, regardless of whether staging was performed by client or worker.”

### Add a short rule under **Batch lifecycle / statuses**
- “`staging` (terminal for ingestion) means: the worker has finished parsing, all chunk inserts are committed, and progress counters are final.”

---

## 2) Specify the actual streaming download method (Supabase Storage in Node)

### Add a subsection under **Worker: File retrieval**
**Add:**

#### Storage streaming method (Node runtime)
The worker **must** stream the CSV from storage without buffering the full file in memory.

**Implementation contract (choose one and codify it):**
- **Preferred:** Generate a **signed URL** for the object, then stream via Node `fetch()`:
  - `const { data } = await supabase.storage.from('imports').createSignedUrl(path, expiresIn)`
  - `const res = await fetch(data.signedUrl)`
  - Use `res.body` as a readable stream into `csv-parse`
- **Alternative:** Use an object-store SDK that returns a Readable stream (S3/R2 compatible).

**Explicit non-goal (MVP):**
- Do not rely on `storage.download()` if it returns a buffered Blob/ArrayBuffer in your runtime.

> Note: If you decide to use `download()` anyway, document whether it buffers and cap file sizes accordingly.

---

## 3) API surface clarity: “No new endpoint” vs upload endpoint

### Update **API Surface** section
**Add/replace:**
- “A new upload endpoint is required:
  - `POST /api/v1/player-import/batches/:id/upload` (multipart)  
  This endpoint validates `casino_id`, stores the object, records `storage_key`, checksum, size, and transitions batch `created → uploaded`.”

- “No new **polling** endpoints are required: existing batch detail endpoints remain the source for progress/status.”

---

## 4) Enforce INV-W* invariants (not just prose)

### Add a subsection under **Security / correctness**
**Add:**

#### Invariant enforcement (how we prevent drift)
To ensure the worker’s service-role access does not cause cross-casino leakage:

- All worker writes go through a single repository module (e.g., `ImportBatchRepo`) whose methods require:
  - `batch_id` **and** `casino_id` (derived from the claimed batch row)
- Repository methods must include:
  - `WHERE id = $batch_id` on batch updates
  - inserts to `import_row` always include `import_batch_id` and `casino_id` from the batch row
- Tests:
  - Integration test creates two casinos + two batches; asserts worker never writes rows under the wrong `casino_id`
  - “No naked update” test: grep/lint rule forbids `UPDATE import_batch` without `WHERE id =` (or equivalent structured query helper)

---

## 5) Enum migration note: don’t rely on enum order

### Patch the **Migration notes** where enums are added `BEFORE 'staging'`
**Add a note:**
- “Enum ordering is cosmetic. Code must not rely on enum order.  
  Prefer simple enum additions (forward-only). If `BEFORE` causes migration friction across branches, remove `BEFORE`.”

---

## 6) Storage key hygiene (file_name collisions and weird chars)

### Patch **Upload / storage key** section
**Replace:**
- `imports/{casino_id}/{batch_id}/{file_name}`

**With:**
- `imports/{casino_id}/{batch_id}/{upload_id}.csv` (or `{checksum_prefix}.csv`)
- Store `original_file_name` on `import_batch` for UI display
- Sanitize and normalize file name only for display (never trust as a key)

---

## 7) 10k cap enforcement point (make it explicit)

### Add under **Limits**
**Add:**
- “Row cap enforcement occurs in the **worker** during parsing:
  - On encountering row `BATCH_ROW_LIMIT + 1`, the worker stops consuming the stream and transitions the batch to `failed` with reason `BATCH_ROW_LIMIT`.
  - Rows already staged remain in `import_row` but are inert because the batch is terminal `failed` and UI must disable execute.”

---

## 8) Define “semantic equivalence” normalization contract (preview vs worker)

### Add a new short section: **Normalization Contract**
**Add:**
- “Client preview and worker ingestion must be semantically equivalent under this contract:
  - Header normalization: trim, strip BOM, collapse whitespace; blank headers become `col_{n}`; duplicate headers suffixed `_2`, `_3`, …
  - Field normalization: trim surrounding whitespace; treat empty string as null for optional fields
  - Numeric parsing: allow commas and currency symbols only if explicitly enabled in mapping_spec; otherwise error
  - Dates: parse as ISO-8601 if possible; reject ambiguous locale formats unless mapping_spec declares format
  - Output comparison uses canonical JSON serialization (stable key ordering) to avoid ‘byte-identical’ brittleness.”

---

## 9) Concurrency statement (multiple worker replicas)

### Add one paragraph under **Worker runtime**
**Add:**
- “The system is safe under **N worker replicas**:
  - Batch claim uses `FOR UPDATE SKIP LOCKED`
  - Stage inserts are idempotent via unique constraint on `(import_batch_id, row_number)` (or documented key)
  - Reaper transitions are idempotent and constrained to retryable states.”

---

## 10) “Preview is advisory” rule (prevent authority drift)

### Add to **Client role / Preview**
**Add:**
- “Preview is advisory only. The worker is the **source of truth** for validation, normalization, and staging outcomes.  
  The UI must display worker-derived errors/counters as authoritative.”

---

## Quick checklist (post-patch RFC should clearly state)
- [ ] `staging` is canonical “ready-to-execute”
- [ ] Worker streaming method is specified (and truly streaming)
- [ ] Upload endpoint is acknowledged as new; polling remains unchanged
- [ ] INV-W* invariants have enforcement mechanisms (repo + tests)
- [ ] Enum order not relied upon
- [ ] Storage keys are collision-safe
- [ ] 10k cap failure mode is deterministic
- [ ] “Semantic equivalence” normalization contract is written
- [ ] Safe under multiple worker replicas
- [ ] Preview is non-authoritative
