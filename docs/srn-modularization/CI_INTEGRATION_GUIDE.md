# CI Integration Guide - SRM Link Checker

**Date**: 2025-11-17
**Status**: IMPLEMENTED
**Author**: PT-2 DevOps Team

---

## Overview

The SRM (Service Responsibility Matrix) Link Checker is an automated tool that validates all documentation references in the Service Responsibility Matrix to ensure they point to existing files. This prevents broken links and maintains documentation integrity as the codebase evolves.

### Why This Matters

The SRM is the canonical contract document for PT-2, referenced by 50+ other documents. Broken links in the SRM can:
- Block development workflows
- Create confusion about current architecture
- Violate the "matrix-as-contract" principle (ADR-000)
- Lead to documentation drift

---

## Implementation Status

### Completed Components

1. **Link Checker Script** (`scripts/check-srm-links.ts`)
   - Language: TypeScript (strict mode)
   - Runtime: tsx (TypeScript executor)
   - Exit codes: 0 (success), 1 (failure)
   - Test coverage: 20 tests, 100% pass rate

2. **NPM Scripts** (`package.json`)
   - `npm run check:srm-links` - Quick check with summary
   - `npm run check:srm-links:verbose` - Detailed output with all references

3. **GitHub Actions Workflow** (`.github/workflows/check-srm-links.yml`)
   - Triggers: Push to main/develop, PRs modifying docs
   - Node version: 20
   - Fail-fast: Yes (exits immediately on broken links)

4. **Test Suite** (`scripts/__tests__/check-srm-links.test.ts`)
   - Unit tests for reference extraction
   - Edge case handling
   - Jest-based test runner

---

## How It Works

### Detection Patterns

The link checker scans for three types of document references:

#### 1. YAML Front Matter References
```yaml
---
source_of_truth:
  - docs/30-security/SECURITY_TENANCY_UPGRADE.md
  - docs/30-security/SEC-001-rls-policy-matrix.md
---
```

#### 2. Inline Backtick Paths
```markdown
See `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` for details.
```

#### 3. Markdown Links
```markdown
Check the [DTO Standard](docs/25-api-data/DTO_CANONICAL_STANDARD.md) for rules.
```

### Features

- **Anchor Stripping**: Removes `#section` fragments from paths
- **Query String Removal**: Strips `?param=value` from URLs
- **Line Number Reporting**: Shows exact location of broken references
- **Color-Coded Output**: Green checkmarks for valid, red X for broken
- **Context Preservation**: Displays surrounding text for each reference

---

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/check-srm-links.yml`

```yaml
name: Check SRM Links

on:
  push:
    branches: [main, develop]
    paths:
      - 'docs/**/*.md'
      - 'scripts/check-srm-links.ts'
  pull_request:
    paths:
      - 'docs/**/*.md'
      - 'scripts/check-srm-links.ts'
  workflow_dispatch:

jobs:
  check-links:
    name: Verify SRM Documentation Links
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run check:srm-links
        continue-on-error: false
      - if: failure()
        run: npm run check:srm-links:verbose
```

### Integration Points

**Triggers on**:
- Commits to `main` or `develop` branches
- Pull requests that modify markdown files in `docs/`
- Changes to the checker script itself
- Manual workflow dispatch

**Workflow Behavior**:
- Fails immediately if broken links detected
- Shows verbose output on failure for debugging
- Caches npm dependencies for faster runs
- Uses same Node version as development environment

---

## Adding to Existing CI Pipeline

### Option 1: Standalone Workflow (Recommended)

Already implemented as `.github/workflows/check-srm-links.yml`. This approach:
- Runs independently of main CI
- Provides clear failure messages
- Can be manually triggered
- Doesn't slow down main CI pipeline

### Option 2: Add to Main CI Workflow

To add to existing `.github/workflows/ci.yml`:

```yaml
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      # ... existing steps ...

      - name: Check SRM Links
        run: npm run check:srm-links
        continue-on-error: false

      # ... remaining steps ...
