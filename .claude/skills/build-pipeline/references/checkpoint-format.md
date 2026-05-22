# Checkpoint Format Specification

This document defines the checkpoint file format for build pipeline state management.

---

## Overview

Checkpoint files track pipeline progress, enabling resume from failure and providing visibility into execution state. Each PRD execution has exactly one checkpoint file.

## File Location

```
.claude/skills/build-pipeline/checkpoints/{PRD-ID}.json
```

Example: `.claude/skills/build-pipeline/checkpoints/PRD-003.json`

---

## Schema

### Full Checkpoint Schema

```typescript
interface PipelineCheckpoint {
  // Identity
  prd: string;                    // PRD identifier (e.g., "PRD-003")
  prd_title: string;              // Human-readable title

  // Execution State
  current_phase: number;          // 0 = initialized, 1+ = phase number
  status: CheckpointStatus;       // Pipeline status

  // Workstream Tracking
  completed_workstreams: string[];    // ["WS1", "WS2"]
  in_progress_workstreams: string[];  // ["WS3"] - currently executing
  pending_workstreams: string[];      // ["WS4", "WS5"] - not yet started
  dormant_workstreams: string[];      // ["WS8"] - in the spec but not scheduled for this run; accounted for, excluded from resume scan

  // Artifacts (files created per workstream)
  // For dormant workstreams, record { status: "dormant", reason: string } so the deferral rationale survives.
  artifacts: Record<string, unknown>;

  // Gate Tracking
  gates_passed: string[];         // ["schema-validation (WS1)"]
  gates_pending: string[];        // ["test-pass (WS5)"]

  // Metadata
  created_at: string;             // ISO 8601, set once on initialize, never mutated
  updated_at: string;             // ISO 8601, rewritten on every checkpoint mutation

  // Optional: Error Information (on failure)
  error?: {
    workstream: string;
    message: string;
    file?: string;
    line?: number;
  };

  // Optional: Execution Notes
  eslint_fixes?: Array<{
    file: string;
    change: string;
  }>;
  cleanup_done?: string[];
  key_fixes?: Array<{
    file: string;
    change: string;
  }>;
}

type CheckpointStatus =
  | "initialized"     // Checkpoint created, no execution yet
  | "in_progress"     // Execution active
  | "paused"          // User paused at gate
  | "failed"          // Workstream/gate failed
  | "complete";       // All workstreams done
```

---

## Lifecycle States

### State Transitions

```
initialized → in_progress → paused → in_progress → complete
                    ↓          ↑
                  failed ──────┘ (after manual fix)
```

### State Descriptions

| Status | Description | Next Action |
|--------|-------------|-------------|
| `initialized` | Checkpoint created, EXECUTION-SPEC ready, human-approved | Begin phase 1 |
| `in_progress` | Workstreams actively executing | Wait for completion |
| `paused` | User reviewing at gate | User approves to continue |
| `failed` | Workstream or gate failed | Manual fix, then resume |
| `complete` | All workstreams and gates passed | Update MVP-ROADMAP |

---

## Checkpoint Operations

### 1. Initialize (After EXECUTION-SPEC)

```json
{
  "prd": "PRD-009",
  "prd_title": "Cashier Workflows",
  "current_phase": 0,
  "status": "initialized",
  "completed_workstreams": [],
  "in_progress_workstreams": [],
  "pending_workstreams": ["WS1", "WS2", "WS3", "WS4", "WS5"],
  "dormant_workstreams": [],
  "artifacts": {},
  "gates_passed": [],
  "gates_pending": ["schema-validation", "type-check", "lint", "test-pass"],
  "created_at": "2025-12-11T10:00:00Z",
  "updated_at": "2025-12-11T10:00:00Z"
}
```

### 2. Start Workstream

```json
{
  "status": "in_progress",
  "in_progress_workstreams": ["WS1"],
  "pending_workstreams": ["WS2", "WS3", "WS4", "WS5"],
  "updated_at": "2025-12-11T10:05:00Z"
}
```

### 3. Complete Workstream

```json
{
  "completed_workstreams": ["WS1"],
  "in_progress_workstreams": [],
  "artifacts": {
    "WS1": [
      "supabase/migrations/xxx.sql",
      "services/domain/dtos.ts",
      "services/domain/schemas.ts"
    ]
  },
  "updated_at": "2025-12-11T10:15:00Z"
}
```

### 4. Pass Gate

```json
{
  "current_phase": 1,
  "gates_passed": ["schema-validation (WS1)"],
  "gates_pending": ["type-check", "lint", "test-pass"],
  "status": "paused",
  "updated_at": "2025-12-11T10:16:00Z"
}
```

### 5. Parallel Workstreams In Progress

```json
{
  "status": "in_progress",
  "in_progress_workstreams": ["WS2", "WS3"],
  "pending_workstreams": ["WS4", "WS5"],
  "updated_at": "2025-12-11T10:20:00Z"
}
```

### 6. Failure State

```json
{
  "status": "failed",
  "in_progress_workstreams": [],
  "error": {
    "workstream": "WS3",
    "message": "Property 'player_id' does not exist on type 'PlayerDTO'",
    "file": "services/player/index.ts",
    "line": 45
  },
  "updated_at": "2025-12-11T10:25:00Z"
}
```

### 7. Complete State

