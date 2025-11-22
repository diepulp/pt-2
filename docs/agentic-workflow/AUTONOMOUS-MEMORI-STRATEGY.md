# Autonomous Memori Integration Strategy

**Version**: 1.0.0
**Date**: 2025-11-21
**Status**: Proposed
**Purpose**: Make Memori fully autonomous without manual agent intervention

---

## Executive Summary

PT-2 has successfully implemented the Memori engine (Phase 2 complete), but it requires **manual activation** by agents. This strategy proposes a **3-layered autonomous architecture** that makes cross-session memory "just work" without explicit agent instructions.

### Current State
- ✅ Memori SDK integrated (`lib/memori/`)
- ✅ Session hooks available (`session_hooks.py`)
- ✅ 11 integration tests passing
- ❌ **Requires manual agent calls** to `on_session_start()` and `on_session_end()`
- ❌ Chatmodes have no Memori initialization instructions
- ❌ Workflows have no Memori enable/disable steps

### Proposed Solution: 3-Layer Autonomy

**Layer 1: Claude Code Hooks** (Fully Autonomous)
- Automatic session initialization via `UserPromptSubmit` hook
- Automatic work recording via `PreToolUse`/`PostToolUse` hooks
- Zero manual intervention required

**Layer 2: Chatmode Instructions** (Explicit Guidance)
- Each chatmode knows when/what to record to Memori
- Fallback if hooks fail
- Educational for agents

**Layer 3: Workflow Integration** (Workflow-Level Automation)
- Workflows explicitly manage Memori state
- Phase transitions auto-recorded
- Validation gates tracked

**Result**: Memori becomes invisible infrastructure that "just works"

---

## Problem Analysis

### Why Manual Activation Fails

**Current Approach** (from lib/memori/README.md):
```python
# Agents must explicitly call this
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("architect")
memori.enable()
# ... do work ...
memori.disable()
```

**Problems**:
1. **Agents forget** - No guarantee agents will call initialization
2. **Inconsistent usage** - Some sessions have memory, some don't
3. **Manual overhead** - Requires explicit instructions in every chatmode
4. **Fragile** - One missed call = lost memory
5. **Not truly cross-session** - If session crashes, no finalization

### What True Autonomy Requires

1. **Automatic initialization** - No agent action needed
2. **Transparent recording** - Work automatically captured
3. **Graceful finalization** - Session end always recorded
4. **Failure resilience** - Works even if hooks fail
5. **Zero cognitive load** - Agents never think about memory

---

## Claude Code Hooks Architecture

### Available Hook Types

Claude Code provides these hook points (from `.claude/hooks/codex-hooks.json`):

```json
{
  "UserPromptSubmit": [],    // Fires when user submits prompt
  "PreToolUse": [],           // Fires before tool execution
  "PostToolUse": []           // Fires after tool execution
}
```

**NOT Available**:
- ❌ `SessionStart` - No native session lifecycle hook
- ❌ `SessionEnd` - No native session end hook
- ❌ `ChatmodeSwitch` - No chatmode transition hook

### Hook-Based Autonomy Strategy

Since `SessionStart`/`SessionEnd` don't exist, we use **stateful initialization**:

#### 1. UserPromptSubmit Hook (Session Initialization)

**File**: `.claude/hooks/memori-init-session.sh`

**Trigger**: First user prompt in session

**Logic**:
```bash
#!/bin/bash
# Check if session already initialized
SESSION_FILE="$CLAUDE_PROJECT_DIR/.memori/.session_active"

if [ ! -f "$SESSION_FILE" ]; then
  # First prompt in session - initialize Memori
  python3 "$CLAUDE_PROJECT_DIR/lib/memori/session_hooks.py" start

  # Mark session as active
  echo "$(date +%s)" > "$SESSION_FILE"

  # Store chatmode (if available in env)
  echo "${CLAUDE_CHATMODE:-main}" >> "$SESSION_FILE"
fi
```

**Benefits**:
- ✅ Runs automatically on first user interaction
- ✅ Only initializes once per session
- ✅ Works with all chatmodes
- ✅ Zero agent intervention

