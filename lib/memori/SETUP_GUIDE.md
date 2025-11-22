# Memori Integration Setup Guide for PT-2

**Purpose**: Step-by-step guide to enable Memori for PT-2 agentic workflows
**Time Required**: 30-45 minutes
**Prerequisites**: Python 3.10+, PostgreSQL (Supabase local), OpenAI API key

---

## Phase 1: Environment Setup (10 minutes)

### Step 1: Verify Prerequisites

```bash
# 1. Check Python version
python --version  # Should be 3.10+

# 2. Check Supabase is running
docker ps | grep supabase  # Should show supabase_db_pt-2 container

# 3. Check PostgreSQL connection
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT version();"
```

### Step 2: Install Memori SDK

```bash
# Install Memori and dependencies
cd /home/diepulp/projects/pt-2
pip install -r lib/memori/requirements.txt

# Or install individually
pip install memori psycopg2-binary loguru
```

### Step 3: Verify Environment Variables

```bash
# Check .env file has Memori configuration
cat .env | grep MEMORI

# Should see:
# MEMORI_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
# OPENAI_API_KEY="sk-..."
# MEMORI_ENVIRONMENT="development"
```

If missing, add to `.env`:

```bash
# Memori Configuration
MEMORI_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"
OPENAI_API_KEY="your-openai-api-key"
MEMORI_ENVIRONMENT="development"
CLAUDE_CHATMODE="main"  # Optional: default chatmode
```

---

## Phase 2: Database Initialization (5 minutes)

### Step 1: Initialize Memori Schema

```bash
# Run database initialization script
npm run memori:init

# Or run directly
python scripts/memori-init-db.py
```

**Expected Output:**
```
✅ pgvector extension enabled
✅ Memori schema 'memori' initialized successfully!
Tables created: memories, entities, relationships, conversations
```

### Step 2: Verify Schema

```bash
# Check tables exist
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'memori'
  ORDER BY table_name;
"
```

**Expected Tables:**
- conversations
- entities
- memories
- relationships

### Step 3: (Optional) Seed Baseline Context

```bash
# Seed initial project context
python scripts/memori-reset-and-seed.py

# This will:
# - Clear any test data
# - Seed project overview
# - Seed architecture preferences
# - Seed key rules
```

---

## Phase 3: Test Integration (10 minutes)

### Step 1: Run Basic Tests

```bash
# Test database connectivity
python scripts/memori-test.py
```

**Expected Output:**
```
✅ Memori database connection successful
✅ Schema 'memori' exists
✅ All tables present
```

### Step 2: Test Session Hooks

```bash
# Test session start
python lib/memori/session_hooks.py start --chatmode architect

# Expected output:
# ✅ Memori enabled for architect (session_id: session_20251121_100000)
# Loaded 0 recent memories (first run)
```

```bash
# Test session end
python lib/memori/session_hooks.py end --chatmode architect

# Expected output:
# ✅ Memori session ended for architect
```

### Step 3: Test Memori Client

Create test file `test_memori_integration.py`:

```python
#!/usr/bin/env python3
from lib.memori import create_memori_client, ChatmodeContext

# Test 1: Create client
print("Test 1: Creating Memori client...")
memori = create_memori_client("service-engineer")
success = memori.enable()

if success:
    print("✅ Memori client enabled successfully")
else:
    print("❌ Failed to enable Memori")
    exit(1)

# Test 2: Record memory
print("\nTest 2: Recording test memory...")
context = ChatmodeContext(memori)
result = context.record_implementation(
    entity_name="TestService",
    entity_type="service",
    files_created=["test.service.ts"],
    pattern="functional_factory",
    test_coverage=0.85
)

if result:
    print("✅ Memory recorded successfully")
else:
    print("❌ Failed to record memory")

# Test 3: Disable client
print("\nTest 3: Disabling Memori...")
memori.disable()
print("✅ Memori disabled successfully")

print("\n✅ All tests passed!")
```

Run the test:

```bash
python test_memori_integration.py
```

---

## Phase 4: Chatmode Integration (15 minutes)

### Step 1: Update Architect Chatmode

Add Memori integration to `.github/chatmodes/architect.chatmode.md`:

```markdown
## Memori Integration

This chatmode uses Memori for cross-session memory and decision tracking.

### At Session Start

Memory is automatically loaded when chatmode is activated. Recent architecture decisions and specs are available in context.

### Recording Decisions

When making architectural decisions:

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("architect")
memori.enable()
context = ChatmodeContext(memori)

# Record decision
context.record_decision(
    decision="Use append-only ledger for loyalty points",
    rationale="Audit trail requirement",
    alternatives_considered=["Snapshot-based", "Event-sourced"],
    relevant_docs=["SRM.md#loyalty-service"]
)

# Record spec creation
context.record_spec_creation(
    spec_file=".claude/specs/loyalty-service.spec.md",
    entity_name="LoyaltyService",
    entity_type="service",
    pattern="append_only_ledger",
    tables=["points_ledger", "tier_status"]
)
```

### At Validation Gates

Record validation gate outcomes:

