# GitNexus as Split-Brain Evidence Engine

GitNexus is a code knowledge graph (MCP server, `mcp__gitnexus__*`) over the PT-2 repo. For this skill it is the **fastest path to the one question this authority lives on: "where else is this fact computed, written, or named?"** A split-brain is by definition a *graph* property (two independent nodes producing one fact), and grep sees text while the graph sees the producer/consumer/call edges text hides. Use it to *find* fracture candidates and gather `file:line` evidence; use Read/Grep to confirm what the graph points at. **Graph output is a lead, never a verdict** — never write a SIGP disposition on graph rows alone; cite the Read-confirmed diverging formula.

## What the live index actually supports (smoke-tested 2026-06-22 index)

PT-2 is a TypeScript / Next.js / Supabase codebase, and that shapes which graph operations are load-bearing here. Calibrated against the live index (49k nodes, `embeddings: 0` so ranking is BM25-only):

- **Strongest signals — lean on these:**
  - **Same-symbol-name across multiple files** (`cypher`) — the single most productive split-brain probe in PT-2. It directly surfaced valuation/balance/win-loss functions living in two files at once. This is your projection-drift / vocabulary-overload / dual-implementation detector.
  - **Function-name search** (`cypher` with `toLower(...) CONTAINS`) — maps a concept to its real producers/surfaces fast.
  - **`CALLS` caller/callee enumeration** (`cypher`, `context`, `trace`, `impact`) — well-populated; reliable for "who invokes this derivation" and "how far does it reach."
  - **`query`** — useful, but read the `definitions` and `process_symbols` arrays (real domain symbols), **not** the top `processes` summaries — with embeddings off, error-handling boilerplate (`GET → DomainError`) ranks highest and is noise.
- **Weak signals — do NOT rely on absence here:**
  - **`ACCESSES {reason:'write'}`** captures TS *class-field mutation* only (~25 edges, mostly error/circuit-breaker state). PT-2's domain facts (`balance`, `point_value`, `win_loss`) are written through Supabase RPCs and DTO objects, so they do **not** appear as Property-write edges. Do not conclude "only one writer" from an empty ACCESSES result — that is a blind spot, not a clearance.
  - **`shape_check` / `api_impact` mismatch detection** is thin: most routes lack extracted `responseKeys`, and consumers are React hooks fetching through wrappers, so consumer edges are under-attributed. A clean `shape_check` is not proof of surface honesty.

## Operational preconditions

- The repo is pre-indexed from `main` (see the `gitnexus-operational-state` memory for the current epoch). The index does **not** reflect your worktree's uncommitted edits — for "what does my in-progress change fracture?" use `detect_changes` (it accepts `worktree`), not `query`/`cypher`.
- `mcp__gitnexus__list_repos` confirms the repo name; with a single indexed repo you may omit `repo`.
- `labels(n)` returns blank in this graph — don't filter on it; label filters inside MATCH patterns (`(p:Property)`, `(b:Function)`) do work. Read `gitnexus://repo/{name}/schema` if a query shape is unfamiliar.

## Tool → diagnostic-step map

The six-step sequence in SKILL.md ("Detect → Classify → Rate → Match → Route → Disposition") gains a gitnexus move at each evidence-bearing step:

| Step | gitnexus move | What it surfaces |
|---|---|---|
| **1. Detect** (provenance test) | `cypher` same-name-across-files; `cypher` function-name search; `query` a concept (read `definitions`) | A second producer/derivation of one fact = the raw split-brain signal |
| **2. Classify** | `context` on each candidate (callers, callees, process participation, module) | Distinguishes *aggregate split-brain* (two real impls) from *projection drift* (two recomputes) from benign facade-delegation |
| **3. Rate severity** | `impact(target, direction:'upstream')` | Blast radius = literal **propagation danger**. Many affected processes/modules ⇒ S3+; a surface or compliance path in the radius ⇒ S4+ |
| **4. Match cure** | `trace` ("does the estimate reach render?"); `route_map` for the surface inventory | Confirms dual-write (→ outbox) vs competing-derivation (→ single-owner) vs surface (→ rendering contract) |
| **5. Route** | `context` to name the owning module/community precisely | Hands the lane authority a symbol + `file:line`, not a vague domain |
| **6. Disposition** | `cypher` to inventory remaining competing paths | Evidence for the containment list — *what must not stay live* |

## Fracture-type → probe

Graph fingerprints to start from, then Read to confirm.

