# GitNexus as Propagation-Map Evidence Engine

GitNexus is a code knowledge graph (MCP server, `mcp__gitnexus__*`) over the PT-2 repo. For this skill it is the **instrument that makes the completion check honest.** This authority's defining reflex is "maturity is not completion" — and the only way to prove a pattern is a `propagated_standard` (not a `proven_exemplar` that *looks* done) is to enumerate **every** producer and consumer of a fact and confirm each conforms, migrates, suppresses, or is deleted. That enumeration is a graph traversal. The lane maps (`LANE-TIA.md`, `LANE-FINANCIAL.md`, `LANE-SPLITBRAIN.md`) demand `file:line` evidence for every node and seam; gitnexus produces exactly that.

The governing discipline: **the register is the claim; the graph is the audit.** If the register lists 4 producers and the graph finds 6, the register is wrong and that gap is your first finding (unmapped work cannot proceed — directive §12). But **graph output is the audit lead, not the ruling** — confirm by Read before certifying.

## What the live index actually supports (smoke-tested 2026-06-22 index)

PT-2 is a TypeScript / Next.js / Supabase codebase, and that shapes which graph operations are load-bearing here. Calibrated against the live index (49k nodes, `embeddings: 0` so ranking is BM25-only):

- **Strongest signals — lean on these:**
  - **Same-symbol-name across multiple files** (`cypher`) — the fastest producer/consumer census probe. It surfaced valuation/balance functions duplicated across `crud.ts` + `index.ts` in one call.
  - **Function-name search** (`cypher` with `toLower(...) CONTAINS`) — maps a pattern's real producers and surfaces.
  - **`CALLS` enumeration** (`cypher`, `context`, `impact`) — well-populated; reliable for "every caller of the canonical owner" and the **suppression audit** ("does the legacy path still have callers?"), which is its single highest-value use here.
  - **`route_map`** — returned the full 133-route surface inventory (every `/api/v1/loyalty/*`, `/api/internal/outbox-relay`, etc.); excellent for the consumer-surface census and the handler→flow map.
  - **`query`** — useful, but read the `definitions`/`process_symbols` arrays, **not** the top `processes` (error-handling boilerplate ranks highest with embeddings off).
- **Weak signals — do NOT certify on absence here:**
  - **`shape_check` / `api_impact` mismatch detection** is thin: most routes lack extracted `responseKeys`, and consumers are React hooks fetching through wrappers, so consumer edges are under-attributed (only ~1 route currently has both shape + consumer data). Use `route_map` + Read the handler/hook to certify a consumer renders the canonical DTO; do not treat a clean `shape_check` as consumer certification.
  - **`ACCESSES {reason:'write'}`** captures TS class-field mutation only (~25 edges), not DB-backed facts written via Supabase RPC. Empty ≠ "single producer."

## Operational preconditions

- The index reflects committed `main`-repo code, not worktree edits (see the `gitnexus-operational-state` memory for the epoch). For §19 PRD/slice review of in-progress changes use `detect_changes` (accepts `worktree`).
- `mcp__gitnexus__list_repos` confirms the repo name; omit `repo` when one repo is indexed. `labels(n)` returns blank — don't filter on it; label filters inside MATCH patterns work. Read `gitnexus://repo/{name}/schema` if a shape is unfamiliar.

## Tool → oversight-step map

The SKILL.md sequence ("Locate → Classify maturity → Check 5 proof obligations → Run gate → Route → Disposition + register update") gains a gitnexus move at each evidence-bearing step:

| Step | gitnexus move | What it certifies |
|---|---|---|
| **1. Locate on the map** | `cypher` function-name/same-name search; `query` (read `definitions`) | Whether the work is represented in the register, or is **unmapped** (first finding) |
| **2. Classify maturity** | `impact(owner, direction:'downstream')` | How far the standard actually reaches vs where legacy still lives |
| **3a. Producer-capability** | `cypher` same-name census; `context` each producer | Every mapped producer emits the canonical artifact |
| **3b. Consumer certification** | `route_map` the surface + Read the handler/hook (`shape_check` weak-corroborator only) | Real surfaces render the canonical DTO **without recomputing** (AP-3 detector) |
| **3c. Suppression** | `cypher` `CALLS` into the legacy symbol; `impact` on it | Competing visible paths are removed/unreachable (AP-4 detector) — the strongest live-index use |
| **3d. Workflow certification** | `route_map` + `trace` operator-entry → canonical RPC | The *real operator workflow* invokes the canonical path and supplies anchors |
| **4. Run gate** | `detect_changes(worktree:…)` → affected symbols/processes | The §19 PRD's claimed affected nodes/edges match what the diff touches |
| **5. Route** | `context` to name owner module precisely | Hands the lane authority a symbol + `file:line` |
| **6. Register update** | `cypher` node/edge inventory | The new/removed/suppressed nodes the register must record |

