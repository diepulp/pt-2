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

  // Artifacts (files created per workstream)
  artifacts: Record<string, string[]>;

  // Gate Tracking
  gates_passed: string[];         // ["schema-validation (WS1)"]
  gates_pending: string[];        // ["test-pass (WS5)"]

  // Metadata
  timestamp: string;              // ISO 8601 timestamp of last update

  // Optional: Error Information (on failure)
  error?: {
    workstream: string;
    message: string;
    file?: string;
    line?: number;
  };

  // Optional: Adversarial Review Result
  adversarial_review?: {
    verdict: "ship" | "ship_with_gates" | "do_not_ship" | "overridden";
    p0_count: number;
    p1_count: number;
    attempt: number;            // 1-based attempt count (max 2)
    findings_path?: string;     // path to full DA report if saved
    override_reason?: string;   // required when verdict is "overridden"
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
| `initialized` | Checkpoint created, EXECUTION-SPEC ready, DA review recorded | Begin phase 1 |
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
  "artifacts": {},
  "gates_passed": [],
  "gates_pending": ["schema-validation", "type-check", "lint", "test-pass"],
  "timestamp": "2025-12-11T10:00:00Z"
}
```

### 2. Start Workstream

```json
{
  "status": "in_progress",
  "in_progress_workstreams": ["WS1"],
  "pending_workstreams": ["WS2", "WS3", "WS4", "WS5"],
  "timestamp": "2025-12-11T10:05:00Z"
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
  "timestamp": "2025-12-11T10:15:00Z"
}
```

### 4. Pass Gate

```json
{
  "current_phase": 1,
  "gates_passed": ["schema-validation (WS1)"],
  "gates_pending": ["type-check", "lint", "test-pass"],
  "status": "paused",
  "timestamp": "2025-12-11T10:16:00Z"
}
```

### 5. Parallel Workstreams In Progress

```json
{
  "status": "in_progress",
  "in_progress_workstreams": ["WS2", "WS3"],
  "pending_workstreams": ["WS4", "WS5"],
  "timestamp": "2025-12-11T10:20:00Z"
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
  "timestamp": "2025-12-11T10:25:00Z"
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
  "timestamp": "2025-12-11T11:00:00Z"
}
```

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
   - Find first phase containing pending workstreams
   - Continue from that phase
4. **Display state**:
   ```
   Resuming PRD-009 from Phase 2

   Completed:
     WS1: Database Layer ✅

   Pending:
     WS2: Service Layer
     WS3: Route Handlers
     WS4: Hooks
     WS5: Tests
   ```

---

## Validation Rules

### Required Fields

- `prd` - Must match pattern `PRD-\d{3}`
- `status` - Must be valid CheckpointStatus
- `timestamp` - Must be valid ISO 8601

### Consistency Rules

- `completed_workstreams` + `in_progress_workstreams` + `pending_workstreams` must equal all workstreams from EXECUTION-SPEC
- `gates_passed` + `gates_pending` must equal all gates from EXECUTION-SPEC
- `artifacts` keys must be subset of `completed_workstreams`
- If `status` is `failed`, `error` field is required

### Status-Specific Rules

| Status | in_progress_ws | error |
|--------|----------------|-------|
| `initialized` | empty | none |
| `in_progress` | non-empty | none |
| `paused` | empty | none |
| `failed` | empty | required |
| `complete` | empty | none |
