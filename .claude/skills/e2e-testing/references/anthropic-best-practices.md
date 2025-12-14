# Anthropic Testing Best Practices Reference

Advanced testing techniques from Anthropic's official Claude Code best practices guide.
Load this file when implementing complex TDD workflows, multi-agent verification, or optimizing test iteration cycles.

---

## Test-Driven Development with Agentic Coding

TDD becomes significantly more powerful with agentic coding. The key principles:

### 1. Explicit TDD Declaration

Always be explicit about doing test-driven development to prevent mock implementations:

```
I'm doing test-driven development. Write tests based on these expected
input/output pairs. Do NOT create mock implementations - only test code.
```

### 2. Four-Phase TDD Workflow

**Phase 1: Write Tests First**
```
Write Playwright E2E tests for the rating slip pause/resume workflow.
Expected behavior:
- Pausing a slip should record pause timestamp
- Resuming should calculate accumulated duration excluding pause time
- Final duration should exclude all pause periods
```

**Phase 2: Verify Failure**
```
Run the tests and confirm they fail.
Do NOT write any implementation code at this stage.
```

**Phase 3: Iterate to Pass**
```
Write code to pass these tests. Keep going until all tests pass.
It will take a few iterations - write code, run tests, adjust, repeat.
```

**Phase 4: Independent Verification**
```
Verify with independent analysis that the implementation isn't
overfitting to the tests. Check for broader correctness.
```

---

## Extended Thinking Triggers

Use specific phrases to allocate thinking budget:

| Phrase | Budget Level | Use Case |
|--------|--------------|----------|
| `think` | Low | Simple test design, straightforward assertions |
| `think hard` | Moderate | Complex workflow tests, edge cases |
| `think harder` | High | Multi-step verification, architectural tests |
| `ultrathink` | Maximum | Critical flow design, security verification |

### Example Prompts

**Simple Test Design:**
```
think about the assertions needed for this player creation test
```

**Complex Workflow:**
```
think hard about the rating slip lifecycle - what edge cases are we missing?
Consider pause/resume timing, concurrent access, and RLS enforcement.
```

**Architecture Decision:**
```
ultrathink about the test architecture for this feature. Consider:
- Test isolation strategies
- Data cleanup patterns
- CI performance implications
- Coverage vs maintenance tradeoff
```

---

## Multi-Agent Verification

### Parallel Review Workflow

Have one Claude instance write code while another reviews:

```
# Instance 1: Write tests
Write E2E tests for the visit checkout workflow

# Instance 2: Review tests
Review these tests for completeness. Are we missing any edge cases?
Check for proper isolation, cleanup, and assertion coverage.
```

### Independent Validation

After implementation, verify the solution isn't overfitting:

```
Verify with independent analysis that this implementation correctly
handles the domain problem, not just the specific test cases.
Consider:
- Boundary conditions not in tests
- Concurrent access patterns
- Error handling for network failures
- RLS policy enforcement
```

### Subagent Spawning

For complex verification, spawn a dedicated subagent:

```
Spawn a subagent to independently verify:
1. Test coverage completeness against PRD requirements
2. Implementation correctness beyond test cases
3. Performance implications of test design
4. Security considerations for test data handling
```

---

## Iteration Cycles

Claude's outputs improve significantly after 2-3 iterations:

### Iteration Pattern

```
# First Pass
Write initial E2E tests for player registration

# Second Pass
Run tests, identify failures, refine assertions

# Third Pass
Add edge cases discovered during implementation

# Fourth Pass
Verify test isolation and cleanup
```

### Clear Targets

Provide clear, measurable targets for iteration:

```
The test must verify:
1. Response status is 200
2. Response body contains player ID
3. Player record exists in database
4. Cleanup removes all test data
```

---

## Context Management for Testing

### Session Hygiene

Use `/clear` between major test phases:
- After completing one feature's tests
- Before starting a new test domain
- When context becomes cluttered with failed iterations

### Context Preservation

Before clearing, save important learnings:

```
Save checkpoint before clearing:
- Test patterns discovered
- Edge cases identified
- Fixture requirements documented
```

---

## Common Testing Failure Modes

### 1. Premature Completion

**Problem:** Marking features complete without proper E2E validation.

**Fix:** Always run full E2E suite before marking done:
```
Run the complete E2E test suite and verify all tests pass before
marking this feature as complete.
```

### 2. Mock Over-Reliance

**Problem:** Using mocks that don't reflect real behavior.

**Fix:** Prefer integration tests with real database:
```
Use a real Supabase test database for this test. Do not mock the
database calls - we need to verify RLS policies work correctly.
```

### 3. Test Isolation Failures

**Problem:** Tests depend on each other's data.

**Fix:** Always create fresh data per test:
```
Each test must create its own TestScenario with unique data.
Never share state between tests.
```

---

## Verification Prompts

### Coverage Verification
```
ultrathink: analyze the test coverage for [feature]. Create a matrix of:
- Happy paths covered
- Error conditions tested
- Edge cases verified
- Security aspects validated
- Performance implications considered
```

### Implementation Verification
```
think hard: verify this implementation satisfies the original requirements,
not just the test cases. Consider scenarios the tests don't cover.
```

### Security Verification
```
think harder: verify the test data handling follows security best practices:
- No secrets in test fixtures
- Proper cleanup of auth tokens
- RLS bypasses only in setup/teardown
- No data leakage between tenants
```

---

## Integration with PT-2 Standards

### Aligning with QA-001

Ensure E2E tests follow the testing pyramid:
```
This E2E test covers a critical flow (10% tier). Verify:
- Unit tests exist for the underlying services (40% tier)
- Integration tests exist for service+DB (20% tier)
- This E2E test adds value beyond existing coverage
```

### Aligning with ADR-002

Follow test file organization:
```
Place this test in e2e/workflows/ following ADR-002.
Use *.spec.ts naming convention for Playwright tests.
```

---

## Quick Reference: Effective Prompts

| Task | Prompt Pattern |
|------|----------------|
| Write tests | "Write Playwright E2E tests for [feature]. This is TDD - tests only." |
| Verify failure | "Run tests and confirm they fail. Do not write implementation." |
| Implement | "Write code to pass these tests. Keep iterating until all pass." |
| Verify | "ultrathink: verify implementation correctness beyond test cases." |
| Review | "Have a subagent review this for edge cases and security." |
| Debug flaky | "think hard about why this test is flaky. Check for race conditions." |