## The five proof obligations as graph queries

The directive (§14) forbids one "done" flag. Three classes are graph-auditable here (the other two — mechanism-proof I1–I4 — you *inherit* from the slice's `build-pipeline` exemplar proof):

- **Producer-capability** — recipe 1: every producer of the fact; diff against the register's `nodes:`.
- **Consumer-certification** — `route_map` + Read each consuming hook/handler: does it render the canonical DTO or recompute? (graph consumer edges are sparse — Read is the certifier, not `shape_check`.)
- **Suppression** — recipe 3: zero remaining live callers of the legacy path, or callers are themselves slated nodes. This is where the live index is most trustworthy.

If any class surfaces edges you didn't expect, the pattern is **not** `propagated_standard` — name the honest edge (almost always consumer or suppression) and rule accordingly.

## High-value Cypher recipes (smoke-tested)

**1. Producer census — same fact-bearing name across files (vs the register's node list):**
```cypher
MATCH (f:Function)
WHERE toLower(f.name) CONTAINS 'valuation' OR toLower(f.name) CONTAINS 'balance'
WITH f.name AS fn, collect(DISTINCT f.filePath) AS files
WHERE size(files) > 1
RETURN fn, files
```
Live result: `getActiveValuationCentsPerPoint`, `getBalance`, `reconcileBalance`, `getActiveValuationPolicy` in both `services/loyalty/crud.ts` and `services/loyalty/index.ts`. Diff against the register's loyalty `nodes:`; Read each pair to separate facade-delegation (one logical producer) from a genuine second producer (unmapped node).

**2. Map a pattern's producers/surfaces:**
```cypher
MATCH (f:Function)
WHERE toLower(f.name) CONTAINS 'loyalty' OR toLower(f.name) CONTAINS 'accru'
RETURN f.name AS fn, f.filePath AS path LIMIT 25
```

**3. Suppression audit — is the legacy path still reachable?**
```cypher
MATCH (a)-[:CodeRelation {type:'CALLS'}]->(b:Function {name:'legacyComputeWinLoss'})
RETURN a.name AS caller, a.filePath AS path
```
Non-empty = competing visible semantics still live ⇒ suppression **not** proven (the TIA P0 gate). (Same shape confirmed live against a real owner: `getActiveValuationCentsPerPoint` ← `issueComp`.)

**4. Seam trace — what crosses a cross-domain boundary:** `trace(from:'<operator/close call>', to:'<accrual/outbox emit>')` returns the hop chain with `file:line`; then `impact` to judge atomicity. The RS `seam_rs_close_accrual` escalation is exactly this — a non-atomic swallowed-error call the trace exposes hop by hop.

**5. §19 PRD verification:** `detect_changes(scope:'all', worktree:'<path>')` → compare affected symbols/processes against the PRD's declared `canon_propagation` nodes/edges. A diff touching a producer the block didn't cite = an incomplete §19 block.

## Worked micro-example (the loyalty_liability_slice completion check)

The snapshot says `tia_projection` and friends are `standardized_pattern`/**partial** — none yet `propagated_standard`. To verify (not assume) loyalty's state before clearing the next slice, on the live index:

1. **Recipe 1** on valuation/balance → full producer set; diff against the register's loyalty `nodes:`. Extras (e.g. a second `getBalance` impl that isn't a facade) = unmapped producers ⇒ §12 finding.
2. **`route_map`** + Read the `LoyaltyLiability` shift-report section and `/api/v1/loyalty/valuation-policy` handler → does the live-S4 surface render the canonical valuation DTO or recompute? Recompute ⇒ consumer-certification fails (AP-3).
3. **Recipe 3** on any legacy valuation path → still called? ⇒ suppression fails (AP-4).
4. **`trace`** the RS close → accrual seam → confirm the B-leaning-C atomicity gap hop by hop.
5. Rule: **Cleared with named next slice** or **Blocked**, and update `SYSTEM-CANON-PROPAGATION-REGISTER.yaml` with any nodes the graph surfaced that the register lacked.

Three-to-five graph calls replace a multi-file manual census — but the ruling cites the Read-confirmed surfaces and the register diff, not raw graph rows.