#### 2. PreToolUse Hook (Work Intent Recording)

**File**: `.claude/hooks/memori-record-intent.sh`

**Trigger**: Before Write, Edit, MultiEdit, Bash

**Logic**:
```bash
#!/bin/bash
# Record what agent intends to do
TOOL_NAME="$1"
TOOL_ARGS="$2"

case "$TOOL_NAME" in
  Write|Edit|MultiEdit)
    python3 "$CLAUDE_PROJECT_DIR/lib/memori/hooks/record_file_intent.py" \
      --tool "$TOOL_NAME" \
      --args "$TOOL_ARGS"
    ;;
  Bash)
    python3 "$CLAUDE_PROJECT_DIR/lib/memori/hooks/record_command_intent.py" \
      --command "$TOOL_ARGS"
    ;;
esac
```

**Benefits**:
- ✅ Captures agent decisions before execution
- ✅ Records "why" (from agent context)
- ✅ Enables rollback analysis

#### 3. PostToolUse Hook (Work Completion Recording)

**File**: `.claude/hooks/memori-record-work.sh`

**Trigger**: After Write, Edit, MultiEdit, Bash

**Logic**:
```bash
#!/bin/bash
# Record what agent actually did
TOOL_NAME="$1"
TOOL_RESULT="$2"
SUCCESS="$3"

python3 "$CLAUDE_PROJECT_DIR/lib/memori/hooks/record_work.py" \
  --tool "$TOOL_NAME" \
  --result "$TOOL_RESULT" \
  --success "$SUCCESS" \
  --chatmode "${CLAUDE_CHATMODE:-main}"
```

**Benefits**:
- ✅ Captures actual outcomes (success/failure)
- ✅ Records files modified, tests run, etc.
- ✅ Builds complete work history

#### 4. Session Finalization (Manual Trigger)

Since `SessionEnd` hook doesn't exist, we use:

**Option A: User command**
```bash
# User types: "end session" or "/end"
# Agent calls:
python3 lib/memori/session_hooks.py end
```

**Option B: Timeout-based cleanup**
```bash
# Cron job runs every hour
# Checks .session_active timestamp
# If >2 hours old, finalize session
*/60 * * * * $CLAUDE_PROJECT_DIR/.claude/hooks/memori-cleanup-stale.sh
```

**Option C: Process-based (BEST)**
```bash
# Use process supervision
# When Claude Code process exits, trigger cleanup
# Requires systemd or supervisor integration
```

---

## Layer 1: Claude Code Hooks (Autonomous)

### Implementation Plan

#### Step 1: Create Hook Scripts

**1.1 Session Initialization Hook**

File: `.claude/hooks/memori-init-session.sh`

```bash
#!/bin/bash
set -e

SESSION_FILE="$CLAUDE_PROJECT_DIR/.memori/.session_active"
CHATMODE="${CLAUDE_CHATMODE:-main}"

# Check if already initialized
if [ -f "$SESSION_FILE" ]; then
  exit 0  # Already initialized
fi

# Initialize Memori
python3 "$CLAUDE_PROJECT_DIR/lib/memori/session_hooks.py" start \
  --chatmode "$CHATMODE" || {
  echo "Warning: Memori initialization failed, continuing without memory"
  exit 0  # Non-blocking failure
}

# Mark session active
mkdir -p "$CLAUDE_PROJECT_DIR/.memori"
cat > "$SESSION_FILE" <<EOF
{
  "session_id": "session_$(date +%Y%m%d_%H%M%S)",
  "chatmode": "$CHATMODE",
  "started_at": "$(date -Iseconds)",
  "pid": $$
}
EOF

echo "✅ Memori initialized for chatmode: $CHATMODE"
```

**1.2 Work Recording Hooks**

File: `.claude/hooks/memori-record-work.sh`

