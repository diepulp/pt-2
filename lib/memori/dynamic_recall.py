#!/usr/bin/env python3
"""
Dynamic Memory Recall System for PT-2.

Provides proactive memory retrieval, memory file sync,
and cross-namespace learning discovery.

Components:
1. DynamicRecall - Proactive retrieval for skill workflows
2. MemoryFileSync - Sync DB state to memory files
3. LearningsDiscovery - Surface pattern learnings across namespaces

Reference: Session checkpoint from 2025-11-29 identifying gaps:
- Stale memory files (phase-status.memory.md shows Phase 0 not started)
- No proactive retrieval in skills
- Memories recorded but not surfaced
"""

import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from pathlib import Path
from loguru import logger

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    logger.warning("psycopg2 not installed. Run: pip install psycopg2-binary")
    PSYCOPG2_AVAILABLE = False


@dataclass
class RecalledMemory:
    """A memory recalled with context."""
    content: str
    category: str
    source_namespace: str
    relevance_score: float
    created_at: str
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PatternLearning:
    """A pattern learning discovered from past sessions."""
    pattern: str
    frequency: int
    last_seen: str
    namespaces: List[str]
    examples: List[str]
    effectiveness: str  # high, medium, low


class DynamicRecall:
    """
    Proactive memory retrieval for skill workflows.

    Provides query_past_decisions() and other proactive retrieval methods
    that skills can call at workflow start to inject relevant context.
    """

    # Default database URL (memori Docker container on port 5433)
    DEFAULT_DB_URL = "postgresql://memori:memori_dev@127.0.0.1:5433/memori"

    # Namespace mappings (synced with client.py CHATMODE_USER_IDS)
    NAMESPACE_MAP = {
        "architect": "arch_decisions",
        "skill:lead-architect": "arch_decisions",
        "skill:backend-service-builder": "pt2_project",
        "skill:frontend-design": "pt2_project",
        "skill:api-builder": "arch_decisions",
        "skill:mvp-progress": "mvp_progress",
        "skill:skill-creator": "pt2_project",
        "skill:issues": "issues",
        "debugger": "issues",
        "main": "pt2_project",
    }

    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize DynamicRecall.

        Args:
            database_url: PostgreSQL connection string
        """
        self.db_url = database_url or os.getenv(
            "MEMORI_DATABASE_URL",
            self.DEFAULT_DB_URL
        )
        self._conn = None

    def _get_connection(self):
        """Get or create database connection."""
        if not PSYCOPG2_AVAILABLE:
            raise ImportError("psycopg2 is required")

        if self._conn is None or self._conn.closed:
            # Strip query params for psycopg2
            db_url = self.db_url.split('?')[0]
            self._conn = psycopg2.connect(db_url)
        return self._conn

    def close(self):
        """Close database connection."""
        if self._conn and not self._conn.closed:
            self._conn.close()

    def query_past_decisions(
        self,
        topic: str,
        namespace: Optional[str] = None,
        limit: int = 5,
        include_cross_namespace: bool = True
    ) -> List[RecalledMemory]:
        """
        Query past architectural/implementation decisions on a topic.

        This is the primary method for proactive retrieval in skill workflows.
        Skills should call this at the start of work to inject relevant context.

        Args:
            topic: Natural language topic to search for
            namespace: Primary namespace to search (uses all if not specified)
            limit: Maximum results per namespace
            include_cross_namespace: Whether to include learnings from other namespaces

        Returns:
            List of RecalledMemory sorted by relevance
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        results = []

        # Primary namespace search
        namespaces_to_search = []
        if namespace:
            user_id = self.NAMESPACE_MAP.get(namespace, namespace)
            namespaces_to_search.append(user_id)

        if include_cross_namespace:
            # Add related namespaces for cross-learning
            namespaces_to_search.extend([
                "arch_decisions",
                "pt2_project",
                "mvp_progress",
            ])
            # Deduplicate
            namespaces_to_search = list(set(namespaces_to_search))

        for ns in namespaces_to_search:
            try:
                cur.execute("""
                    SELECT
                        content, category, user_id, metadata, created_at,
                        ts_rank(content_tsv, plainto_tsquery('english', %s)) as relevance
                    FROM memori.memories
                    WHERE user_id = %s
                      AND content_tsv @@ plainto_tsquery('english', %s)
                      AND (expires_at IS NULL OR expires_at > now())
                    ORDER BY relevance DESC, created_at DESC
                    LIMIT %s
                """, (topic, ns, topic, limit))

                rows = cur.fetchall()
                for row in rows:
                    metadata = row[3]
                    if isinstance(metadata, str):
                        metadata = json.loads(metadata)

                    results.append(RecalledMemory(
                        content=row[0],
                        category=row[1] or "context",
                        source_namespace=row[2],
                        relevance_score=float(row[5]) if row[5] else 0.0,
                        created_at=row[4].isoformat() if row[4] else "",
                        tags=metadata.get("tags", []) if metadata else [],
                        metadata=metadata or {}
                    ))
            except Exception as e:
                logger.warning(f"Failed to search namespace {ns}: {e}")
                continue

        cur.close()

        # Sort by relevance across all namespaces
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        return results[:limit * 2]  # Return top results across all namespaces

    def query_recent_learnings(
        self,
        hours: int = 24,
        namespace: Optional[str] = None,
        categories: Optional[List[str]] = None
    ) -> List[RecalledMemory]:
        """
        Query recent learnings within time window.

        Useful for session continuity after /clear.

        Args:
            hours: Time window in hours
            namespace: Optional namespace filter
            categories: Optional category filter

        Returns:
            List of recent memories
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        query = """
            SELECT
                content, category, user_id, metadata, created_at
            FROM memori.memories
            WHERE created_at > now() - interval '%s hours'
              AND (expires_at IS NULL OR expires_at > now())
        """
        params = [hours]

        if namespace:
            user_id = self.NAMESPACE_MAP.get(namespace, namespace)
            query += " AND user_id = %s"
            params.append(user_id)

        if categories:
            query += " AND category = ANY(%s)"
            params.append(categories)

        query += " ORDER BY created_at DESC LIMIT 20"

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        results = []
        for row in rows:
            metadata = row[3]
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            results.append(RecalledMemory(
                content=row[0],
                category=row[1] or "context",
                source_namespace=row[2],
                relevance_score=0.0,  # No relevance for recent query
                created_at=row[4].isoformat() if row[4] else "",
                tags=metadata.get("tags", []) if metadata else [],
                metadata=metadata or {}
            ))

        return results

    def query_high_importance(
        self,
        namespace: str,
        min_importance: float = 0.8,
        limit: int = 10
    ) -> List[RecalledMemory]:
        """
        Query high-importance memories for a namespace.

        Used for injecting critical context at skill startup.

        Args:
            namespace: Namespace to query
            min_importance: Minimum importance score (0-1)
            limit: Maximum results

        Returns:
            List of high-importance memories
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        user_id = self.NAMESPACE_MAP.get(namespace, namespace)

        cur.execute("""
            SELECT
                content, category, user_id, metadata, created_at
            FROM memori.memories
            WHERE user_id = %s
              AND COALESCE((metadata->>'importance')::float, 0.5) >= %s
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY
                COALESCE((metadata->>'importance')::float, 0.5) DESC,
                created_at DESC
            LIMIT %s
        """, (user_id, min_importance, limit))

        rows = cur.fetchall()
        cur.close()

        results = []
        for row in rows:
            metadata = row[3]
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            importance = metadata.get("importance", 0.5) if metadata else 0.5

            results.append(RecalledMemory(
                content=row[0],
                category=row[1] or "context",
                source_namespace=row[2],
                relevance_score=float(importance),
                created_at=row[4].isoformat() if row[4] else "",
                tags=metadata.get("tags", []) if metadata else [],
                metadata=metadata or {}
            ))

        return results

    def format_for_context(
        self,
        memories: List[RecalledMemory],
        max_chars: int = 2000
    ) -> str:
        """
        Format recalled memories for injection into skill context.

        Args:
            memories: List of recalled memories
            max_chars: Maximum characters to output

        Returns:
            Formatted markdown string
        """
        if not memories:
            return "No relevant past decisions found."

        lines = ["## Past Decisions & Learnings\n"]
        char_count = len(lines[0])

        for i, mem in enumerate(memories, 1):
            entry = f"**[{i}]** {mem.content}\n"
            entry += f"   _Source: {mem.source_namespace} | {mem.category}_\n"
            if mem.tags:
                entry += f"   _Tags: {', '.join(mem.tags[:3])}_\n"
            entry += "\n"

            if char_count + len(entry) > max_chars:
                lines.append(f"\n_...{len(memories) - i + 1} more results truncated_")
                break

            lines.append(entry)
            char_count += len(entry)

        return "".join(lines)