```

**Pros**:
- Single workflow to monitor
- Consistent with other checks

**Cons**:
- Adds ~3-5 seconds to CI runtime
- Failure blocks entire pipeline

---

## Local Development Usage

### Quick Check (Summary Only)

```bash
npm run check:srm-links
```

**Output**:
```
================================================================================
SRM Link Check Report
================================================================================

Summary:
--------------------------------------------------------------------------------
Total references: 18
Valid references: 18
Broken references: 0

✓ Link check PASSED - All references valid
================================================================================
```

### Verbose Check (All References)

```bash
npm run check:srm-links:verbose
```

**Output**:
```
Reading SRM from: /path/to/SRM.md
Found 18 document references

All References:
--------------------------------------------------------------------------------
✓ Line 10      [yaml]       docs/30-security/SECURITY_TENANCY_UPGRADE.md
✓ Line 11      [yaml]       docs/30-security/SEC-001-rls-policy-matrix.md
✓ Line 28      [backtick]   docs/20-architecture/EDGE_TRANSPORT_POLICY.md
...

Summary:
--------------------------------------------------------------------------------
Total references: 18
Valid references: 18
Broken references: 0

✓ Link check PASSED
```

### Direct Script Execution

```bash
# With tsx
tsx scripts/check-srm-links.ts

# With node (requires compilation)
node scripts/check-srm-links.js

# Help
tsx scripts/check-srm-links.ts --help
```

---

## Troubleshooting

### Broken Link Detected

**Error Output**:
```
Broken Links:
--------------------------------------------------------------------------------
✗ Line 52      [backtick]   docs/25-api-data/MISSING_FILE.md
  Context: > **Extraction Target**: `docs/25-api-data/MISSING_FILE.md` (stub; in progress)
  Expected: /home/user/projects/pt-2/docs/25-api-data/MISSING_FILE.md
```

**Resolution Steps**:
1. Check if file exists at expected path
2. Verify file extension (`.md` vs `.MD`)
3. Check for typos in path
4. If file moved, update SRM reference
5. If file deleted, remove reference from SRM

### False Positives

**Scenario**: File exists but checker reports it as missing

**Common Causes**:
1. Case sensitivity on Linux/macOS
2. File not committed to git
3. File in `.gitignore`
4. Symlink issues

**Verification**:
```bash
# Check file exists
ls -la docs/path/to/file.md

# Check git status
git status docs/path/to/file.md

# Run from project root
cd /path/to/project-root
npm run check:srm-links:verbose
```

### CI Failing But Local Passes

**Possible Causes**:
1. Uncommitted files in local working directory
2. Different branch checked out in CI
3. Case sensitivity differences (local macOS, CI Linux)

**Resolution**:
```bash
# Ensure all files committed
git status

# Test with clean checkout
git stash
npm run check:srm-links
git stash pop
```

---

## Maintenance

### Adding New Documentation

When creating new documentation referenced by the SRM:

1. Create the file first
2. Commit the file
3. Update SRM to reference it
4. Run `npm run check:srm-links` locally
5. Commit SRM changes

**DO NOT** commit SRM references to non-existent files, even as stubs.

### Renaming/Moving Documentation

When moving a file referenced by the SRM:

1. Create new file at target location
2. Update all SRM references (use find/replace)
3. Run `npm run check:srm-links:verbose` to verify
4. Commit changes atomically (file move + SRM update)
5. Delete old file

### Updating the Checker

The checker script is located at `scripts/check-srm-links.ts`.

**After making changes**:
1. Update tests in `scripts/__tests__/check-srm-links.test.ts`
2. Run tests: `npm test -- scripts/__tests__/check-srm-links.test.ts`
3. Test against real SRM: `npm run check:srm-links:verbose`
4. Update this documentation if behavior changes

---

## Testing

### Running Tests

```bash
# Run link checker tests only
npm test -- scripts/__tests__/check-srm-links.test.ts