```bash
#!/bin/bash
# PostToolUse hook for Write/Edit/Bash

TOOL_NAME="$1"
CHATMODE="${CLAUDE_CHATMODE:-main}"

# Only record if session active
SESSION_FILE="$CLAUDE_PROJECT_DIR/.memori/.session_active"
[ ! -f "$SESSION_FILE" ] && exit 0

# Record work to Memori
python3 "$CLAUDE_PROJECT_DIR/lib/memori/hooks/auto_record.py" \
  --tool "$TOOL_NAME" \
  --chatmode "$CHATMODE" \
  --stdin || true  # Non-blocking

exit 0
```

**1.3 Session Cleanup Hook**

File: `.claude/hooks/memori-cleanup-stale.sh`

```bash
#!/bin/bash
# Run periodically to clean up stale sessions

SESSION_FILE="$CLAUDE_PROJECT_DIR/.memori/.session_active"

[ ! -f "$SESSION_FILE" ] && exit 0

# Get session start timestamp
START_TIME=$(jq -r '.started_at' "$SESSION_FILE" 2>/dev/null || echo "")
[ -z "$START_TIME" ] && exit 0

# Calculate age in seconds
NOW=$(date +%s)
START=$(date -d "$START_TIME" +%s 2>/dev/null || echo "0")
AGE=$((NOW - START))

# If session >2 hours old, finalize
if [ $AGE -gt 7200 ]; then
  CHATMODE=$(jq -r '.chatmode' "$SESSION_FILE" 2>/dev/null || echo "main")

  python3 "$CLAUDE_PROJECT_DIR/lib/memori/session_hooks.py" end \
    --chatmode "$CHATMODE" || true

  rm -f "$SESSION_FILE"
  echo "Finalized stale session (age: ${AGE}s)"
fi
```

#### Step 2: Register Hooks in codex-hooks.json

Update `.claude/hooks/codex-hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/memori-init-session.sh",
            "description": "Initialize Memori on first user prompt"
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lint-prompt.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/memori-record-work.sh",
            "description": "Record work to Memori automatically"
          }
        ]
      }
    ]
  }
}
```

#### Step 3: Create Python Helper Scripts

**File**: `lib/memori/hooks/auto_record.py`

```python
#!/usr/bin/env python3
"""
Automatic work recording for PostToolUse hooks.
"""
import sys
import json
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from lib.memori.client import create_memori_client
from lib.memori.chatmode_context import ChatmodeContext

def record_tool_use(tool_name: str, chatmode: str, tool_data: dict):
    """Record tool use to Memori"""
    try:
        memori = create_memori_client(chatmode)
        if not memori.enabled:
            return  # Silently skip if Memori unavailable

        context = ChatmodeContext(memori)

        # Extract files modified
        files_modified = []
        if tool_name in ['Write', 'Edit', 'MultiEdit']:
            files_modified = [tool_data.get('file_path', '')]

        # Record as implementation work
        if files_modified:
            context.record_implementation(
                entity_name=f"work_{tool_name.lower()}",
                entity_type="file_modification",
                files_created=files_modified,
                pattern="auto_recorded"
            )
    except Exception as e:
        # Non-blocking - continue even if recording fails
        pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool", required=True)
    parser.add_argument("--chatmode", required=True)
    parser.add_argument("--stdin", action="store_true")

    args = parser.parse_args()

    # Read tool data from stdin
    tool_data = {}
    if args.stdin:
        try:
            tool_data = json.load(sys.stdin)
        except:
            pass

    record_tool_use(args.tool, args.chatmode, tool_data)
```

### Benefits of Hook-Based Approach

✅ **Fully Autonomous**
- No agent instructions needed
- Works with all chatmodes automatically
- Transparent to agents

✅ **Resilient**
- Non-blocking (continues if Memori fails)
- Graceful degradation
- Automatic cleanup of stale sessions

✅ **Comprehensive**
- Captures ALL work (not just what agent remembers to record)
- Intent + outcome tracking
- Complete audit trail

✅ **Low Maintenance**
- Hooks run automatically
- No chatmode updates needed
- Works across sessions

---

## Layer 2: Chatmode Instructions (Explicit)

### Purpose

