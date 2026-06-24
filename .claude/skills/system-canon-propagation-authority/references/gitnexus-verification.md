# GitNexus Verification Reference

The register and map are a *model* of the code. Models drift. This file is how you check the model against ground truth **before** you rule — because the one authority above the register is the code itself.

## Why this is mandatory, not optional

On 2026-06-22, verifying the `loyalty_liability_slice` mapping with GitNexus refuted a register edge that the prose *and* the register agreed on — both said the liability snapshot reads `loyalty_ledger`; the migration showed it actually aggregates `player_loyalty.current_balance` (the L-03 cache). No amount of prose-vs-register arbitration would have caught this, because the drift was *shared*. It also surfaced two unmapped nodes (a third render surface — the PDF — and the re-pricing producer `updateValuationPolicy`). A "cleared to proceed" ruling issued on the unverified register would have authorized a slice scoped on three false premises.

The lesson: **`register > prose` is the rule for resolving documentation disagreements. `code > register` is the rule for resolving truth.** A clearing ruling that has not been checked against the code is an opinion about a model, not a finding about the system.

## When a scan is required before ruling

Run a GitNexus scan whenever the ruling will assert something about *current code state*:

- **Selecting or clearing a slice** — verify §12 bounded-map completeness against code: do the mapped producers/consumers/seams actually exist, and do they have the source the edge claims? (the cache-vs-ledger class of error)
- **Accepting a "done" / proof-obligation claim** — verify producer-capability, consumer-certification, and suppression against code, not against the register's own flags. The register's `PROVEN`/`FAILING` markers are claims to be checked, not evidence.
- **Certifying a seam** — verify the `transaction_boundary` in code (atomic? same-txn? fire-and-forget?). This is exactly where the RS close→accrual seam failed.
- **Reviewing a PRD's §19 block** — verify `affected_nodes` / `affected_edges` are real and complete; surface any producer/consumer the PRD omitted.

It is fine to **skip** the scan for pure-doctrine questions that touch no node/edge state ("what does the expansion gate require?", "which lane owns fact classes?"). Those are answered from the directive, not the code.

## How to run it — tool surface and the reliable path

GitNexus exposes both an MCP server and a local CLI. **As of 2026-06-22 the MCP server is tested-healthy but its tools are not surfaced to the Claude Code session.** A direct stdio JSON-RPC probe confirmed the server works end-to-end: `initialize` → `gitnexus 1.6.8`, `tools/list` → 17 tools (`query, cypher, context, impact, detect_changes, explain, trace, check, rename, pdg_query, route_map, tool_map, shape_check, api_impact, group_list, group_sync, list_repos`), and live `tools/call` for both `context` and `cypher` returned correct structured results matching the CLI. **However**, those tools are *not* exposed as callable functions in-session — `claude mcp list` shows `gitnexus ✔ Connected`, yet `ToolSearch` does not surface them (likely a session/registration lag; a fresh session may pick them up). So the server is not the problem; the in-session tool surface is. **Until the tools actually appear as callable functions for you, treat the CLI as the reliable path** (the analytical pattern and output are identical to the MCP tools):

```bash
node .gitnexus/run.cjs cypher "<query>"      # precise node/file enumeration — the workhorse
node .gitnexus/run.cjs context "<symbol>"    # callers/callees/processes for one symbol
node .gitnexus/run.cjs impact  "<symbol>"    # blast radius before asserting a change is bounded
node .gitnexus/run.cjs trace   "<from>" "<to>"  # shortest call path between two symbols
node .gitnexus/run.cjs query   "<concept>"   # FTS — see caveat below; often weak
```

If the MCP tools *are* callable in your session, prefer them (richer structured output) and fall back to the CLI on any error. Either way the analytical pattern is identical.

### Known caveats (do not be misled)

- **FTS `query` is frequently load-only / low-signal.** It returned generic `GET → DomainError` noise on the liability audit. Use `cypher` for exact enumeration and **read the actual source / migration for decisive evidence**. GitNexus is a navigator that gets you to the right files fast; the proof is in reading them. It is not an oracle.
- **The `augment` PreToolUse hook may inject "related symbols"** that are off-target (it surfaced player-360 clipboard + table-context shift-metrics on a loyalty query). Treat as noise unless relevant.
- **The index can be stale.** If results look wrong, check freshness (`node .gitnexus/run.cjs status`) and re-index from the main repo only (`node .gitnexus/run.cjs analyze`), per [[gitnexus-operational-state]].

## The verification pattern (what to actually check)

For each node/edge the ruling depends on, ask the graph then confirm in source:

1. **Does the node exist in code, and where?**
   `cypher "MATCH (n) WHERE n.name =~ '(?i).*<concept>.*' RETURN n.name, n.filePath, n.startLine LIMIT 40"`
   — enumerate the real producers/consumers/surfaces. Count them. Compare to the register's node list. **A surface in code with no node is a mapping gap** (the PDF-section finding).

2. **Does the edge's claimed source/boundary match the code?**
   Open the producing RPC / function / migration and read what it *actually* reads and writes. The register says `from: X`; the code may read `Y`. Re-state the edge to the real source and flag the divergence.

3. **Do the consumers recompute or render?**
   Read each consumer surface. Rendering a server DTO → no AP-7. Recomputing from raw stores → AP-7, and the consumer-cert obligation is larger than the register implies.

4. **Is the "as-of" / temporal claim real?**
   A table with version columns does not mean the producer resolves as-of. Check for an actual temporal filter in the query. (The liability snapshot stamped live figures with a date and a policy version — versioned table, live computation.)

## After the scan — close the loop

- **Record provenance.** Add a `last_verification` note to the register `meta:` (date, method, outcome) and a one-line verification line to the map header, so the next session knows what was checked against code and when.
- **Apply corrections as register edits**, then reconcile the map (register first, prose second — per the artifacts rule). New/renamed nodes: fix every `fracture_crosswalk` and `edges` reference too, or you leave dangling IDs. Re-validate the YAML parses.
- **Report GitNexus efficacy honestly** in the ruling: what it refuted vs confirmed, and where the decisive evidence actually came from (graph vs. reading source). This keeps the program honest about how much trust the tool has earned.

## Worked example (2026-06-22, liability slice)

| Check | Register said | Code showed (evidence) | Action |
|---|---|---|---|
| Snapshot source | `loyalty_ledger → snapshot` | `SUM(player_loyalty.current_balance)` = L-03 cache (`migrations/20260307115101`) | edge re-sourced to `loyalty_balance_cache`; flag `LIABILITY-SNAPSHOT-CACHE-SOURCED` |
| As-of | "as-of versioned snapshot" | no temporal filter on balance or policy; live figures stamped | proof-obligation caveat added |
| Consumers | 1 shift-report node | 3 surfaces (widget + HTML + **PDF**) all reading `LoyaltyLiabilitySection` | node split; PDF node added |
| Re-pricing producer | (none) | `updateValuationPolicy` (`crud.ts:712`) | node `valuation_policy_producer` added |
| Version columns | "table already carries them" | confirmed (`schema lines 38-39`) | claim verified TRUE |

Net: still the right next slice, but not as independent or cheap as scored — and that correction only existed because the code was consulted.