| Fracture | Probe |
|---|---|
| **Aggregate Split-Brain** | Same fact-bearing function name in two modules (recipe 1); confirm both genuinely implement (not facade→impl) by Read |
| **Projection Drift** | `query` the derived concept → two symbols in `definitions` computing it in different files; Read both formulas |
| **Authority Ambiguity** | `context` the producers — do they tag `actual` vs `estimate`/`observed`, or all share one name? |
| **Surface Misrepresentation** | `route_map` the surface; Read the handler — does it render a partial/derived value as authoritative? (`shape_check` is a weak corroborator here, not primary) |
| **Vocabulary Overload** | recipe 1 — one term as multiple distinct symbols across modules (e.g. `WinLossTrendChart` ×2) |
| **Lifecycle Ambiguity** | function-name search for `status`/`close`/`active`/`final` handlers spanning two contexts; `context` their modules |
| **Attribution Ambiguity** | `context` the producers — is `casino_id`/`player_id`/`gaming_day` on every producer's path or only some? |
| **Propagation Ambiguity** | function-name search for the outbox emit; `impact` downstream — do consumers bind a stable category or reach back into authoring? |
| **Reconciliation Leak** | `trace` from a settlement/export symbol back to its source — does it imply external truth nothing reconciles? |
| **Domain Boundary Leak** | `trace`/`context` — a function in module A calling into a write path owned by module B |

## High-value Cypher recipes (smoke-tested)

**1. Same fact-bearing name in two+ files — the primary PT-2 split-brain probe:**
```cypher
MATCH (f:Function)
WHERE toLower(f.name) CONTAINS 'valuation' OR toLower(f.name) CONTAINS 'balance'
   OR toLower(f.name) CONTAINS 'winloss' OR toLower(f.name) CONTAINS 'pointvalue'
WITH f.name AS fn, collect(DISTINCT f.filePath) AS files
WHERE size(files) > 1
RETURN fn, files
```
Live result included `getActiveValuationCentsPerPoint`, `getBalance`, `reconcileBalance` in *both* `services/loyalty/crud.ts` and `services/loyalty/index.ts`, and `WinLossTrendChart` in two component files. Then **Read each pair** — a facade method delegating to a crud impl is benign; two independent computations of the same fact is the fracture.

**2. Map a concept to its real producers/surfaces:**
```cypher
MATCH (f:Function)
WHERE toLower(f.name) CONTAINS 'loyalty' OR toLower(f.name) CONTAINS 'accru'
RETURN f.name AS fn, f.filePath AS path LIMIT 25
```

**3. Every caller of a contested derivation (caller inventory / suppression evidence):**
```cypher
MATCH (a)-[:CodeRelation {type:'CALLS'}]->(b:Function {name:'getActiveValuationCentsPerPoint'})
RETURN a.name AS caller, a.filePath AS path
```
Live result: `issueComp` (crud.ts) + the service-facade method. Use the same shape to prove a legacy path still has callers.

**4. Field-write probe (use with the caveat above):**
```cypher
MATCH (f)-[r:CodeRelation {type:'ACCESSES', reason:'write'}]->(p:Property)
WHERE p.name = 'state'        // works for TS class-field state; NOT for DB-backed facts
RETURN f.name, f.filePath
```
Only meaningful for in-memory class fields (error state, circuit breakers). For DB-backed facts, use recipes 1–3 instead.

## Worked micro-example (loyalty, the live S4 candidate)

The remediation surface lists loyalty as "balance-cache vs ledger drift; accrual writes ledger but emits no outbox." To turn that prose into `file:line` evidence on the live index:

1. **Recipe 1** on `balance`/`valuation` → `getBalance`, `reconcileBalance`, `getActiveValuationCentsPerPoint` each in `crud.ts` *and* `index.ts`. Read each pair: confirm which are facade-delegations (benign) and whether cache vs ledger reads diverge (the fracture).
2. **Recipe 2** (`query "loyalty point value valuation"`, read `definitions`) → surfaced `getValuationRate`/`updateValuationRate` (http.ts), `getActiveValuationPolicy` (crud.ts), and the `LoyaltyLiability` shift-report section — the live-S4 surface. Read it to see if it recomputes valuation.
3. **`impact`** on the valuation function, `upstream` → how many surfaces depend on it ⇒ severity.
4. Route the diagnosis (with these symbols) to `system-canon-propagation-authority` / `financial-model-authority`; do **not** re-decide the end-state here.

Three-to-four graph calls replaced a multi-file manual hunt — but the SIGP finding still cites the Read-confirmed formulas, not the graph rows.