Even with autonomous hooks, chatmodes should **know** about Memori for:
1. **Semantic recording** - Recording *why*, not just *what*
2. **Structured learnings** - Using ChatmodeContext methods
3. **Explicit decisions** - Validation gates, architectural choices
4. **Fallback** - If hooks fail, chatmode can manually record

### Implementation: Update All 6 Chatmodes

For each chatmode, add these sections:

#### Section 1: Memory Recording Protocol

**Location**: After "Your Responsibilities" section

**Template**:
```markdown
## Memory Recording Protocol 🧠

This chatmode automatically records work to Memori (cross-session memory).

### Automatic Recording (via Hooks)
- ✅ Session start/end
- ✅ File modifications
- ✅ Command executions

### Manual Recording Points

Use `ChatmodeContext` for semantic recording at these points:

#### 1. After Major Decisions
\```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("{chatmode}")
context = ChatmodeContext(memori)

context.record_decision(
    decision="[What was decided]",
    rationale="[Why this approach]",
    alternatives_considered=["Option A", "Option B"],
    relevant_docs=["docs/file.md"]
)
\```

#### 2. After Validation Gates
\```python
context.record_validation_gate(
    workflow="create-service",
    entity_name="ServiceName",
    gate_number=1,
    gate_type="design_review",
    outcome="approved",
    feedback="[User feedback]"
)
\```

#### 3. After Creating Artifacts
\```python
context.record_{artifact_type}(
    entity_name="ServiceName",
    files_created=["path/to/file.ts"],
    pattern="functional_factory"
)
\```

### When to Record Manually

Record manually when:
- [ ] Making architectural decisions
- [ ] User provides important feedback
- [ ] Learning new preferences
- [ ] Detecting anti-patterns
- [ ] Completing validation gates

### Fallback Mode

If Memori unavailable (hooks failed):
```python
try:
    memori.enable()
except:
    print("⚠️ Memori unavailable, continuing without memory")
    # Continue normally - static memory files still available
```
```

#### Chatmode-Specific Recording Points

**Architect Chatmode**:
```markdown
### Architect-Specific Recording

**Record After**:
1. Creating specifications → `record_spec_creation()`
2. Making architectural decisions → `record_decision()`
3. Validation gate approval → `record_validation_gate()`

**Example**:
\```python
context.record_spec_creation(
    spec_file=".claude/specs/loyalty-service.spec.md",
    entity_name="LoyaltyService",
    entity_type="service",
    pattern="append_only_ledger",
    tables=["points_ledger", "player_tier_status"]
)
\```
```

**Service-Engineer Chatmode**:
```markdown
### Service-Engineer-Specific Recording

**Record After**:
1. Implementing services → `record_implementation()`
2. Detecting anti-patterns → `record_anti_pattern_detection()`
3. Passing validation gates → `record_validation_gate()`

**Example**:
\```python
context.record_implementation(
    entity_name="LoyaltyService",
    entity_type="service",
    files_created=["src/services/loyalty.service.ts"],
    pattern="functional_factory",
    test_coverage=0.89
)
\```
```

**Documenter Chatmode**:
```markdown
### Documenter-Specific Recording

**Record After**:
1. Updating memory files → `record_documentation_update()`
2. Session summaries → `record_session_summary()`

**Example**:
\```python
context.record_documentation_update(
    files_updated=["memory/service-catalog.memory.md"],
    update_type="memory_file",
    entity_name="LoyaltyService"
)
\```
```

### Chatmode Update Checklist

For each chatmode file:
- [ ] Add "Memory Recording Protocol" section
- [ ] Add chatmode-specific recording points
- [ ] Add fallback mode instructions
- [ ] Add usage examples
- [ ] Update "Success Criteria" to include memory recording

---

## Layer 3: Workflow Integration (Workflow-Level)

### Purpose

Workflows should explicitly manage Memori state for:
1. **Phase transitions** - Track progress through workflow
2. **Validation gates** - Record outcomes
3. **Cross-session recovery** - Resume interrupted workflows
4. **Workflow state** - Complete history

