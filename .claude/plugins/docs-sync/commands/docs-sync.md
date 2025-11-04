# Docs Sync

Validate architecture documentation consistency and regenerate derived artifacts.

## Purpose

Ensures that architecture documentation, Service Responsibility Matrix (SRM), Architecture Decision Records (ADRs), and compressed memory snapshots remain synchronized and consistent across the codebase.

## Parameters

- `scope` (optional): Folder or doc ID to target (defaults to entire docs tree)
- `skip_matrix` (optional): Set to `true` to skip SRM matrix validation

## Usage

```bash
# Full validation (all docs)
/docs-sync

# Validate specific scope
/docs-sync scope=docs/20-architecture

# Skip matrix validation
/docs-sync skip_matrix=true
```

## Execution Checklist

1. **Clean Working Tree**
   - Ensure the working tree is clean
   - Stash unrelated changes before running doc automation
   - This prevents merge conflicts with generated files

2. **SRM Matrix Validation** (unless `skip_matrix=true`)
   - Run `npm run validate:matrix-schema`
   - Parses SRM ownership claims
   - Detects schema drift between SRM and database
   - Confirms DTO alignment with Database types
   - Validates bounded context integrity

3. **ADR Synchronization**
   - Execute `node scripts/validate-adr-sync.mjs`
   - Keeps ADR index files synchronized with individual ADR documents
   - Validates ADR numbering and status
   - Updates cross-references

4. **Memory Snapshot Refresh**
   - Runs when SRM or architecture docs change
   - Execute `python scripts/validate_compressed_memory.py`
   - Regenerates compressed memory files from documentation
   - Validates 203k-word corpus compression integrity

5. **Documentation Index Updates**
   - Update `docs/INDEX.md` or other doc indices
   - Capture short change log for PR description
   - Ensure new documents are cataloged

## Exit Codes

- `0`: All validations passed
- `1`: Validation warnings (review required)
- `2`: Validation failures (must fix before merge)

## Related Documentation

- **SRM Matrix**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **ADR Index**: `docs/80-adrs/`
- **Memory Architecture**: `docs/agentic-workflow/MEMORY_ARCHITECTURE_V2.md`
- **Validation Scripts**: `scripts/validate_matrix_schema.js`, `scripts/validate-adr-sync.mjs`

## Pre-commit Hook

This command is automatically triggered by pre-commit hooks when documentation files change. Manual execution is useful for:
- Validating changes before committing
- Debugging documentation sync issues
- Regenerating artifacts after bulk changes