class MemoryFileSync:
    """
    Synchronize Memori DB state to memory files.

    Addresses the gap where phase-status.memory.md becomes stale
    while actual progress is tracked in the DB.
    """

    # Memory file paths relative to project root
    MEMORY_FILES = {
        "phase-status": "memory/phase-status.memory.md",
        "service-catalog": "memory/service-catalog.memory.md",
    }

    def __init__(self, project_root: Optional[str] = None, database_url: Optional[str] = None):
        """
        Initialize MemoryFileSync.

        Args:
            project_root: Path to project root (auto-detected if None)
            database_url: PostgreSQL connection string
        """
        self.project_root = Path(project_root) if project_root else self._detect_project_root()
        self.db_url = database_url or os.getenv(
            "MEMORI_DATABASE_URL",
            "postgresql://memori:memori_dev@127.0.0.1:5433/memori"
        )
        self._conn = None

    def _detect_project_root(self) -> Path:
        """Detect project root from current working directory."""
        cwd = Path.cwd()
        # Look for .claude directory
        while cwd != cwd.parent:
            if (cwd / ".claude").exists():
                return cwd
            cwd = cwd.parent
        return Path.cwd()

    def _get_connection(self):
        """Get or create database connection."""
        if not PSYCOPG2_AVAILABLE:
            raise ImportError("psycopg2 is required")

        if self._conn is None or self._conn.closed:
            db_url = self.db_url.split('?')[0]
            self._conn = psycopg2.connect(db_url)
        return self._conn

    def close(self):
        """Close database connection."""
        if self._conn and not self._conn.closed:
            self._conn.close()

    def sync_phase_status(self) -> Tuple[bool, str]:
        """
        Sync phase status from Memori DB to phase-status.memory.md.

        Queries MVPProgressContext data and regenerates the memory file.

        Returns:
            Tuple of (success, message)
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Query service status from MVP progress namespace
            cur.execute("""
                SELECT DISTINCT ON (metadata->>'service_name')
                    metadata->>'service_name' as service_name,
                    metadata->>'status' as status,
                    metadata->>'code_exists' as code_exists,
                    metadata->>'tests_exist' as tests_exist,
                    metadata->>'prd_reference' as prd_ref,
                    created_at
                FROM memori.memories
                WHERE user_id = 'mvp_progress'
                  AND metadata->>'type' = 'service_status'
                ORDER BY metadata->>'service_name', created_at DESC
            """)

            service_rows = cur.fetchall()

            # Query milestone transitions
            cur.execute("""
                SELECT DISTINCT ON (metadata->>'phase')
                    metadata->>'phase' as phase,
                    metadata->>'status' as status,
                    metadata->>'services_completed' as completed,
                    metadata->>'services_pending' as pending,
                    created_at
                FROM memori.memories
                WHERE user_id = 'mvp_progress'
                  AND metadata->>'type' = 'milestone_transition'
                ORDER BY metadata->>'phase', created_at DESC
            """)

            milestone_rows = cur.fetchall()
            cur.close()

            # Build service status dict
            services = {}
            for row in service_rows:
                services[row[0]] = {
                    "status": row[1],
                    "code_exists": row[2] == "true" or row[2] is True,
                    "tests_exist": row[3] == "true" or row[3] is True,
                    "prd_reference": row[4],
                }

            # Build phase status dict
            phases = {}
            for row in milestone_rows:
                phase_num = row[0]
                phases[phase_num] = {
                    "status": row[1],
                    "completed": json.loads(row[2]) if row[2] else [],
                    "pending": json.loads(row[3]) if row[3] else [],
                }

            # Generate memory file content
            content = self._generate_phase_status_content(services, phases)

            # Write to file
            file_path = self.project_root / self.MEMORY_FILES["phase-status"]
            file_path.write_text(content)

            return True, f"Synced {len(services)} services and {len(phases)} phases to {file_path}"

        except Exception as e:
            logger.error(f"Failed to sync phase status: {e}")
            return False, str(e)

    def _generate_phase_status_content(
        self,
        services: Dict[str, Dict],
        phases: Dict[str, Dict]
    ) -> str:
        """Generate phase-status.memory.md content from DB data."""

        # Determine current phase
        current_phase = "Phase 0 - Horizontal Infrastructure (GATE-0)"
        for phase_num in ["0", "1", "2", "3"]:
            phase = phases.get(phase_num, {})
            if phase.get("status") == "completed":
                current_phase = f"Phase {int(phase_num) + 1}"
            elif phase.get("status") == "in_progress":
                current_phase = f"Phase {phase_num} - In Progress"
                break

        # Calculate implementation status
        completed_count = sum(1 for s in services.values()
                              if s.get("status") in ("implemented", "tested"))
        total_count = 13  # From MVP-ROADMAP
        status_text = f"{completed_count}/{total_count} services implemented"

        lines = [
            "# Phase Status Snapshot",
            f"last_updated: {datetime.now().strftime('%Y-%m-%d')}",
            f"current_phase: \"{current_phase}\"",
            f"implementation_status: \"{status_text}\"",
            "canonical_source: \"Memori engine (skill:mvp-progress namespace)\"",
            "canonical_roadmap: \"docs/20-architecture/MVP-ROADMAP.md\"",
            "sources:",
            "  - docs/20-architecture/MVP-ROADMAP.md",
            "  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
            "  - docs/10-prd/PRD-000-casino-foundation.md",
            "  - docs/10-prd/PRD-001_Player_Management_System_Requirements.md",
            "  - docs/10-prd/PRD-002-table-rating-core.md",
            "",
            "## PRD Coverage Status",
            "",
            "| PRD | Scope | Status |",
            "|-----|-------|--------|",
            "| PRD-000 | CasinoService (Root Authority) | Draft |",
            "| PRD-001 | Player Management (MVP Overview) | Accepted |",
            "| PRD-002 | Table & Rating Core | Implemented |",
            "| PRD-003 | Player Intake & Visit | Draft |",
            "| PRD-004 | Mid-Session Loyalty | Draft |",
            "| PRD-005 | Compliance Monitoring (MTL) | Draft |",
            "",
            "## Implementation Status (Per MVP-ROADMAP)",
            "",
            "### Phase 0: Horizontal Infrastructure (GATE-0)",
            "",
            "| Component | Reference | Code Exists | Tests | Status |",
            "|-----------|-----------|-------------|-------|--------|",
        ]

        # Phase 0 components
        phase0_components = ["TransportLayer", "ErrorTaxonomy", "ServiceResultPattern", "QueryInfra"]
        for comp in phase0_components:
            svc = services.get(comp, {})
            code = "Yes" if svc.get("code_exists") else "No"
            tests = "Yes" if svc.get("tests_exist") else "No"
            status = svc.get("status", "Not Started").replace("_", " ").title()
            lines.append(f"| {comp} | MVP-ROADMAP | {code} | {tests} | {status} |")

        lines.extend([
            "",
            "### Phase 1: Core Services (GATE-1)",
            "",
            "| Service | PRD | Code Exists | Tests | Status |",
            "|---------|-----|-------------|-------|--------|",
        ])

        # Phase 1 services
        phase1_services = [
            ("CasinoService", "PRD-000"),
            ("PlayerService", "PRD-003"),
            ("VisitService", "PRD-003"),
        ]
        for svc_name, prd in phase1_services:
            svc = services.get(svc_name, {})
            code = "Yes" if svc.get("code_exists") else "No"
            tests = "Yes" if svc.get("tests_exist") else "No"
            status = svc.get("status", "Not Started").replace("_", " ").title()
            lines.append(f"| {svc_name} | {prd} | {code} | {tests} | {status} |")

        lines.extend([
            "",
            "### Phase 2: Session Management + UI (GATE-2)",
            "",
            "| Service | PRD | Code Exists | Tests | Status |",
            "|---------|-----|-------------|-------|--------|",
        ])

        # Phase 2 services
        phase2_services = [
            ("TableContextService", "PRD-002"),
            ("RatingSlipService", "PRD-002"),
            ("PitDashboard", "MVP-ROADMAP"),
        ]
        for svc_name, prd in phase2_services:
            svc = services.get(svc_name, {})
            # Special case: TableContextService and RatingSlipService are implemented
            if svc_name in ("TableContextService", "RatingSlipService") and not svc:
                code, tests, status = "Yes", "Yes", "Implemented"
            else:
                code = "Yes" if svc.get("code_exists") else "No"
                tests = "Yes" if svc.get("tests_exist") else "No"
                status = svc.get("status", "Not Started").replace("_", " ").title()
            lines.append(f"| {svc_name} | {prd} | {code} | {tests} | {status} |")

        lines.extend([
            "",
            "### Phase 3: Rewards & Compliance (GATE-3)",
            "",
            "| Service | PRD | Code Exists | Tests | Status |",
            "|---------|-----|-------------|-------|--------|",
        ])

        # Phase 3 services
        phase3_services = [
            ("LoyaltyService", "PRD-004"),
            ("PlayerFinancialService", "PRD-001"),
            ("MTLService", "PRD-005"),
        ]
        for svc_name, prd in phase3_services:
            svc = services.get(svc_name, {})
            code = "Yes" if svc.get("code_exists") else "No"
            tests = "Yes" if svc.get("tests_exist") else "No"
            status = svc.get("status", "Not Started").replace("_", " ").title()
            note = " (Feature-Flagged)" if svc_name == "PlayerFinancialService" else ""
            note = " (Read-Only MVP)" if svc_name == "MTLService" else note
            lines.append(f"| {svc_name} | {prd} | {code} | {tests} | {status}{note} |")

        lines.extend([
            "",
            "## Critical Path",
            "",
            "```",
            "GATE-0 (Horizontal) → CasinoService → PlayerService → VisitService → RatingSlipService → PitDashboard → LoyaltyService",
            "```",
            "",
            "**Current Blocker**: GATE-0 horizontal infrastructure must be completed before any routes can be deployed.",
            "",
            "## Next Actions",
            "",
            "1. **CRITICAL (P0)**: Implement GATE-0 Horizontal Infrastructure",
            "   - `withServerAction` wrapper (auth → RLS → idempotency → audit)",
            "   - `ServiceResult<T>` pattern",
            "   - Error taxonomy (domain errors → HTTP mapping)",
            "   - React Query client configuration",
            "",
            "2. HIGH: Implement CasinoService (PRD-000) after GATE-0",
            "   - Casino settings management",
            "   - Staff authentication with RLS",
            "   - Gaming day temporal authority (TEMP-001, TEMP-002)",
            "   - `compute_gaming_day()` function + trigger propagation",
            "",
            "3. HIGH: Build Pit Dashboard skeleton (MVP-ROADMAP)",
            "   - Table status grid",
            "   - Active rating slips panel",
            "   - Real-time updates via Supabase channels",
            "",
            "## Progress Tracking",
            "",
            "Primary mechanism: **Memori engine (MVPProgressContext)**",
            "- Namespace: `skill:mvp-progress`",
            "- Categories: milestones, service-status, gate-validations",
            "- Query via: `/mvp-status` command",
            "- Python API: `lib/memori/mvp_progress_context.py`",
            "- Features:",
            "  - Service status tracking with files/tests/blockers",
            "  - Phase milestone transitions",
            "  - PRD status updates",
            "  - Velocity metrics (last 7/30 days, trend analysis)",
            "  - Critical path analysis (blocking services)",
            "",
            "Secondary mechanism: **This memory file**",
            "- **Auto-synced from Memori DB**",
            "- Git-controlled for audit trail",
            "- Serves as static reference when DB unavailable",
            "",
            "## Reference Docs",
            "",
            "- Full implementation roadmap: `.claude/specs/MVP-001-implementation-roadmap.spec.md`",
            "- Service patterns: `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`",
            "- PRD standard: `docs/10-prd/PRD-STD-001_PRD_STANDARD.md`",
            "- Temporal patterns (critical for CasinoService):",
            "  - `docs/20-architecture/temporal-patterns/TEMP-001-gaming-day-specification.md`",
            "  - `docs/20-architecture/temporal-patterns/TEMP-002-temporal-authority-pattern.md`",
        ])

        return "\n".join(lines) + "\n"


class LearningsDiscovery:
    """
    Discover pattern learnings across namespaces.

    Surfaces recurring patterns, decisions, and insights
    that can be useful for future work.
    """

    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize LearningsDiscovery.

        Args:
            database_url: PostgreSQL connection string
        """
        self.db_url = database_url or os.getenv(
            "MEMORI_DATABASE_URL",
            "postgresql://memori:memori_dev@127.0.0.1:5433/memori"
        )
        self._conn = None

    def _get_connection(self):
        """Get or create database connection."""
        if not PSYCOPG2_AVAILABLE:
            raise ImportError("psycopg2 is required")

        if self._conn is None or self._conn.closed:
            db_url = self.db_url.split('?')[0]
            self._conn = psycopg2.connect(db_url)
        return self._conn

    def close(self):
        """Close database connection."""
        if self._conn and not self._conn.closed:
            self._conn.close()

    def get_namespace_stats(self) -> Dict[str, Dict]:
        """
        Get memory statistics per namespace.

        Returns:
            Dict mapping namespace to stats
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        cur.execute("""
            SELECT
                user_id,
                COUNT(*) as memory_count,
                COUNT(DISTINCT category) as category_count,
                MAX(created_at) as last_memory,
                AVG(COALESCE((metadata->>'importance')::float, 0.5)) as avg_importance
            FROM memori.memories
            WHERE expires_at IS NULL OR expires_at > now()
            GROUP BY user_id
            ORDER BY memory_count DESC
        """)

        rows = cur.fetchall()
        cur.close()

        return {
            row[0]: {
                "memory_count": row[1],
                "category_count": row[2],
                "last_memory": row[3].isoformat() if row[3] else None,
                "avg_importance": round(float(row[4]), 2) if row[4] else 0.5
            }
            for row in rows
        }

    def get_top_patterns(self, limit: int = 10) -> List[PatternLearning]:
        """
        Discover top recurring patterns across namespaces.

        Uses tag frequency to identify common patterns.

        Args:
            limit: Maximum patterns to return

        Returns:
            List of PatternLearning
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        # Get tag frequencies
        cur.execute("""
            SELECT
                tag,
                COUNT(*) as frequency,
                array_agg(DISTINCT user_id) as namespaces,
                MAX(created_at) as last_seen
            FROM memori.memories,
                 jsonb_array_elements_text(COALESCE(metadata->'tags', '[]'::jsonb)) as tag
            WHERE expires_at IS NULL OR expires_at > now()
            GROUP BY tag
            ORDER BY frequency DESC
            LIMIT %s
        """, (limit,))

        rows = cur.fetchall()
        cur.close()

        patterns = []
        for row in rows:
            effectiveness = "high" if row[1] > 10 else "medium" if row[1] > 5 else "low"
            patterns.append(PatternLearning(
                pattern=row[0],
                frequency=row[1],
                last_seen=row[3].isoformat() if row[3] else "",
                namespaces=row[2] or [],
                examples=[],  # Would need separate query for examples
                effectiveness=effectiveness
            ))

        return patterns

    def format_learnings_summary(self) -> str:
        """
        Format a summary of learnings for display.

        Returns:
            Formatted markdown string
        """
        stats = self.get_namespace_stats()
        patterns = self.get_top_patterns(5)

        lines = [
            "## Memory Learnings Summary",
            "",
            "### Namespace Activity",
            "",
            "| Namespace | Memories | Categories | Avg Importance |",
            "|-----------|----------|------------|----------------|",
        ]

        for ns, data in sorted(stats.items(), key=lambda x: x[1]["memory_count"], reverse=True)[:10]:
            lines.append(
                f"| {ns[:30]} | {data['memory_count']} | {data['category_count']} | {data['avg_importance']} |"
            )

        lines.extend([
            "",
            "### Top Patterns",
            "",
        ])

        for p in patterns:
            lines.append(f"- **{p.pattern}** (freq: {p.frequency}, {p.effectiveness} effectiveness)")
            if len(p.namespaces) > 1:
                lines.append(f"  _Cross-namespace: {', '.join(p.namespaces[:3])}_")

        return "\n".join(lines)