### Implementation: Update All 7 Workflows

For each workflow, add these sections:

#### Section 1: Workflow State Tracking

**Location**: After frontmatter, before "Overview"

**Template**:
```markdown
## Workflow State Tracking 📊

This workflow automatically tracks state to Memori for cross-session recovery.

### Automatic State Management

**At Workflow Start**:
\```python
from lib.memori import create_memori_client, WorkflowStateManager

memori = create_memori_client(chatmode)
workflow = WorkflowStateManager(memori)

# Check for in-progress workflow
state = workflow.load_workflow_state("create-service", "{ServiceName}")
if state:
    print(f"Resuming at Phase {state.current_phase}")
else:
    print("Starting new workflow")
\```

**At Each Phase Transition**:
\```python
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="{ServiceName}",
    phase=2,
    chatmode=current_chatmode
)
\```

**At Each Validation Gate**:
\```python
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="{ServiceName}",
    gate_number=1,
    gate_type="design_review",
    outcome="approved",
    feedback="User feedback here"
)
\```

**At Workflow Completion**:
\```python
workflow.mark_workflow_complete(
    workflow="create-service",
    entity_name="{ServiceName}"
)
\```
```

#### Section 2: Cross-Session Recovery Protocol

**Template**:
```markdown
## Cross-Session Recovery 🔄

If workflow interrupted, next session automatically recovers:

\```python
# At session start, check for in-progress workflows
from lib.memori.session_hooks import get_workflow_context

context = get_workflow_context("create-service", "{ServiceName}")

if context:
    print(f\"""
    📥 RESUMING WORKFLOW

    Workflow: {context['workflow']}
    Entity: {context['entity_name']}
    Current Phase: {context['current_phase']}
    Next Action: {context['next_action']}
    Spec File: {context['spec_file']}
    \""")
\```

**Resume Checklist**:
- [ ] Load workflow state from Memori
- [ ] Verify phase completion status
- [ ] Check validation gate history
- [ ] Review files created so far
- [ ] Continue from next action
```

#### Section 3: Update Each Phase with State Recording

**Example: create-service.prompt.md updates**

**Phase 1 (Design) - Add State Recording**:
```markdown
### Step 1.3: VALIDATION GATE 1 - Design Review

🛑 **STOP: Present specification to user**

[... existing validation gate content ...]

**After User Approval**:
\```python
from lib.memori import create_memori_client, WorkflowStateManager

memori = create_memori_client("architect")
workflow = WorkflowStateManager(memori)

# Record gate outcome
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="{ServiceName}",
    gate_number=1,
    gate_type="design_review",
    outcome="approved",
    feedback="[User's approval message]"
)

# Record phase transition
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="{ServiceName}",
    phase=1,
    chatmode="architect"
)
\```

**User must explicitly approve before proceeding to Phase 2.**
```

### Workflow Update Checklist

For each workflow file:
- [ ] Add "Workflow State Tracking" section
- [ ] Add "Cross-Session Recovery Protocol" section
- [ ] Update each phase to record state transitions
- [ ] Update each validation gate to record outcomes
- [ ] Add workflow completion recording
- [ ] Add recovery instructions for interruption

---

## Implementation Phases

### Phase 1: Foundation (Week 1) - HIGHEST PRIORITY

**Goal**: Get hooks working for automatic session initialization

**Tasks**:
1. ✅ Create `.claude/hooks/memori-init-session.sh`
2. ✅ Create `.claude/hooks/memori-record-work.sh`
3. ✅ Create `lib/memori/hooks/auto_record.py`
4. ✅ Update `.claude/hooks/codex-hooks.json`
5. ✅ Test hook execution with sample session
6. ✅ Verify `.memori/.session_active` state file

**Deliverables**:
- Hooks automatically initialize Memori on first prompt
- Work automatically recorded to Memori
- Session state tracked

**Success Criteria**:
- [ ] Start new session → Memori auto-initializes
- [ ] Write file → Automatically recorded to Memori
- [ ] Query Memori → See recorded work
- [ ] Works with all 6 chatmodes

