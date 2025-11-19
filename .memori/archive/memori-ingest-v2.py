#!/usr/bin/env python3
"""
Optimized Memori ingestion for PT-2 documentation.

This script implements intelligent chunking and fact extraction:
1. Semantic document chunking by markdown sections
2. Fact extraction using LLM-powered analysis
3. Category-based organization (facts, rules, preferences, skills, context)
4. Entity and relationship extraction
5. Granular, searchable memories instead of whole documents

References:
- .memori/INGESTION_STRATEGY.md
- https://memorilabs.ai/docs/open-source/architecture/
"""

import os
import sys
import re
from pathlib import Path
import yaml
import glob as glob_module
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import hashlib

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from memori import Memori
from loguru import logger
import psycopg2
import json
from openai import OpenAI

# Database configuration
DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres?options=-c search_path=memori,public"

# Load config
config_path = project_root / ".memori" / "config.yml"
with open(config_path, 'r') as f:
    config = yaml.safe_load(f)


@dataclass
class DocumentChunk:
    """Represents a semantic chunk of documentation."""
    content: str
    section_path: str  # e.g., "MTL Service > Responsibilities"
    depth: int
    source_file: str
    line_number: Optional[int] = None
    category: Optional[str] = None
    entities: List[str] = None
    metadata: Dict = None

    def __post_init__(self):
        if self.entities is None:
            self.entities = []
        if self.metadata is None:
            self.metadata = {}

    def to_dict(self) -> Dict:
        return {
            "content": self.content,
            "section_path": self.section_path,
            "depth": self.depth,
            "source_file": self.source_file,
            "line_number": self.line_number,
            "category": self.category,
            "entities": self.entities,
            **self.metadata
        }


class DocumentChunker:
    """Intelligent document chunking for optimal memory storage."""

    def __init__(self, max_chunk_size: int = 800):
        self.max_chunk_size = max_chunk_size
        self.section_pattern = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)

    def chunk_markdown_by_sections(self, content: str, source_file: str) -> List[DocumentChunk]:
        """
        Chunk markdown by semantic sections (headers).
        Preserves hierarchy and context.
        """
        chunks = []
        lines = content.split('\n')
        current_section = []
        section_path = []
        current_depth = 0
        line_num = 0

        for i, line in enumerate(lines):
            match = self.section_pattern.match(line)

            if match:
                # Save previous section
                if current_section:
                    section_content = '\n'.join(current_section).strip()
                    if section_content and len(section_content) > 50:  # Skip tiny sections
                        chunks.append(DocumentChunk(
                            content=section_content,
                            section_path=' > '.join(section_path),
                            depth=current_depth,
                            source_file=source_file,
                            line_number=line_num
                        ))

                # Start new section
                header_level = len(match.group(1))
                header_text = match.group(2).strip()

                # Update section path based on depth
                if header_level <= len(section_path):
                    section_path = section_path[:header_level - 1]
                section_path.append(header_text)

                current_section = [line]
                current_depth = header_level
                line_num = i + 1
            else:
                current_section.append(line)

        # Save final section
        if current_section:
            section_content = '\n'.join(current_section).strip()
            if section_content and len(section_content) > 50:
                chunks.append(DocumentChunk(
                    content=section_content,
                    section_path=' > '.join(section_path),
                    depth=current_depth,
                    source_file=source_file,
                    line_number=line_num
                ))

        return chunks

    def chunk_large_sections(self, chunks: List[DocumentChunk]) -> List[DocumentChunk]:
        """
        Split overly large chunks into smaller, coherent pieces.
        Respects paragraph and sentence boundaries.
        """
        refined_chunks = []

        for chunk in chunks:
            if len(chunk.content) <= self.max_chunk_size:
                refined_chunks.append(chunk)
                continue

            # Split by paragraphs first
            paragraphs = chunk.content.split('\n\n')
            sub_chunks = []
            current_sub = []
            current_size = 0

            for para in paragraphs:
                para_size = len(para)

                if current_size + para_size > self.max_chunk_size and current_sub:
                    # Save current sub-chunk
                    sub_content = '\n\n'.join(current_sub)
                    sub_chunks.append(sub_content)
                    current_sub = [para]
                    current_size = para_size
                else:
                    current_sub.append(para)
                    current_size += para_size

            # Save final sub-chunk
            if current_sub:
                sub_chunks.append('\n\n'.join(current_sub))

            # Create new chunks for each sub-chunk
            for idx, sub_content in enumerate(sub_chunks):
                refined_chunks.append(DocumentChunk(
                    content=sub_content,
                    section_path=f"{chunk.section_path} (part {idx + 1})",
                    depth=chunk.depth,
                    source_file=chunk.source_file,
                    line_number=chunk.line_number
                ))

        return refined_chunks