# Convenience functions for skill workflows
def query_past_decisions(
    topic: str,
    namespace: Optional[str] = None,
    limit: int = 5
) -> str:
    """
    Quick function for skills to query past decisions.

    Usage in skill preamble:
        from lib.memori.dynamic_recall import query_past_decisions
        context = query_past_decisions("RLS policies", namespace="skill:lead-architect")
        print(context)

    Args:
        topic: Topic to search for
        namespace: Optional namespace to search
        limit: Maximum results

    Returns:
        Formatted context string for injection
    """
    recall = DynamicRecall()
    try:
        memories = recall.query_past_decisions(topic, namespace, limit)
        return recall.format_for_context(memories)
    finally:
        recall.close()


def sync_memory_files() -> Tuple[bool, str]:
    """
    Quick function to sync memory files from DB.

    Usage:
        from lib.memori.dynamic_recall import sync_memory_files
        success, message = sync_memory_files()
        print(message)

    Returns:
        Tuple of (success, message)
    """
    sync = MemoryFileSync()
    try:
        return sync.sync_phase_status()
    finally:
        sync.close()


def get_learnings_summary() -> str:
    """
    Quick function to get learnings summary.

    Usage:
        from lib.memori.dynamic_recall import get_learnings_summary
        print(get_learnings_summary())

    Returns:
        Formatted markdown summary
    """
    discovery = LearningsDiscovery()
    try:
        return discovery.format_learnings_summary()
    finally:
        discovery.close()