### Phase 2: Chatmode Integration (Week 2)

**Goal**: Update all 6 chatmodes with explicit Memori protocols

**Tasks**:
1. ✅ Update `architect.chatmode.md` with Memory Recording Protocol
2. ✅ Update `service-engineer.chatmode.md` with Memory Recording Protocol
3. ✅ Update `documenter.chatmode.md` with Memory Recording Protocol
4. ✅ Update `backend-dev.chatmode.md` with Memory Recording Protocol
5. ✅ Update `frontend-dev.chatmode.md` with Memory Recording Protocol
6. ✅ Update `reviewer.chatmode.md` with Memory Recording Protocol

**Deliverables**:
- All chatmodes know when/what to record
- Chatmode-specific recording examples
- Fallback instructions

**Success Criteria**:
- [ ] Each chatmode has "Memory Recording Protocol" section
- [ ] Chatmode-specific recording points documented
- [ ] Example code blocks for each chatmode
- [ ] Fallback mode instructions

### Phase 3: Workflow Integration (Week 3)

**Goal**: Update all 7 workflows with state tracking

**Tasks**:
1. ✅ Update `create-service.prompt.md` with state tracking
2. ✅ Update `create-adr.prompt.md` with state tracking
3. ✅ Update `write-migration.prompt.md` with state tracking
4. ✅ Update `session-handoff.prompt.md` with Memori integration
5. ✅ Update `phase-completion.prompt.md` with Memori integration
6. ✅ Update `project-initiation.prompt.md` with Memori setup
7. ✅ Update `template.prompt.md` with Memori template

**Deliverables**:
- All workflows track state to Memori
- Cross-session recovery protocols
- Validation gate history

**Success Criteria**:
- [ ] Each workflow has "Workflow State Tracking" section
- [ ] Each workflow has recovery protocol
- [ ] Phase transitions auto-recorded
- [ ] Validation gates auto-recorded

### Phase 4: Testing & Refinement (Week 4)

**Goal**: End-to-end testing and optimization

**Tasks**:
1. ✅ Test complete create-service workflow with Memori
2. ✅ Test cross-session recovery (interrupt workflow, resume)
3. ✅ Test multi-chatmode coordination
4. ✅ Test hook failure scenarios (Memori unavailable)
5. ✅ Optimize hook performance
6. ✅ Document troubleshooting guide

**Deliverables**:
- Tested end-to-end workflows
- Performance benchmarks
- Troubleshooting guide

**Success Criteria**:
- [ ] Complete workflow with state tracking works
- [ ] Interrupted workflow recovers correctly
- [ ] Hooks don't slow down session (<100ms overhead)
- [ ] Graceful degradation if Memori fails

---

## Testing Strategy

### Test 1: Autonomous Session Initialization

**Procedure**:
1. Start fresh Claude Code session
2. Type first user prompt: "What services exist?"
3. Verify `.memori/.session_active` created
4. Verify Memori initialized
5. Query Memori: Should show session start memory

**Expected**:
```
✅ Memori initialized for chatmode: main
✅ .session_active file exists
✅ Memori has session_start memory
```

### Test 2: Automatic Work Recording

**Procedure**:
1. In active session, ask agent to create file
2. Agent uses Write tool
3. PostToolUse hook should fire
4. Verify work recorded to Memori

**Expected**:
```
✅ Write tool executed
✅ PostToolUse hook fired
✅ Memori has file_creation memory
✅ Metadata includes file path
```

### Test 3: Cross-Session Recovery

**Procedure**:
1. Start create-service workflow
2. Complete Phase 1 (design)
3. Exit session (simulate crash)
4. Start new session
5. Ask to continue LoyaltyService
6. Verify agent recalls workflow state

**Expected**:
```
✅ New session initialized
✅ Agent recalls: "LoyaltyService spec approved"
✅ Agent recalls: "Phase 1 complete, ready for Phase 2"
✅ Agent resumes implementation without re-explanation
```

### Test 4: Graceful Degradation

