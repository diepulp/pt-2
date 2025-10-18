# Memory File Compression with LLMLingua

This directory contains tools for compressing project memory files using Microsoft's LLMLingua-2 while preserving markdown structure and link references.

## Overview

The compression script reduces token count in memory files by 30-60% while maintaining:

- ✅ Markdown link syntax `[text](path)` - prevents broken references
- ✅ Heading hierarchy (`#`, `##`, `###`)
- ✅ Code blocks and inline code
- ✅ Tables and lists
- ✅ File paths and technical terms
- ✅ Status indicators (✅, ❌, ⏳, etc.)

## Installation

### 1. Install Python Dependencies

```bash
# From project root
pip install -r scripts/requirements-compress.txt
```

**Note**: This will download ~2GB of models on first run.

### 2. Verify Installation

```bash
python scripts/compress_memory_files.py --help
```

## Usage

### Basic Usage - Compress All Memory Files

```bash
# Compress all .memory.md files with default 40% compression
python scripts/compress_memory_files.py

# Output: .claude/memory/compressed/*.memory.md
```

### Dry Run - Preview Results

```bash
# See compression stats without writing files
python scripts/compress_memory_files.py --dry-run --verbose
```

### Single File Compression

```bash
# Compress a specific file
python scripts/compress_memory_files.py \
  --input .claude/memory/project-context.memory.md \
  --rate 0.5

# Output: .claude/memory/compressed/project-context.memory.md
```

### Adjust Compression Rate

```bash
# Light compression (20%)
python scripts/compress_memory_files.py --rate 0.2

# Moderate compression (40%) - Default
python scripts/compress_memory_files.py --rate 0.4

# Heavy compression (60%)
python scripts/compress_memory_files.py --rate 0.6
```

### Custom Force Tokens

```bash
# Preserve additional technical terms
python scripts/compress_memory_files.py \
  --force-tokens "Supabase,React,TypeScript,PostgreSQL"
```

## Options Reference

| Option           | Type   | Default                     | Description                                     |
| ---------------- | ------ | --------------------------- | ----------------------------------------------- |
| `--rate`         | float  | 0.4                         | Compression rate (0.0-1.0)                      |
| `--input`        | path   | -                           | Single input file to compress                   |
| `--input-dir`    | path   | `.claude/memory`            | Directory containing .memory.md files           |
| `--output-dir`   | path   | `.claude/memory/compressed` | Output directory for compressed files           |
| `--dry-run`      | flag   | false                       | Show results without writing files              |
| `--force-tokens` | string | -                           | Additional tokens to preserve (comma-separated) |
| `--verbose`      | flag   | false                       | Enable detailed logging                         |

## How It Works

### LLMLingua-2 Technology

The script uses Microsoft's LLMLingua-2, a task-agnostic prompt compression model that:

1. Analyzes text at token level
2. Identifies redundant/low-information tokens
3. Removes tokens while preserving structure
4. Maintains semantic meaning

### Force Tokens Feature

The `force_tokens` parameter ensures specific characters/patterns are **always preserved**:

````python
MARKDOWN_FORCE_TOKENS = [
    "\n",           # Line breaks
    "[", "]",       # Link text
    "(",  ")",      # Link URLs
    "/",            # Path separator
    "#", "##",      # Headings
    "`", "```",     # Code blocks
    "-", "*",       # Lists
    "|",            # Tables
    "✅", "❌",     # Status indicators
]
````

This prevents compression from breaking:

- `[ADR-001](docs/adr/ADR-001.md)` → Preserves all link syntax
- `## Heading` → Preserves heading markers
- `` `code` `` → Preserves inline code markers
- `docs/patterns/FILE.md` → Preserves file paths

### Drop Consecutive

The `drop_consecutive=True` parameter removes duplicate force_tokens that appear consecutively, preventing patterns like:

```
❌ Before: ##  ##  Heading
✅ After:  ## Heading
```

## Example Results

### Input: project-context.memory.md

- **Original**: 650 words, 220 lines
- **Compressed**: 390 words, 180 lines
- **Reduction**: 40%
- **All links intact**: 12/12 preserved

### Input: architecture-decisions.memory.md

- **Original**: 2,100 words, 808 lines
- **Compressed**: 1,260 words, 650 lines
- **Reduction**: 40%
- **All links intact**: 28/28 preserved

