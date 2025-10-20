#!/usr/bin/env python3
"""
Minimal test for LLMLingua-2 link preservation
Tests force_tokens on a small markdown sample
"""

from llmlingua import PromptCompressor
import re

# Test markdown with links
TEST_CONTENT = """
# Test Document

This is a test document with several types of links to verify preservation.

## Internal Links

See [ADR-001](docs/adr/ADR-001.md) for database strategy details.
Check [Service Catalog](docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md) for service boundaries.
Review the [Architecture Guide](docs/architecture/README.md) for system overview.

## External Links

Visit [GitHub](https://github.com/microsoft/LLMLingua) for the LLMLingua repository.
Read the [documentation](https://www.example.com/docs/guide) for more information.

## Anchors

See [Configuration Section](#configuration) below.
Jump to [Testing](#testing-section) for test details.

## Configuration

This section explains the configuration options available.

## Testing Section

Here we describe the testing approach and methodology.
"""

print("🔧 Initializing LLMLingua-2 compressor...")
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True
)
print("✓ Compressor ready\n")

# Force tokens for link preservation
FORCE_TOKENS = [
    '[', ']', '(', ')',  # Markdown link brackets
    '\n',                 # Preserve line breaks
    ':',                  # URLs and markdown syntax
    '/', '.',             # URL structure
    '#',                  # Headers and anchors
]

print("=" * 80)
print("ORIGINAL CONTENT")
print("=" * 80)
print(TEST_CONTENT)
print()

print("=" * 80)
print("COMPRESSING...")
print("=" * 80)

result = compressor.compress_prompt(
    [TEST_CONTENT],
    rate=0.35,
    use_context_level_filter=False,
    use_token_level_filter=True,
    force_tokens=FORCE_TOKENS,
    drop_consecutive=True
)

compressed = result['compressed_prompt']

print()
print("=" * 80)
print("COMPRESSED CONTENT")
print("=" * 80)
print(compressed)
print()

# Analyze link preservation
print("=" * 80)
print("LINK ANALYSIS")
print("=" * 80)

original_links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', TEST_CONTENT)
compressed_links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', compressed)

print(f"Original links found:   {len(original_links)}")
print(f"Compressed links found: {len(compressed_links)}")
print()

print("Original Links:")
for text, url in original_links:
    print(f"  [{text}]({url})")
print()

print("Compressed Links:")
for text, url in compressed_links:
    print(f"  [{text}]({url})")
print()

# Word count analysis
original_words = len(TEST_CONTENT.split())
compressed_words = len(compressed.split())
reduction = ((original_words - compressed_words) / original_words * 100)

print("=" * 80)
print("COMPRESSION STATS")
print("=" * 80)
print(f"Original words:    {original_words}")
print(f"Compressed words:  {compressed_words}")
print(f"Reduction:         {reduction:.1f}%")
print(f"Link preservation: {len(compressed_links)}/{len(original_links)} ({len(compressed_links)/len(original_links)*100:.0f}%)")
print()
