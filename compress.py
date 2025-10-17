from llmlingua import PromptCompressor
import os
import re
from transformers import AutoTokenizer

# === Config ===
INPUT_FILE = "docs/documentation-consistency-audit.md"
OUTPUT_FILE = "docs/documentation-consistency-audit-compressed.md"
MAX_TOKENS = 450  # Safe limit below 512 to avoid overflow

# === Initialize compressor and tokenizer ===
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True
)
tokenizer = AutoTokenizer.from_pretrained("microsoft/llmlingua-2-xlm-roberta-large-meetingbank")

# === Read source ===
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    source_text = f.read()

# === Helper function to split text into chunks under token limit ===
def split_by_tokens(text, max_tokens):
    """Split text into chunks that don't exceed max_tokens."""
    # Try splitting by paragraphs first
    paragraphs = text.split('\n\n')
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # Check if adding this paragraph exceeds limit
        test_chunk = current_chunk + ("\n\n" if current_chunk else "") + para
        token_count = len(tokenizer.encode(test_chunk))

        if token_count <= max_tokens:
            current_chunk = test_chunk
        else:
            # Save current chunk if non-empty
            if current_chunk:
                chunks.append(current_chunk)

            # Check if single paragraph exceeds limit
            if len(tokenizer.encode(para)) > max_tokens:
                # Split by sentences
                sentences = re.split(r'([.!?]\s+)', para)
                current_chunk = ""
                for j in range(0, len(sentences), 2):
                    sentence = sentences[j] + (sentences[j+1] if j+1 < len(sentences) else "")
                    test_chunk = current_chunk + (" " if current_chunk else "") + sentence
                    if len(tokenizer.encode(test_chunk)) <= max_tokens:
                        current_chunk = test_chunk
                    else:
                        if current_chunk:
                            chunks.append(current_chunk)
                        current_chunk = sentence
            else:
                current_chunk = para

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

# === Split into chunks by sections ===
sections = re.split(r'\n(?=##\s)', source_text)
print(f"Split into {len(sections)} sections")

# === Split large sections and compress ===
compressed_chunks = []
chunk_num = 0
for i, section in enumerate(sections):
    token_count = len(tokenizer.encode(section))

    # If section is too large, split it further
    if token_count > MAX_TOKENS:
        print(f"Section {i+1} ({token_count} tokens) → splitting...")
        subsections = split_by_tokens(section, MAX_TOKENS)
        print(f"  Split into {len(subsections)} subsections")

        for j, subsection in enumerate(subsections):
            chunk_num += 1
            print(f"Compressing chunk {chunk_num} (section {i+1}.{j+1})...", end=" ")
            try:
                result = compressor.compress_prompt(
                    [subsection],
                    rate=0.35,
                    use_context_level_filter=False,
                    use_token_level_filter=True
                )
                compressed_chunks.append(result['compressed_prompt'])
                print("✓")
            except Exception as e:
                print(f"⚠️ Error, keeping original: {str(e)[:50]}")
                compressed_chunks.append(subsection)
    else:
        chunk_num += 1
        print(f"Compressing chunk {chunk_num} (section {i+1}, {token_count} tokens)...", end=" ")
        try:
            result = compressor.compress_prompt(
                [section],
                rate=0.35,
                use_context_level_filter=False,
                use_token_level_filter=True
            )
            compressed_chunks.append(result['compressed_prompt'])
            print("✓")
        except Exception as e:
            print(f"⚠️ Error, keeping original: {str(e)[:50]}")
            compressed_chunks.append(section)

compressed_text = "\n\n".join(compressed_chunks)

# === Save compressed ===
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(compressed_text)

# === Report ===
original_len = len(source_text.split())
compressed_len = len(compressed_text.split())
print(f"\n✅ Compression complete.")
print(f"Original: {original_len} words")
print(f"Compressed: {compressed_len} words")
print(f"Reduction: {100 - (compressed_len/original_len)*100:.1f}%")
print(f"Output written to {OUTPUT_FILE}")
