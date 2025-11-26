"""
Memori SDK integration for PT-2 agentic workflows.

This module provides a wrapper around the Memori SDK for session memory management,
chatmode-specific context isolation, and workflow state tracking.

Extended with Context Management Layer components:
- retrieval: PostgreSQL full-text search with composite scoring
- pipeline: Memory generation ETL from session events
"""

from .client import create_memori_client, MemoriClient
from .workflow_state import WorkflowStateManager
from .chatmode_context import ChatmodeContext
from .skill_context import SkillContext, ValidationContext
from .retrieval import (
    MemoryRetriever,
    RetrievalConfig,
    RetrievedMemory,
)
from .pipeline import (
    MemoryGenerationPipeline,
    CandidateMemory,
    ConsolidationResult,
    run_pipeline_for_session,
)

__all__ = [
    # Original exports
    "create_memori_client",
    "MemoriClient",
    "WorkflowStateManager",
    "ChatmodeContext",
    "SkillContext",
    "ValidationContext",
    # Context Management - Retrieval
    "MemoryRetriever",
    "RetrievalConfig",
    "RetrievedMemory",
    # Context Management - Pipeline
    "MemoryGenerationPipeline",
    "CandidateMemory",
    "ConsolidationResult",
    "run_pipeline_for_session",
]
