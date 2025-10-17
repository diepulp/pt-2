# Phase 1 Memory Infrastructure - Validation Test

**Purpose**: Verify memory infrastructure auto-loads and provides immediate context
**Duration**: ~5 minutes
**Status**: Ready to execute

---

## Prerequisites

✅ Phase 1 integration fixes applied (2025-10-17 19:35):
- `.claude/CLAUDE.md` updated with `@` memory references
- `/load-memory` command created
- `MEMORY_INFRASTRUCTURE_GUIDE.md` documented

---

## Test Procedure

### Step 1: Start Fresh Session (0:00)

```bash
# Exit current session if in one
exit

# Start new Claude Code session
claude-code
```

**Expected**: Session starts, loads `.claude/CLAUDE.md` automatically

**Timing**: Should be ready within 10 seconds

---

### Step 2: Immediate Context Test (0:15)

Without reading any files or running any commands, ask:

**Test Question 1**:
> "What's the current phase status of PT-2?"

**Expected Answer** (immediate, no file reads):
- Phase 6 Wave 3 complete
- ~75% MVP complete
- 7/8 services implemented
- Next: Wave 4 (vertical features)

**If agent reads files first**: ❌ Auto-load FAILED

---

**Test Question 2**:
> "What are the critical anti-patterns to avoid in the service layer?"

**Expected Answer** (immediate, no file reads):
- No class-based services
- No ReturnType inference
- No `any` typing on supabase parameter
- No service-to-service calls
- Always use SupabaseClient<Database>

**If agent reads files first**: ❌ Auto-load FAILED

---

**Test Question 3**:
> "List all implemented services with their status"

**Expected Answer** (immediate, no file reads):
1. Player ✅
2. Casino ✅
3. Visit ✅
4. RatingSlip ✅
5. TableContext ✅
6. MTL ✅
7. PlayerFinancial ✅
8. Loyalty ⏳ (optional)

**If agent reads files first**: ❌ Auto-load FAILED

---

### Step 3: Measure Load Time (0:45)

Ask:
> "How long did it take to load the memory context?"

**Expected**: Agent should report <10 seconds (or instant if already loaded)

**Acceptable**: Up to 10 seconds
**Marginal**: 10-15 seconds
**Failed**: >15 seconds or "I needed to read files manually"

---

### Step 4: Test Backup Mechanism (1:00)

If auto-load worked, skip to Step 5.

If auto-load failed:

```
/load-memory
```

**Expected**: Command loads all 6 memory files and confirms context available

**Verification**: Re-ask test questions from Step 2

---

### Step 5: Verify Memory Contents (1:30)

Ask specific questions about each memory file:

**project-context.memory.md**:
> "What's the tech stack for PT-2?"

Expected: Next.js 14, Supabase, React Query v5, Zustand, TypeScript, Tailwind

**architecture-decisions.memory.md**:
> "How many ADRs have been accepted and what are they?"

Expected: 5 ADRs (Dual Types, Test Location, State Management, Real-Time, Integrity)

**service-catalog.memory.md**:
> "What's the universal service pattern structure?"

Expected: Functional factories, explicit interfaces, index.ts + crud.ts + (optional) business.ts/queries.ts

**domain-glossary.memory.md**:
> "What's a Gaming Day?"

Expected: 6 AM to 5:59 AM next day, gaming industry regulatory period

**anti-patterns.memory.md**:
> "What's wrong with `type PlayerService = ReturnType<typeof createPlayerService>`?"

Expected: Violates explicit interface requirement, should use `interface PlayerService`

**phase-status.memory.md**:
> "What's the next major milestone?"

Expected: Phase 6 Wave 4 (MTL UI + vertical features)

---

### Step 6: Performance Check (2:30)

Check context window usage:

> "How much context are the memory files using?"

**Expected**: ~11-12k words, ~92KB total
**Acceptable**: Memory files use <5% of total context window
**Target**: Agent has plenty of room for code and conversation

---

## Success Criteria

### ✅ PASS - All criteria met

1. ✅ Auto-load worked (immediate answers, no file reads)
2. ✅ Load time <10 seconds
3. ✅ All 6 memory files accessible
4. ✅ Agent has comprehensive project context
5. ✅ Context window usage reasonable (<5%)
6. ✅ Backup `/load-memory` command works (if tested)

**Result**: Phase 1 infrastructure VALIDATED ✅

---

### ⚠️ PARTIAL - Some issues