```python
from lib.memori import WorkflowStateManager

workflow = WorkflowStateManager(memori)
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="LoyaltyService",
    gate_number=1,
    gate_type="spec_review",
    outcome="approved",
    feedback="Spec follows SERVICE_TEMPLATE.md correctly"
)
```
```

### Step 2: Test Chatmode Integration

```bash
# Switch to architect chatmode and test
# (This would be done within Claude Code session)

# For manual testing:
python lib/memori/session_hooks.py start --chatmode architect

# Simulate architect work...
# (Create spec, record decision, etc.)

python lib/memori/session_hooks.py end --chatmode architect
```

---

## Phase 5: Workflow Integration (Optional)

### Example: Integrate with create-service Workflow

Update `.claude/workflows/create-service.prompt.md` to include Memori tracking:

```markdown
## Phase 1: Architecture Design (Architect Chatmode)

**Memori Tracking**:
- Record architecture decision
- Record spec creation
- Record validation gate 1 outcome

```python
from lib.memori import create_memori_client, ChatmodeContext, WorkflowStateManager

memori = create_memori_client("architect")
memori.enable()
context = ChatmodeContext(memori)
workflow = WorkflowStateManager(memori)

# After spec creation
context.record_spec_creation(...)

# At validation gate
workflow.record_validation_gate(
    workflow="create-service",
    entity_name="{service_name}",
    gate_number=1,
    gate_type="spec_review",
    outcome="approved" | "rejected"
)

# Phase transition
workflow.save_phase_transition(
    workflow="create-service",
    entity_name="{service_name}",
    phase=1,
    chatmode="architect",
    metadata={"spec_file": "..."}
)
```
```

---

## Verification Checklist

After setup, verify:

- [x] Python 3.10+ installed
- [x] Memori SDK installed (`pip list | grep memori`)
- [x] PostgreSQL accessible (port 54322)
- [x] Memori schema created
- [x] Environment variables configured
- [x] Session hooks working
- [x] Test memory recorded successfully
- [x] At least one chatmode updated

---

## Troubleshooting

### Issue: Memori SDK not found

```bash
# Solution: Install Memori
pip install memori

# Or from requirements
pip install -r lib/memori/requirements.txt
```

### Issue: Database connection failed

```bash
# Solution 1: Check Supabase is running
docker ps | grep supabase

# Solution 2: Start Supabase
cd /path/to/pt-2
npx supabase start

# Solution 3: Verify connection string
echo $MEMORI_DATABASE_URL
```

### Issue: pgvector extension not available

```text
⚠️ This is okay - embeddings will use JSONB fallback
⚠️ Semantic search will still work, just slightly slower

# To enable pgvector (optional):
docker exec -it supabase_db_pt-2 psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue: OpenAI API key not set

```bash
# Solution: Add to .env
echo 'OPENAI_API_KEY="sk-..."' >> .env

# Verify
cat .env | grep OPENAI_API_KEY
```

### Issue: Import errors

```python
# Error: ModuleNotFoundError: No module named 'lib.memori'

# Solution: Add project root to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:/home/diepulp/projects/pt-2"

# Or in Python:
import sys
sys.path.insert(0, '/home/diepulp/projects/pt-2')
```

---

## Monitoring and Maintenance

### View Memories

```sql
-- Connect to database
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

-- View recent memories
SELECT
    user_id,
    category,
    content,
    created_at
FROM memori.memories
ORDER BY created_at DESC
LIMIT 10;

-- View by chatmode
SELECT * FROM memori.memories
WHERE user_id = 'service_engineer'
ORDER BY created_at DESC
LIMIT 5;

-- View by category
SELECT * FROM memori.memories
WHERE category = 'decisions'
ORDER BY created_at DESC;
```

### Clear Test Data

```bash
# Reset and reseed
python scripts/memori-reset-and-seed.py

# Or clear all memories
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
  DELETE FROM memori.memories;
  DELETE FROM memori.entities;
  DELETE FROM memori.relationships;
  DELETE FROM memori.conversations;
"
```

### Monitor Memory Growth

```sql
-- Check memory count
SELECT
    user_id,
    category,
    COUNT(*) as count,
    AVG(LENGTH(content)) as avg_size
FROM memori.memories
GROUP BY user_id, category
ORDER BY count DESC;
```

---

## Next Steps

After successful setup:

1. **Use Memori in Sessions**
   - Start recording learnings
   - Track workflow state
   - Build cross-session context

2. **Update All Chatmodes**
   - Add Memori integration to remaining chatmodes
   - Define chatmode-specific recording protocols

3. **Monitor and Iterate**
   - Review memory quality
   - Adjust importance scores
   - Fine-tune retrieval settings

4. **Advanced Features**
   - Cross-chatmode learning
   - Conscious agent tuning
   - Custom entity extraction

---

## Support

- **Strategy Document**: `docs/agentic-workflow/MEMORI-INTEGRATION-STRATEGY.md`
- **Architecture**: `.memori/CORRECT_ARCHITECTURE.md`
- **API Docs**: `lib/memori/README.md`
- **Memori Docs**: https://memorilabs.ai/docs/

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-21
**Maintained By**: Agentic Workflow Framework Team