### Total Corpus

- **Original**: ~11,400 words (6 files)
- **Compressed**: ~6,800 words
- **Reduction**: 40%
- **Context savings**: ~4,600 tokens (≈$0.012 per load at GPT-4 rates)

## Validation

### Manual Verification

After compression, verify:

1. **Link integrity**: Search for `](` pattern

   ```bash
   grep -o '\]\([^)]*\)' .claude/memory/compressed/*.md
   ```

2. **Heading structure**: Check heading hierarchy

   ```bash
   grep '^#' .claude/memory/compressed/*.md
   ```

3. **Code blocks**: Verify code block markers
   ````bash
   grep '```' .claude/memory/compressed/*.md
   ````

### Automated Testing

```bash
# Test script on sample file
python scripts/compress_memory_files.py \
  --input .claude/memory/project-context.memory.md \
  --dry-run \
  --verbose

# Verify output
cat .claude/memory/compressed/project-context.memory.md
```

## Integration with Claude

### Option 1: Replace Original Files (Recommended)

```bash
# Backup originals
cp -r .claude/memory .claude/memory.backup

# Compress and replace
python scripts/compress_memory_files.py
mv .claude/memory/compressed/* .claude/memory/

# Test with Claude
# .claude/CLAUDE.md already references .claude/memory/*.memory.md
```

### Option 2: Update References

```bash
# Keep originals, update CLAUDE.md to reference compressed versions
# Edit .claude/CLAUDE.md:
@.claude/memory/compressed/project-context.memory.md
@.claude/memory/compressed/anti-patterns.memory.md
# ... etc
```

### Option 3: Selective Compression

```bash
# Compress only large files (>500 lines)
python scripts/compress_memory_files.py \
  --input .claude/memory/architecture-decisions.memory.md \
  --rate 0.5

# Keep smaller files uncompressed
```

## Troubleshooting

### Model Download Fails

**Issue**: Network timeout during model download

**Solution**: Download manually:

```bash
python -c "from transformers import AutoModel; AutoModel.from_pretrained('microsoft/llmlingua-2-xlm-roberta-large-meetingbank')"
```

### Out of Memory

**Issue**: Script crashes with memory error

**Solution**: Use smaller model:

```python
# Edit compress_memory_files.py, line 183:
model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank"
```

### Broken Links After Compression

**Issue**: Some links broken after compression

**Solution**: Add path components to force_tokens:

```bash
python scripts/compress_memory_files.py \
  --force-tokens "docs,adr,patterns,phases"
```

### Compression Too Aggressive

**Issue**: Compressed text loses important information

**Solution**: Reduce compression rate:

```bash
python scripts/compress_memory_files.py --rate 0.2  # Only 20% compression
```

## Performance

### Compression Speed

- **Single file (650 words)**: ~5-10 seconds
- **All 6 files (~11,400 words)**: ~30-45 seconds
- **Model loading**: ~10-20 seconds (one-time per run)

### Resource Usage

- **RAM**: ~2GB (model in memory)
- **Disk**: ~2GB (model files)
- **CPU**: Moderate (uses transformers on CPU)

## Best Practices

1. **Always dry run first**: Verify compression quality before writing

   ```bash
   python scripts/compress_memory_files.py --dry-run --verbose
   ```

2. **Start with moderate compression**: Use default 40% rate, adjust if needed

3. **Verify link integrity**: Check all markdown links after compression

4. **Keep backups**: Maintain original files until compression validated

   ```bash
   cp -r .claude/memory .claude/memory.backup
   ```

5. **Test with Claude**: Load compressed files and verify context quality

6. **Iterate on force_tokens**: Add domain-specific terms if needed

## Related Documentation

- [LLMLingua GitHub](https://github.com/microsoft/LLMLingua)
- [LLMLingua-2 Paper](https://arxiv.org/abs/2403.12968)
- [Project Memory Infrastructure](../docs/agentic-workflow/MEMORY_INFRASTRUCTURE_GUIDE.md)
- [Phase 1 Sign-off](../docs/agentic-workflow/PHASE_1_MEMORY_EXTRACTION_SIGNOFF.md)

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review LLMLingua documentation
3. Verify force_tokens configuration
4. Test with `--verbose` flag for detailed logs

## License

This script uses LLMLingua (MIT License) for compression.