**Procedure**:
1. Stop PostgreSQL (simulate Memori unavailable)
2. Start new session
3. Verify session continues
4. Verify static memory files still loaded

**Expected**:
```
⚠️ Memori unavailable, continuing without memory
✅ Session continues normally
✅ Static memory files loaded
✅ Agent functional (degraded memory)
```

---

## Success Metrics

### Quantitative

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Sessions with Memori** | ~30% (manual) | 100% (automatic) | Session tracking |
| **Work recording rate** | ~20% (manual) | 95% (automatic) | Memori query count |
| **Session initialization time** | Manual (30s) | Automatic (<1s) | Hook execution time |
| **Cross-session recovery** | 0% | 90% | Recovery success rate |
| **Hook overhead** | N/A | <100ms | Performance profiling |

### Qualitative

| Aspect | Before Autonomy | After Autonomy |
|--------|----------------|----------------|
| **Agent Workflow** | "Let me enable Memori..." | [Transparent - no mention] |
| **Session Start** | Manual initialization | Automatic, invisible |
| **Work Recording** | Inconsistent | Comprehensive, automatic |
| **Session Recovery** | Re-explain from scratch | Instant context recall |
| **Maintenance** | Update chatmode instructions | Zero maintenance |

---

## Risk Mitigation

### Risk 1: Hook Execution Failures

**Impact**: Memori not initialized, work not recorded
**Probability**: Medium (external dependencies)

**Mitigation**:
- All hooks use `|| true` (non-blocking)
- Graceful degradation to static memory
- Logging for debugging
- Fallback to chatmode manual recording

### Risk 2: Performance Overhead

**Impact**: Session startup or tool execution slowed
**Probability**: Low (hooks are lightweight)

**Mitigation**:
- Background execution where possible
- Timeout limits on hook execution
- Performance profiling
- Async recording (fire-and-forget)

### Risk 3: State File Corruption

**Impact**: `.session_active` corrupted, session fails
**Probability**: Low (simple JSON)

**Mitigation**:
- Atomic writes (write to temp, then rename)
- Validation before reading
- Automatic cleanup of corrupted files
- Fallback to new session if corrupted

### Risk 4: Cross-Session State Leakage

**Impact**: Session A state leaks into Session B
**Probability**: Low (isolated by session_id)

**Mitigation**:
- Unique session IDs (timestamp-based)
- Cleanup on session finalization
- Stale session detection (>2 hours)
- Chatmode isolation via user_id

---

## Comparison: Before vs After Autonomy

### Before (Manual Memori)

**Agent Workflow**:
```
User: "Create LoyaltyService"

Agent: "Let me enable Memori first..."
[Agent calls: memori = create_memori_client("architect")]
[Agent calls: memori.enable()]

Agent: "Now analyzing bounded context..."
[Agent does work]

Agent: "Let me record this decision to Memori..."
[Agent calls: context.record_decision(...)]

Agent: "Done. Let me disable Memori..."
[Agent calls: memori.disable()]
```

**Problems**:
- ❌ 5+ extra steps
- ❌ Agent must remember
- ❌ Inconsistent usage
- ❌ Cognitive overhead

### After (Autonomous Memori)

**Agent Workflow**:
```
User: "Create LoyaltyService"

[Hook: Memori auto-initializes]
Agent: "Analyzing bounded context..."
[Agent does work]
[Hook: Work auto-recorded]

Agent: "Done."
[Hook: Session auto-finalized]
```

**Benefits**:
- ✅ Zero manual steps
- ✅ Transparent to agent
- ✅ Consistent recording
- ✅ Zero cognitive overhead

---

## Documentation Updates

### Files to Create

1. `.claude/hooks/memori-init-session.sh` - Session initialization hook
2. `.claude/hooks/memori-record-work.sh` - Work recording hook
3. `.claude/hooks/memori-cleanup-stale.sh` - Stale session cleanup
4. `lib/memori/hooks/auto_record.py` - Automatic work recording
5. `lib/memori/hooks/record_file_intent.py` - File modification intent
6. `lib/memori/hooks/record_command_intent.py` - Command intent