# Run all tests
npm test

# Watch mode
npm run test:watch -- scripts/__tests__/check-srm-links.test.ts
```

### Test Coverage

Current test suite covers:
- YAML front matter extraction
- Backtick path extraction
- Markdown link extraction
- Anchor fragment stripping
- Query string removal
- Multiple references per line
- Empty content handling
- Non-markdown file filtering
- Line number accuracy
- Context preservation
- Edge cases (special characters, nested paths, Windows line endings)

**Test Results** (2025-11-17):
- Total tests: 20
- Passed: 20 (100%)
- Failed: 0
- Runtime: ~180ms

---

## Performance

### Benchmarks

- **SRM size**: 2,126 lines
- **References found**: 18
- **Check time**: <100ms
- **CI overhead**: ~3-5 seconds (including npm ci)

### Optimization

The checker is optimized for:
- Single file read (no repeated I/O)
- Regex-based extraction (fast)
- Synchronous file existence checks (Node.js `existsSync`)
- No external dependencies beyond Node.js stdlib

---

## Future Enhancements

### Potential Improvements

1. **Link Checking for All Docs**
   - Extend to check links in all markdown files, not just SRM
   - Script: `scripts/check-all-links.ts`

2. **Dead Link Detection**
   - Check for files in `docs/` not referenced anywhere
   - Prevent orphaned documentation

3. **Anchor Validation**
   - Verify that `#section` anchors exist in target files
   - Requires markdown heading parsing

4. **External URL Checking**
   - Validate HTTP/HTTPS links
   - Check for 404s on external references

5. **Auto-Fix Mode**
   - Suggest corrections for common typos
   - Interactive fix prompt for developers

6. **Integration with Pre-Commit Hooks**
   - Run checker before allowing commits
   - Prevent broken links from entering codebase

---

## FAQ

### Q: Why TypeScript instead of JavaScript?

**A**: Type safety prevents bugs in the checker itself. The checker is part of critical infrastructure and must be reliable. TypeScript ensures we catch errors at development time, not runtime in CI.

### Q: Can I disable the checker temporarily?

**A**: Not recommended. If needed for emergency hotfix:
1. Add `continue-on-error: true` to workflow step
2. Create follow-up ticket to fix broken links
3. Revert temporary disable ASAP

### Q: What if I need to reference a file that doesn't exist yet?

**A**: Create the file as a stub first:
```markdown
# [Doc Title]

TODO: Content coming soon

[Track progress in issue #123]
```

Then commit both the stub and SRM reference together.

### Q: Does this check external links (https://...)?

**A**: No, only internal file paths starting with `docs/`. External link checking could be added in the future.

### Q: Can this check links in other files besides SRM?

**A**: Currently no, but the script is designed to be extensible. The `CheckerConfig` interface accepts a `srmPath` parameter that could be parameterized to check other files.

---

## Related Documentation

- **Session Handoff**: `docs/srn-modularization/SESSION_HANDOFF.md`
- **Taxonomy Inventory**: `docs/srn-modularization/SDLC_TAXONOMY_INVENTORY.md`
- **SRM Mapping Table**: `docs/20-architecture/SRM_MAPPING_TABLE.md`
- **Service Responsibility Matrix**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR-000 (Matrix as Contract)**: `docs/80-adrs/ADR-000-matrix-as-contract.md`

---

## Contact & Support

For issues or questions about the link checker:
1. Check this guide first
2. Review test suite for examples
3. Check GitHub Issues for known problems
4. Create new issue with:
   - Command run
   - Full output (use `--verbose`)
   - Expected vs actual behavior
   - Environment details (OS, Node version)

---

**Document Status**: COMPLETE
**Last Updated**: 2025-11-17
**Version**: 1.0.0
**Maintained By**: PT-2 DevOps Team
