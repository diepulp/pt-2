# Quick Start: Memory File Compression

Get started with LLMLingua-based memory file compression in 5 minutes.

## Prerequisites

- Python 3.8+
- pip
- ~2GB disk space (for models)
- ~2GB RAM (during compression)

## Step 1: Install Dependencies

```bash
# From project root
pip install -r scripts/requirements-compress.txt
```

**Note**: First run downloads ~2GB of models. Be patient!

## Step 2: Validate Installation

```bash
# Check script is working
python scripts/compress_memory_files.py --help

# Should show usage information
```

## Step 3: Dry Run

Preview compression without modifying files:

```bash
python scripts/compress_memory_files.py --dry-run --verbose
```

**Expected Output**:

```
INFO: Found 6 memory files to compress
INFO: Loading LLMLingua-2 model (this may take a moment)...
INFO: ✓ Model loaded successfully

INFO: Processing: anti-patterns.memory.md
INFO:   Original: 1,245 tokens | Compressed: 747 tokens | Reduction: 40.0%

INFO: Processing: architecture-decisions.memory.md
INFO:   Original: 2,156 tokens | Compressed: 1,294 tokens | Reduction: 40.0%

...

============================================================
SUMMARY
============================================================
Files processed: 6
Total original tokens: 11,441
Total compressed tokens: 6,865
Overall reduction: 40.0%

[DRY RUN] No files were written
```

## Step 4: Compress Files

Create compressed versions:

```bash
python scripts/compress_memory_files.py
```

**Output Location**: `.claude/memory/compressed/*.memory.md`

## Step 5: Validate Integrity

Check that markdown links and structure are preserved:

```bash
python scripts/validate_compressed_memory.py --dir .claude/memory/compressed
```

**Expected Output**:

```
============================================================
VALIDATION REPORT: project-context.memory.md
============================================================

📊 Statistics:
  Lines: 180
  Words: 390
  Links: 12
  Headings: 15
  Code blocks: 3

🔍 Validation Checks:
  ✅ PASS: Markdown Links
  ✅ PASS: Headings
  ✅ PASS: Code Blocks
  ✅ PASS: File Paths

============================================================
Overall: ✅ VALID
============================================================
```

## Step 6: Compare Original vs Compressed

```bash
# Original
wc -w .claude/memory/project-context.memory.md

# Compressed
wc -w .claude/memory/compressed/project-context.memory.md

# Diff to see what was removed
diff .claude/memory/project-context.memory.md \
     .claude/memory/compressed/project-context.memory.md
```

## Step 7: Test with Claude

### Option A: Test Compressed Files (Safe)

Update `.claude/CLAUDE.md` to reference compressed versions:

```markdown
<!-- Test Compressed Memory Files -->

@.claude/memory/compressed/project-context.memory.md
@.claude/memory/compressed/anti-patterns.memory.md
@.claude/memory/compressed/architecture-decisions.memory.md
@.claude/memory/compressed/phase-status.memory.md
@.claude/memory/compressed/service-catalog.memory.md
@.claude/memory/compressed/domain-glossary.memory.md
```

Start new Claude session and verify context loads correctly.

### Option B: Replace Original Files (Permanent)

```bash
# 1. Backup originals
cp -r .claude/memory .claude/memory.backup

# 2. Replace with compressed
mv .claude/memory/compressed/* .claude/memory/

# 3. Remove compressed directory
rmdir .claude/memory/compressed

# 4. Test with Claude (already references .claude/memory/)
```

**To rollback**:

```bash
rm .claude/memory/*.memory.md
cp .claude/memory.backup/* .claude/memory/
```

## Common Tasks

### Adjust Compression Rate

```bash
# Light compression (20%)
python scripts/compress_memory_files.py --rate 0.2

# Heavy compression (60%)
python scripts/compress_memory_files.py --rate 0.6
```

### Compress Single File

```bash
python scripts/compress_memory_files.py \
  --input .claude/memory/project-context.memory.md \
  --output-dir .claude/memory/test
```

### Add Custom Tokens

```bash
python scripts/compress_memory_files.py \
  --force-tokens "Supabase,PostgreSQL,TypeScript,React"
```

### Recompress After Updates

```bash
# 1. Update original file
vim .claude/memory/project-context.memory.md

# 2. Recompress
python scripts/compress_memory_files.py \
  --input .claude/memory/project-context.memory.md

# 3. Validate
python scripts/validate_compressed_memory.py \
  .claude/memory/compressed/project-context.memory.md
```

## Troubleshooting

### ImportError: No module named 'llmlingua'

**Solution**: Install dependencies

```bash
pip install -r scripts/requirements-compress.txt
```

### Model Download Timeout

**Solution**: Manual download

```bash
python -c "from transformers import AutoModel; \
  AutoModel.from_pretrained('microsoft/llmlingua-2-xlm-roberta-large-meetingbank')"
```

### Compression Too Aggressive

**Solution**: Reduce rate

```bash
python scripts/compress_memory_files.py --rate 0.2
```

### Links Broken After Compression

**Solution**: Add path components to force_tokens

```bash
python scripts/compress_memory_files.py \
  --force-tokens "docs,adr,patterns,phases,system-prd"
```

## Metrics & Goals

### Target Compression Results

| File                             | Original     | Compressed   | Reduction |
| -------------------------------- | ------------ | ------------ | --------- |
| project-context.memory.md        | ~650 words   | ~390 words   | 40%       |
| anti-patterns.memory.md          | ~550 words   | ~330 words   | 40%       |
| architecture-decisions.memory.md | ~2,100 words | ~1,260 words | 40%       |
| phase-status.memory.md           | ~800 words   | ~480 words   | 40%       |
| service-catalog.memory.md        | ~1,200 words | ~720 words   | 40%       |
| domain-glossary.memory.md        | ~400 words   | ~240 words   | 40%       |
| **Total**                        | **~11,400**  | **~6,865**   | **40%**   |

### Context Savings

- **Token reduction**: ~4,600 tokens per session load
- **Cost savings** (GPT-4 rates): ~$0.012 per load
- **Load time**: Minimal impact (<1 second difference)
- **Quality**: 95%+ information retention

### Validation Checks

All compressed files should pass:

- ✅ Markdown link integrity (100% preserved)
- ✅ Heading structure intact
- ✅ Code blocks complete
- ✅ File paths valid
- ✅ Status indicators preserved
- ✅ Technical terms retained

## Next Steps

1. ✅ **Compressed files created** → Test with Claude
2. ✅ **Validation passed** → Replace originals or update references
3. ✅ **Claude context loads** → Monitor quality and adjust rate if needed
4. 📋 **Iterate**: Recompress after major documentation updates

## Files Created

```
scripts/
├── compress_memory_files.py           # Main compression script
├── validate_compressed_memory.py      # Integrity validation
├── requirements-compress.txt          # Python dependencies
├── COMPRESS_MEMORY_README.md          # Full documentation
└── QUICKSTART_COMPRESSION.md          # This file

.claude/memory/compressed/             # Output directory
├── project-context.memory.md
├── anti-patterns.memory.md
├── architecture-decisions.memory.md
├── phase-status.memory.md
├── service-catalog.memory.md
└── domain-glossary.memory.md
```

## Support

- **Full docs**: `scripts/COMPRESS_MEMORY_README.md`
- **LLMLingua docs**: https://github.com/microsoft/LLMLingua
- **Project memory docs**: `docs/agentic-workflow/MEMORY_INFRASTRUCTURE_GUIDE.md`

## License

Scripts use LLMLingua (MIT License).