### Files to Update

#### Phase 1 (Hooks):
1. `.claude/hooks/codex-hooks.json` - Register new hooks

#### Phase 2 (Chatmodes):
1. `.github/chatmodes/architect.chatmode.md`
2. `.github/chatmodes/service-engineer.chatmode.md`
3. `.github/chatmodes/documenter.chatmode.md`
4. `.github/chatmodes/backend-dev.chatmode.md`
5. `.github/chatmodes/frontend-dev.chatmode.md`
6. `.github/chatmodes/reviewer.chatmode.md`

#### Phase 3 (Workflows):
1. `.claude/workflows/create-service.prompt.md`
2. `.claude/workflows/create-adr.prompt.md`
3. `.claude/workflows/write-migration.prompt.md`
4. `.claude/workflows/session-handoff.prompt.md`
5. `.claude/workflows/phase-completion.prompt.md`
6. `.claude/workflows/project-initiation.prompt.md`
7. `.claude/workflows/template.prompt.md`

---

## Next Steps

### Immediate Actions (This Week)

1. **Review Strategy** ✅
   - Stakeholder review of this document
   - Confirm 3-layer approach
   - Approve implementation phases

2. **Create Hook Infrastructure** (Phase 1)
   - Implement session initialization hook
   - Implement work recording hook
   - Register hooks in codex-hooks.json
   - Test basic hook execution

3. **Test Autonomous Initialization**
   - Start fresh session
   - Verify auto-initialization
   - Verify work recording
   - Measure performance overhead

### Short-Term (Next 2 Weeks)

4. **Update Chatmodes** (Phase 2)
   - Add Memory Recording Protocol to all 6 chatmodes
   - Add chatmode-specific examples
   - Test manual recording as fallback

5. **Update Workflows** (Phase 3)
   - Add state tracking to all 7 workflows
   - Add recovery protocols
   - Test cross-session recovery

### Long-Term (Next Month)

6. **End-to-End Testing** (Phase 4)
   - Complete create-service workflow test
   - Multi-chatmode coordination test
   - Performance optimization
   - Documentation finalization

7. **Production Rollout**
   - Enable hooks for all sessions
   - Monitor performance metrics
   - Collect user feedback
   - Iterate based on learnings

---

## Appendix A: Hook Environment Variables

Claude Code provides these environment variables to hooks:

```bash
$CLAUDE_PROJECT_DIR     # Project root directory
$CLAUDE_CHATMODE        # Current chatmode (if any)
$CLAUDE_SESSION_ID      # Session identifier (if available)
$CLAUDE_USER_ID         # User identifier
```

**Usage in Hooks**:
```bash
#!/bin/bash
CHATMODE="${CLAUDE_CHATMODE:-main}"
python3 "$CLAUDE_PROJECT_DIR/lib/memori/session_hooks.py" start \
  --chatmode "$CHATMODE"
```

---

## Appendix B: Memori API Quick Reference

### Session Management
```python
from lib.memori.session_hooks import on_session_start, on_session_end

# Initialize session
on_session_start(chatmode="architect")

# Finalize session
on_session_end(
    chatmode="architect",
    tasks_completed=["Created spec"],
    files_modified=["loyalty-service.spec.md"]
)
```

### Work Recording
```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("service-engineer")
context = ChatmodeContext(memori)

# Record implementation
context.record_implementation(
    entity_name="LoyaltyService",
    entity_type="service",
    files_created=["loyalty.service.ts"],
    pattern="functional_factory"
)
```

### Workflow State
```python
from lib.memori import WorkflowStateManager

workflow = WorkflowStateManager(memori)

# Save phase transition
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="LoyaltyService",
    phase=2,
    chatmode="service-engineer"
)

# Record validation gate
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="LoyaltyService",
    gate_number=1,
    gate_type="design_review",
    outcome="approved"
)
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-21
**Status**: Proposed
**Maintained By**: Agentic Workflow Framework Team

---

**End of Document**
