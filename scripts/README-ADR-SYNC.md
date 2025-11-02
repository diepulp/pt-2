# ADR Sync Validation Script

## Purpose

Validates that `.claude/memory/architecture-decisions.memory.md` stays synchronized with actual ADR files in `docs/80-adrs/`.

## Location

- **Script**: `scripts/validate-adr-sync.mjs`
- **NPM Command**: `npm run validate:adr-sync`
- **Output**: `.validation/adr-sync-report.json`

## What It Checks

1. **Missing ADRs**: Detects ADR files that exist but aren't documented in memory
2. **Phantom ADRs**: Detects ADRs documented in memory but files don't exist
3. **Status Mismatches**: Compares status fields between source and memory
4. **Stale Timestamps**: Warns if memory file hasn't been updated in >7 days

## Usage

### Manual Validation

```bash
npm run validate:adr-sync
```

### Expected Output

**✅ Success (All in sync)**:
```
📋 ADR Sync Validation Report
══════════════════════════════════════════════════════════════════════
📊 Total ADR files: 12
📝 Documented in memory: 12
🔗 Referenced only: 0
📅 Memory last updated: 2025-10-29
══════════════════════════════════════════════════════════════════════

✅ All checks passed! Memory file is in sync.
```

**❌ Failure (Out of sync)**:
```
❌ Errors Found: 2

1. ADR-012 exists but not documented in memory
   title: API Rate Limiting Strategy
   status: accepted
   date: 2025-10-30

2. Status mismatch for ADR-004
   actual: accepted
   memory: proposed
   title: Real-Time Strategy
```

## Exit Codes

- `0`: All checks passed (or warnings only)
- `1`: Validation errors found
- `2`: Critical file not found (ADR directory or memory file missing)

## Integration Points

### Pre-commit Hook (Future)

Add to `.husky/pre-commit`:
```bash
#!/usr/bin/env sh

# Check if ADR files or memory file changed
if git diff --cached --name-only | grep -E "(docs/80-adrs/|\.claude/memory/architecture-decisions)"; then
  echo "🔍 ADR changes detected, validating sync..."
  npm run validate:adr-sync || {
    echo "⚠️  ADR sync validation failed!"
    echo "Please update .claude/memory/architecture-decisions.memory.md"
    exit 1
  }
fi
```

### CI/CD Pipeline

Add to GitHub Actions workflow:
```yaml
- name: Validate ADR Sync
  run: npm run validate:adr-sync
```

## Report Format

The validation generates a JSON report at `.validation/adr-sync-report.json`:

```json
{
  "timestamp": "2025-10-29T...",
  "summary": {
    "totalADRs": 12,
    "documentedADRs": 12,
    "referencedADRs": 0,
    "memoryLastUpdated": "2025-10-29",
    "errors": 0,
    "warnings": 0
  },
  "actualADRs": [
    {
      "number": "000",
      "title": "ADR-000: Matrix as Schema Contract",
      "status": "accepted",
      "date": "2025-10-21"
    }
  ],
  "memoryADRs": [
    {
      "number": "000",
      "title": "SRM Canonical Contract (Matrix as Schema Contract)",
      "status": "accepted (2025-10-21)"
    }
  ],
  "validation": {
    "errors": [],
    "warnings": [],
    "info": []
  }
}
```

## Maintenance

### When to Update Memory File

Update `.claude/memory/architecture-decisions.memory.md` when:

1. **New ADR Created**: Add ADR section and update Quick Reference
2. **ADR Status Changed**: Update status in existing section
3. **ADR Content Changed**: Review if memory summary needs updating
4. **Decision Summary Matrix**: Keep in sync with all ADRs

### Format Requirements

**Memory File Structure**:
```markdown
## ADR-XXX: Title

**Status**: ✅ Accepted (YYYY-MM-DD)
**Context**: Brief context

### Decision
[Summary of decision]

### Rationale
[Key points]
```

**Status Format**:
- Use emoji indicators: ✅ (Accepted), ⚠️ (Proposed), ⏸️ (Deferred), 🔴 (Rejected)
- Include date in parentheses
- Normalize during comparison (emoji and dates stripped)

## Known Limitations

1. **Status Format Variations**: Script normalizes status by removing emojis and dates, but different markdown formatting may cause false positives
2. **Title Matching**: Compares ADR numbers, not titles (titles can differ between file and memory)
3. **Content Drift**: Only checks structure/status, not actual content accuracy

## Troubleshooting

### "Memory file not found"
Ensure `.claude/memory/architecture-decisions.memory.md` exists at project root.

### "ADR directory not found"
Ensure `docs/80-adrs/` directory exists with ADR markdown files.

### False positive status mismatches
Check that status format in source ADRs matches expected pattern:
- `**Status**: Accepted` or
- `**Status:** Accepted` or
- `Status: Accepted`

### Script won't execute
Ensure script is executable:
```bash
chmod +x scripts/validate-adr-sync.mjs
```

## Development

### Testing Locally

```bash
# Run validation
npm run validate:adr-sync

# Check detailed report
cat .validation/adr-sync-report.json | jq .
```

### Modifying the Script

The script is an ES module (`*.mjs`) with exported functions for testing:

```javascript
import {
  parseADRFile,
  parseMemoryFile,
  scanADRDirectory,
  validateSync,
} from './scripts/validate-adr-sync.mjs';

// Use in tests
const adrs = scanADRDirectory('docs/80-adrs');
const memory = parseMemoryFile('.claude/memory/architecture-decisions.memory.md');
const results = validateSync(adrs, memory);
```

## Related Documentation

- `.claude/memory/architecture-decisions.memory.md` - Memory file being validated
- `docs/80-adrs/` - Source ADR files
- `docs/80-adrs/README.md` - ADR process and standards
- `scripts/validate-matrix-schema.js` - Related schema validation

---

**Version**: 1.0.0
**Created**: 2025-10-29
**Maintainer**: Development Team