1. ⚠️ Auto-load slow (10-15 seconds)
2. ⚠️ Some memory files missing content
3. ⚠️ Agent sometimes reads files for basic questions
4. ⚠️ Context window usage >5% but <10%

**Action**: Review memory file sizes, check CLAUDE.md syntax, investigate slow loads

---

### ❌ FAIL - Critical issues

1. ❌ Auto-load didn't work (agent reads files manually)
2. ❌ Load time >15 seconds
3. ❌ Memory files missing or corrupted
4. ❌ Agent lacks basic project context
5. ❌ Backup command doesn't work

**Action**: Debug `.claude/CLAUDE.md`, verify `@` syntax, check file permissions, review logs

---

## Troubleshooting

### Auto-load Not Working

**Check 1**: Verify CLAUDE.md syntax
```bash
cat .claude/CLAUDE.md | grep "@.claude/memory"
```

Should see 6 lines like:
```
@.claude/memory/project-context.memory.md
@.claude/memory/anti-patterns.memory.md
...
```

**Check 2**: Verify memory files exist
```bash
ls -lah .claude/memory/
```

Should see 6 `.md` files totaling ~92KB

**Check 3**: Check file permissions
```bash
stat .claude/memory/*.md
```

Should be readable (644 or similar)

**Check 4**: Try manual load
```
/load-memory
```

If this works but auto-load doesn't, issue is with CLAUDE.md integration

---

### Slow Load Times

**Measure individual files**:
```bash
wc -w .claude/memory/*.md
```

**Targets**:
- project-context: <1000 words
- anti-patterns: <2000 words
- architecture-decisions: <3000 words
- phase-status: <3000 words
- service-catalog: <4000 words
- domain-glossary: <3000 words

**If exceeded**: Compress largest files, remove redundant examples

---

### Memory Content Stale

**Check last update**:
```bash
grep "Last Updated" .claude/memory/*.md
```

**If old**: Follow update workflow in MEMORY_INFRASTRUCTURE_GUIDE.md

---

## Test Results Template

Copy and fill out:

```markdown
## Phase 1 Validation Test Results

**Date**: YYYY-MM-DD HH:MM
**Tester**: [Your name]
**Session**: [Session ID if applicable]

### Test Outcomes

- [ ] Auto-load worked (immediate answers)
- [ ] Load time: ___ seconds
- [ ] All 6 memory files accessible
- [ ] Comprehensive project context available
- [ ] Context window usage: ___%
- [ ] Backup command tested: [Yes/No/N/A]

### Test Questions Results

1. Current phase status: [✅ Immediate / ⚠️ Delayed / ❌ Failed]
2. Service anti-patterns: [✅ Immediate / ⚠️ Delayed / ❌ Failed]
3. Service catalog list: [✅ Immediate / ⚠️ Delayed / ❌ Failed]

### Performance Metrics

- Session startup time: ___ seconds
- Memory load time: ___ seconds
- Total context: ___ words
- Memory file context: ___ words (___%)

### Overall Result

[✅ PASS / ⚠️ PARTIAL / ❌ FAIL]

### Issues Identified

[List any issues, or "None"]

### Recommendations

[Any suggestions for improvement, or "None"]

### Sign-Off

Phase 1 infrastructure validated and ready for Phase 2: [Yes/No]
```

---

## Next Steps After Validation

### If PASS ✅

1. **Proceed to Phase 2**: Chat Modes implementation
2. **Monitor**: Track memory effectiveness over 1-2 weeks
3. **Optimize**: Identify any memory gaps or inefficiencies
4. **Document**: Note any memory maintenance needs

### If PARTIAL ⚠️

1. **Fix identified issues** (see troubleshooting)
2. **Re-test** using this procedure
3. **Document workarounds** if needed
4. **Proceed cautiously** to Phase 2

### If FAIL ❌

1. **Debug root cause** (CLAUDE.md syntax, file issues, etc.)
2. **Apply fixes** based on troubleshooting guide
3. **Re-test thoroughly**
4. **Do NOT proceed** to Phase 2 until PASS

---

## Reference Documents

- `docs/agentic-workflow/PHASE_1_MEMORY_EXTRACTION_SIGNOFF.md` - Phase 1 completion
- `docs/agentic-workflow/MEMORY_INFRASTRUCTURE_GUIDE.md` - Infrastructure guide
- `.claude/CLAUDE.md` - Auto-load configuration
- `.claude/commands/load-memory.md` - Manual load command

---

**Document Status**: Ready for execution
**Version**: 1.0.0
**Last Updated**: 2025-10-17
