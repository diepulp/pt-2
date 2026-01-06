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
from .skill_context import SkillContext, ValidationContext, ArchitectContext
from .backend_service_context import BackendServiceContext, PatternStats, PrimitiveProposal, RegressionAlert
from .pipeline_context import PipelineContext, ExecutorStats, GateStats, PipelineRegressionAlert
from .mvp_progress_context import (
    MVPProgressContext,
    ServiceStatus,
    PhaseStatus,
    VelocityMetrics,
    create_mvp_progress_context,
)
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
from .dynamic_recall import (
    DynamicRecall,
    MemoryFileSync,
    LearningsDiscovery,
    RecalledMemory,
    PatternLearning,
    query_past_decisions,
    sync_memory_files,
    get_learnings_summary,
)

__all__ = [
    # Original exports
    "create_memori_client",
    "MemoriClient",
    "WorkflowStateManager",
    "ChatmodeContext",
    "SkillContext",
    "ValidationContext",
    "ArchitectContext",
    # Self-Improving Intelligence - Backend
    "BackendServiceContext",
    "PatternStats",
    "PrimitiveProposal",
    "RegressionAlert",
    # Self-Improving Intelligence - Pipeline
    "PipelineContext",
    "ExecutorStats",
    "GateStats",
    "PipelineRegressionAlert",
    # MVP Progress Tracking
    "MVPProgressContext",
    "ServiceStatus",
    "PhaseStatus",
    "VelocityMetrics",
    "create_mvp_progress_context",
    # Context Management - Retrieval
    "MemoryRetriever",
    "RetrievalConfig",
    "RetrievedMemory",
    # Context Management - Pipeline
    "MemoryGenerationPipeline",
    "CandidateMemory",
    "ConsolidationResult",
    "run_pipeline_for_session",
    # Dynamic Recall
    "DynamicRecall",
    "MemoryFileSync",
    "LearningsDiscovery",
    "RecalledMemory",
    "PatternLearning",
    "query_past_decisions",
    "sync_memory_files",
    "get_learnings_summary",
]