```json
{
  "prd": "PRD-009",
  "prd_title": "Cashier Workflows",
  "current_phase": 5,
  "status": "complete",
  "completed_workstreams": ["WS1", "WS2", "WS3", "WS4", "WS5"],
  "in_progress_workstreams": [],
  "pending_workstreams": [],
  "dormant_workstreams": [],
  "artifacts": {
    "WS1": ["migration.sql", "dtos.ts"],
    "WS2": ["index.ts", "keys.ts"],
    "WS3": ["route.ts"],
    "WS4": ["hooks/index.ts"],
    "WS5": ["*.test.ts"]
  },
  "gates_passed": [
    "schema-validation (WS1)",
    "type-check (WS2)",
    "lint (WS3)",
    "type-check (WS4)",
    "test-pass (WS5)"
  ],
  "gates_pending": [],
  "created_at": "2025-12-11T10:00:00Z",
  "updated_at": "2025-12-11T11:00:00Z"
}
```

### 8. Dormant Workstream (Deferred Slice)

A workstream in the spec that isn't scheduled for this run — e.g., a slice waiting on a lead-architect amendment, or a Could/FR tripwire that's moot given other workstreams. The workstream is **tracked** (it appears in the graph and counts against the consistency check) but is **excluded** from resume scans and gate completion requirements. Record the reason on the artifact entry so the deferral rationale survives.

```json
{
  "status": "complete",
  "completed_workstreams": ["WS1", "WS2", "WS3", "WS4", "WS5"],
  "in_progress_workstreams": [],
  "pending_workstreams": [],
  "dormant_workstreams": ["WS6"],
  "artifacts": {
    "WS1": ["migration.sql"],
    "WS6": {
      "status": "dormant",
      "reason": "Could/FR tripwire moot — PRD eliminated all JS computation, leaving no dual-path to compare. WS5 verifies helper-to-RPC contract directly."
    }
  },
  "gates_passed": ["schema-validation (WS1)", "test-pass (WS5)"],
  "gates_pending": [],
  "created_at": "2026-02-02T19:00:00Z",
  "updated_at": "2026-02-03T03:15:00Z"
}
```

**Dormant vs skipped naming:** `dormant_workstreams` is canonical going forward. The `skipped_workstreams` spelling appears once in the historical archive (PRD-027); treat it as a legacy synonym when reading old checkpoints — it means the same thing.

---

## File Operations

### Read Checkpoint

```bash
cat .claude/skills/build-pipeline/checkpoints/PRD-009.json | jq
```

### Check If Checkpoint Exists

```bash
test -f .claude/skills/build-pipeline/checkpoints/PRD-009.json && echo "exists" || echo "not found"
```

### Create Checkpoint Directory

```bash
mkdir -p .claude/skills/build-pipeline/checkpoints
```

---

## Resume Logic

When `/build PRD-XXX --resume` is invoked:

1. **Load checkpoint**: Read `.claude/skills/build-pipeline/checkpoints/PRD-XXX.json`
2. **Check status**:
   - `complete` → Error: "PRD-XXX already complete"
   - `failed` → Show error, ask if fixed, then continue
   - `paused` → Show last gate, continue from next phase
   - `in_progress` → Show warning, ask to restart or continue
3. **Determine resume point**:
   - Find the first phase containing workstreams in `pending_workstreams` **or** `in_progress_workstreams`.
   - Workstreams in `completed_workstreams` and `dormant_workstreams` are excluded from the scan — dormant workstreams are tracked for accounting but are not scheduled for execution in this run. Reactivating a dormant workstream requires a spec amendment that moves it back into `pending_workstreams`.
   - Continue from that phase.
4. **Display state** (show dormant entries so operators know what's deferred and why):
   ```
   Resuming PRD-009 from Phase 2

   Completed:
     WS1: Database Layer ✅

   Pending:
     WS2: Service Layer
     WS3: Route Handlers
     WS4: Hooks
     WS5: Tests

   Dormant (not scheduled this run):
     WS6: Observability tripwire — moot, verified directly by WS5
   ```

---

## Validation Rules

### Required Fields

- `prd` - Must match pattern `PRD-\d{3}` (also accepts `EXEC-`, `ADR-`, `FIB-`, `GAP-`, `PERF-`, `ISS-` prefixes in practice — the field is the intake identifier, not strictly a PRD).
- `status` - Must be valid CheckpointStatus
- `created_at` - Must be valid ISO 8601. Set once on initialize; never mutated afterward.
- `updated_at` - Must be valid ISO 8601. Rewritten on every checkpoint mutation. On a fresh checkpoint, `updated_at == created_at`.

### Consistency Rules

- `completed_workstreams` + `in_progress_workstreams` + `pending_workstreams` + `dormant_workstreams` must equal all workstreams from the EXECUTION-SPEC's active graph. The four buckets are disjoint — a workstream appears in exactly one.
- `gates_passed` + `gates_pending` must equal all gates from EXECUTION-SPEC. Gates owned solely by dormant workstreams are excluded from the gate graph for this run.
- `artifacts` keys must be a subset of `completed_workstreams ∪ dormant_workstreams`. Dormant entries should carry `{ "status": "dormant", "reason": string }` so the deferral rationale survives.
- If `status` is `failed`, `error` field is required.
- `updated_at >= created_at` must hold.

### Status-Specific Rules

| Status | in_progress_ws | error |
|--------|----------------|-------|
| `initialized` | empty | none |
| `in_progress` | non-empty | none |
| `paused` | empty | none |
| `failed` | empty | required |
| `complete` | empty | none |