class FactExtractor:
    """Extract structured facts from documentation chunks using LLM."""

    def __init__(self, openai_api_key: Optional[str] = None):
        self.client = OpenAI(api_key=openai_api_key or os.getenv("OPENAI_API_KEY"))

    def extract_facts_from_chunk(self, chunk: DocumentChunk, service_context: str) -> List[Dict]:
        """
        Use LLM to extract structured facts from a chunk.
        Returns list of categorized facts with metadata.
        """

        prompt = f"""You are analyzing documentation for the {service_context} bounded context.

Extract **specific, actionable facts** from this section. For each fact:
1. Classify it into ONE category: facts, preferences, rules, skills, or context
2. Extract any entities (tables, services, thresholds, patterns)
3. Keep facts concise (1-2 sentences max)

Section: {chunk.section_path}
Content:
{chunk.content}

Return a JSON array of facts with this structure:
[
  {{
    "fact": "Concise fact statement",
    "category": "facts|preferences|rules|skills|context",
    "entities": ["entity1", "entity2"],
    "importance": 0.0-1.0,
    "reasoning": "Why this is important"
  }}
]

Category guidelines:
- **facts**: Verifiable information (thresholds, ownership, relationships)
- **preferences**: Team/architectural choices (patterns, conventions)
- **rules**: Enforcement rules (must/must not do)
- **skills**: Capabilities and responsibilities
- **context**: Background information and relationships

Only extract facts that are specific and actionable. Skip generic or redundant information.
"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a technical documentation analyst extracting structured facts."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )

            result = json.loads(response.choices[0].message.content)

            # Handle both array and object with "facts" key
            facts = result if isinstance(result, list) else result.get("facts", [])

            # Enrich with source metadata
            for fact in facts:
                fact["source_file"] = chunk.source_file
                fact["section_path"] = chunk.section_path
                fact["line_number"] = chunk.line_number

            return facts

        except Exception as e:
            logger.error(f"LLM extraction failed for {chunk.section_path}: {e}")
            return []

    def extract_patterns(self, content: str) -> List[Dict]:
        """
        Extract common patterns via regex for high-confidence facts.
        Examples: thresholds, table ownership, FK relationships.
        """
        patterns = []

        # Threshold patterns
        threshold_pattern = r'(CTR|threshold|watchlist|floor)[:\s]+\$?([\d,]+)'
        for match in re.finditer(threshold_pattern, content, re.IGNORECASE):
            patterns.append({
                "fact": f"{match.group(1)} threshold: ${match.group(2)}",
                "category": "facts",
                "entities": [match.group(1).lower()],
                "importance": 0.95,
                "reasoning": "Compliance threshold value"
            })

        # Table ownership pattern
        ownership_pattern = r'(\w+Service)\s+(?:OWNS|owns)\s+([a-z_]+(?:,\s*[a-z_]+)*)'
        for match in re.finditer(ownership_pattern, content):
            tables = [t.strip() for t in match.group(2).split(',')]
            patterns.append({
                "fact": f"{match.group(1)} owns {', '.join(tables)}",
                "category": "facts",
                "entities": [match.group(1)] + tables,
                "importance": 0.90,
                "reasoning": "Service ownership boundary"
            })

        return patterns


class OptimizedIngestionEngine:
    """Main ingestion engine with chunking and fact extraction."""

    def __init__(self):
        self.chunker = DocumentChunker(max_chunk_size=800)
        self.extractor = FactExtractor()
        self.db_conn = None

    def connect_db(self):
        """Establish database connection."""
        if not self.db_conn or self.db_conn.closed:
            self.db_conn = psycopg2.connect(
                host="127.0.0.1",
                port=54322,
                database="postgres",
                user="postgres",
                password="postgres"
            )

    def store_memory(self, user_id: str, fact: Dict):
        """Store a single fact as a memory."""
        self.connect_db()
        cur = self.db_conn.cursor()

        try:
            # Prepare metadata
            metadata = {
                "source": f"{fact.get('source_file', 'unknown')}:{fact.get('line_number', 0)}",
                "section": fact.get("section_path", ""),
                "entities": fact.get("entities", []),
                "importance": fact.get("importance", 0.5),
                "reasoning": fact.get("reasoning", "")
            }

            # Insert memory
            cur.execute("""
                INSERT INTO memori.memories (user_id, content, category, metadata)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (
                user_id,
                fact["fact"],
                fact.get("category", "context"),
                json.dumps(metadata)
            ))

            self.db_conn.commit()

        except Exception as e:
            logger.error(f"Failed to store memory: {e}")
            self.db_conn.rollback()
        finally:
            cur.close()

    def ingest_document(self, file_path: Path, user_id: str, service_context: str) -> int:
        """
        Ingest a single document with intelligent chunking and fact extraction.
        Returns count of facts extracted.
        """
        logger.info(f"  Processing: {file_path.name}")

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if not content.strip():
                logger.warning(f"  Skipping empty file: {file_path}")
                return 0

            # Step 1: Chunk by sections
            chunks = self.chunker.chunk_markdown_by_sections(content, str(file_path.relative_to(project_root)))

            # Step 2: Refine large chunks
            chunks = self.chunker.chunk_large_sections(chunks)

            logger.info(f"  Created {len(chunks)} chunks from {file_path.name}")

            # Step 3: Extract facts from each chunk
            total_facts = 0
            for chunk in chunks:
                # LLM-based extraction
                facts = self.extractor.extract_facts_from_chunk(chunk, service_context)

                # Pattern-based extraction (high-confidence)
                pattern_facts = self.extractor.extract_patterns(chunk.content)
                facts.extend(pattern_facts)

                # Store each fact
                for fact in facts:
                    self.store_memory(user_id, fact)
                    total_facts += 1

            logger.success(f"  ✅ Extracted {total_facts} facts from {file_path.name}")
            return total_facts

        except Exception as e:
            logger.error(f"  ❌ Error processing {file_path}: {e}")
            return 0

    def ingest_context(self, context_name: str, context_config: Dict):
        """Ingest all documents for a bounded context."""
        logger.info(f"Ingesting context: {context_name}")
        logger.info(f"Description: {context_config['description']}")

        # Get files to ingest
        ingest_paths = context_config.get('ingest_paths', [])
        files = self._expand_glob_patterns(ingest_paths)

        logger.info(f"Found {len(files)} files to process")

        total_facts = 0
        for file_path in files:
            facts_count = self.ingest_document(
                file_path,
                context_config['user_id'],
                context_config['description']
            )
            total_facts += facts_count

        logger.success(f"✅ Context '{context_name}' complete: {total_facts} facts extracted")

    def _expand_glob_patterns(self, patterns: List[str]) -> List[Path]:
        """Expand glob patterns to actual file paths."""
        files = []
        for pattern in patterns:
            matches = glob_module.glob(str(project_root / pattern), recursive=True)
            files.extend([Path(p) for p in matches if Path(p).is_file() and p.endswith('.md')])
        return files

    def cleanup(self):
        """Close database connections."""
        if self.db_conn and not self.db_conn.closed:
            self.db_conn.close()


def ingest_all_contexts():
    """Main entry point: Ingest all configured contexts."""
    logger.info("=" * 80)
    logger.info("PT-2 Optimized Documentation Ingestion (v2)")
    logger.info("=" * 80)

    contexts = config.get('contexts', [])
    logger.info(f"Found {len(contexts)} contexts to ingest")

    engine = OptimizedIngestionEngine()

    try:
        for context in contexts:
            logger.info("")
            logger.info("-" * 80)
            engine.ingest_context(context['name'], context)

        logger.info("")
        logger.info("=" * 80)
        logger.success("✅ All contexts ingested successfully!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"❌ Ingestion failed: {e}")
        raise
    finally:
        engine.cleanup()


if __name__ == "__main__":
    ingest_all_contexts()
