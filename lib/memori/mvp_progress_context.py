#!/usr/bin/env python3
"""
MVP Progress tracking context for PT-2 agentic workflows.

Provides specialized memory recording for MVP milestone tracking,
service implementation status, PRD coverage, and phase gate validations.

Namespace: skill:mvp-progress
"""

from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from loguru import logger

from .client import MemoriClient


@dataclass
class ServiceStatus:
    """Service implementation status record."""
    service_name: str
    prd_reference: str
    status: str  # not_started, in_progress, implemented, tested
    code_exists: bool
    tests_exist: bool
    files_created: List[str]
    validation_gates_passed: List[int]
    blockers: List[str]
    last_updated: str


@dataclass
class PhaseStatus:
    """Phase milestone status record."""
    phase_number: int
    phase_name: str
    gate_number: int
    status: str  # not_started, in_progress, completed, blocked
    services_required: List[str]
    services_completed: List[str]
    services_pending: List[str]
    blockers: List[str]


@dataclass
class VelocityMetrics:
    """MVP velocity metrics."""
    services_completed_total: int
    services_completed_last_7_days: int
    services_completed_last_30_days: int
    avg_days_per_service: float
    estimated_days_to_completion: float
    trend: str  # accelerating, stable, slowing


class MVPProgressContext:
    """
    MVP Progress tracking context manager.

    Provides specialized memory recording methods for:
    - Service implementation status tracking
    - Phase milestone transitions
    - PRD coverage status
    - Validation gate completions
    - Velocity metrics and critical path analysis

    Namespace: skill:mvp-progress
    """

    # MVP Phase definitions from MVP-ROADMAP.md
    PHASE_DEFINITIONS = {
        0: {
            "name": "Horizontal Infrastructure",
            "gate": 0,
            "services": ["TransportLayer", "ErrorTaxonomy", "ServiceResultPattern", "QueryInfra"],
        },
        1: {
            "name": "Core Services",
            "gate": 1,
            "services": ["CasinoService", "PlayerService", "VisitService"],
        },
        2: {
            "name": "Session Management + UI",
            "gate": 2,
            "services": ["TableContextService", "RatingSlipService", "PitDashboard"],
        },
        3: {
            "name": "Rewards & Compliance",
            "gate": 3,
            "services": ["LoyaltyService", "PlayerFinancialService", "MTLService"],
        },
    }

    # Service/Component to PRD/Doc mapping
    SERVICE_PRD_MAP = {
        # Phase 0: Horizontal Infrastructure
        "TransportLayer": "ARCH-MVP-ROADMAP",
        "ErrorTaxonomy": "ARCH-MVP-ROADMAP",
        "ServiceResultPattern": "ARCH-MVP-ROADMAP",
        "QueryInfra": "ARCH-MVP-ROADMAP",
        # Phase 1: Core Services
        "CasinoService": "PRD-000",
        "PlayerService": "PRD-003",
        "VisitService": "PRD-003",
        # Phase 2: Session Management + UI
        "TableContextService": "PRD-007",
        "RatingSlipService": "PRD-002",
        "PitDashboard": "ARCH-MVP-ROADMAP",
        # Phase 3: Rewards & Compliance
        "LoyaltyService": "PRD-004",
        "PlayerFinancialService": "PRD-001",
        "MTLService": "PRD-005",
    }

    def __init__(self, memori_client: MemoriClient):
        """
        Initialize MVP progress context manager.

        Args:
            memori_client: Memori client instance (should use skill:mvp-progress namespace)
        """
        self.memori = memori_client
        self.skill_namespace = memori_client.chatmode

    # -------------------------------------------------------------------------
    # Service Status Recording
    # -------------------------------------------------------------------------

    def record_service_status(
        self,
        service_name: str,
        status: str,  # not_started, in_progress, implemented, tested
        prd_reference: Optional[str] = None,
        code_exists: bool = False,
        tests_exist: bool = False,
        files_created: Optional[List[str]] = None,
        validation_gates_passed: Optional[List[int]] = None,
        blockers: Optional[List[str]] = None,
        issues_encountered: Optional[List[str]] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Record service implementation status change.

        Args:
            service_name: Name of the service (e.g., "CasinoService")
            status: Current status (not_started, in_progress, implemented, tested)
            prd_reference: PRD that defines this service (auto-detected if not provided)
            code_exists: Whether implementation code exists
            tests_exist: Whether tests exist
            files_created: List of files created for this service
            validation_gates_passed: List of gate numbers passed
            blockers: Current blockers preventing progress
            issues_encountered: Issues encountered during implementation
            notes: Additional context notes

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        # Auto-detect PRD reference if not provided
        if prd_reference is None:
            prd_reference = self.SERVICE_PRD_MAP.get(service_name, "unknown")

        content = f"Service status: {service_name} -> {status}"

        metadata = {
            "type": "service_status",
            "service_name": service_name,
            "prd_reference": prd_reference,
            "status": status,
            "code_exists": code_exists,
            "tests_exist": tests_exist,
            "timestamp": datetime.now().isoformat(),
        }

        if files_created:
            metadata["files_created"] = files_created
        if validation_gates_passed:
            metadata["validation_gates_passed"] = validation_gates_passed
        if blockers:
            metadata["blockers"] = blockers
        if issues_encountered:
            metadata["issues_encountered"] = issues_encountered
        if notes:
            metadata["notes"] = notes

        # Determine phase for this service
        phase_number = self._get_phase_for_service(service_name)
        if phase_number:
            metadata["phase"] = phase_number

        tags = ["service-status", status, service_name.lower()]
        if prd_reference != "unknown":
            tags.append(prd_reference.lower())

        # Higher importance for completed services
        importance = 0.9 if status in ("implemented", "tested") else 0.7

        result = self.memori.record_memory(
            content=content,
            category="milestones",
            metadata=metadata,
            importance=importance,
            tags=tags
        )

        if result:
            logger.info(f"Recorded service status: {service_name} -> {status}")

        return result is not None

    def record_service_completion(
        self,
        service_name: str,
        files_created: List[str],
        test_coverage: Optional[float] = None,
        validation_gates_passed: Optional[List[int]] = None,
        implementation_notes: Optional[str] = None
    ) -> bool:
        """
        Record service implementation completion (convenience method).

        Args:
            service_name: Name of the completed service
            files_created: List of files created
            test_coverage: Test coverage percentage (0-100)
            validation_gates_passed: List of validation gates passed
            implementation_notes: Notes about the implementation

        Returns:
            True if recorded successfully
        """
        return self.record_service_status(
            service_name=service_name,
            status="implemented",
            code_exists=True,
            tests_exist=test_coverage is not None and test_coverage > 0,
            files_created=files_created,
            validation_gates_passed=validation_gates_passed,
            notes=implementation_notes
        )

    # -------------------------------------------------------------------------
    # Phase/Milestone Recording
    # -------------------------------------------------------------------------

    def record_milestone_transition(
        self,
        phase: int,
        status: str,  # in_progress, completed, blocked
        services_completed: Optional[List[str]] = None,
        services_pending: Optional[List[str]] = None,
        blockers: Optional[List[str]] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Record phase milestone transition.

        Args:
            phase: Phase number (1, 2, or 3)
            status: New phase status (in_progress, completed, blocked)
            services_completed: List of completed services in this phase
            services_pending: List of pending services in this phase
            blockers: Blockers preventing phase completion
            notes: Additional notes

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        phase_def = self.PHASE_DEFINITIONS.get(phase, {})
        phase_name = phase_def.get("name", f"Phase {phase}")
        gate_number = phase_def.get("gate", phase)

        content = f"Milestone transition: Phase {phase} ({phase_name}) -> {status}"

        metadata = {
            "type": "milestone_transition",
            "phase": phase,
            "phase_name": phase_name,
            "gate_number": gate_number,
            "status": status,
            "services_required": phase_def.get("services", []),
            "timestamp": datetime.now().isoformat(),
        }

        if services_completed:
            metadata["services_completed"] = services_completed
        if services_pending:
            metadata["services_pending"] = services_pending
        if blockers:
            metadata["blockers"] = blockers
        if notes:
            metadata["notes"] = notes

        tags = ["milestone", f"phase-{phase}", f"gate-{gate_number}", status]

        # High importance for milestone transitions
        importance = 0.95

        result = self.memori.record_memory(
            content=content,
            category="milestones",
            metadata=metadata,
            importance=importance,
            tags=tags
        )

        if result:
            logger.info(f"Recorded milestone: Phase {phase} -> {status}")

        return result is not None

    def record_gate_validation(
        self,
        gate_number: int,
        passed: bool,
        validation_type: str,  # schema, tests, docs, integration
        errors_found: int = 0,
        warnings_found: int = 0,
        details: Optional[str] = None
    ) -> bool:
        """
        Record validation gate result.

        Args:
            gate_number: Gate number (1, 2, or 3)
            passed: Whether validation passed
            validation_type: Type of validation performed
            errors_found: Number of errors found
            warnings_found: Number of warnings found
            details: Detailed results

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        outcome = "passed" if passed else "failed"
        content = f"Gate {gate_number} validation ({validation_type}): {outcome}"

        metadata = {
            "type": "gate_validation",
            "gate_number": gate_number,
            "passed": passed,
            "validation_type": validation_type,
            "errors_found": errors_found,
            "warnings_found": warnings_found,
            "timestamp": datetime.now().isoformat(),
        }

        if details:
            metadata["details"] = details

        tags = ["gate-validation", f"gate-{gate_number}", validation_type, outcome]

        importance = 0.9 if passed else 0.85

        result = self.memori.record_memory(
            content=content,
            category="gate-validations",
            metadata=metadata,
            importance=importance,
            tags=tags
        )

        return result is not None

    # -------------------------------------------------------------------------
    # PRD Status Recording
    # -------------------------------------------------------------------------

    def record_prd_status(
        self,
        prd_id: str,
        status: str,  # draft, review, accepted, implemented
        scope: Optional[str] = None,
        services_defined: Optional[List[str]] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Record PRD status change.

        Args:
            prd_id: PRD identifier (e.g., "PRD-000")
            status: Current status (draft, review, accepted, implemented)
            scope: PRD scope description
            services_defined: Services defined by this PRD
            notes: Additional notes

        Returns:
            True if recorded successfully
        """
        if not self.memori.enabled:
            return False

        content = f"PRD status: {prd_id} -> {status}"

        metadata = {
            "type": "prd_status",
            "prd_id": prd_id,
            "status": status,
            "timestamp": datetime.now().isoformat(),
        }

        if scope:
            metadata["scope"] = scope
        if services_defined:
            metadata["services_defined"] = services_defined
        if notes:
            metadata["notes"] = notes

        tags = ["prd-status", prd_id.lower(), status]

        importance = 0.8

        result = self.memori.record_memory(
            content=content,
            category="milestones",
            metadata=metadata,
            importance=importance,
            tags=tags
        )

        return result is not None

    # -------------------------------------------------------------------------
    # Query Methods
    # -------------------------------------------------------------------------

    def get_service_status(self, service_name: str) -> Optional[ServiceStatus]:
        """
        Get current status of a specific service.

        Args:
            service_name: Name of the service

        Returns:
            ServiceStatus dataclass or None if not found
        """
        if not self.memori.enabled:
            return None

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Get most recent status for this service
            cur.execute("""
                SELECT metadata, created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'service_status'
                  AND metadata->>'service_name' = %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (self.memori.user_id, service_name))

            row = cur.fetchone()
            cur.close()
            conn.close()

            if not row:
                return None

            metadata = row[0]
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            return ServiceStatus(
                service_name=metadata.get("service_name", service_name),
                prd_reference=metadata.get("prd_reference", "unknown"),
                status=metadata.get("status", "not_started"),
                code_exists=metadata.get("code_exists", False),
                tests_exist=metadata.get("tests_exist", False),
                files_created=metadata.get("files_created", []),
                validation_gates_passed=metadata.get("validation_gates_passed", []),
                blockers=metadata.get("blockers", []),
                last_updated=row[1].isoformat() if row[1] else ""
            )

        except Exception as e:
            logger.error(f"Failed to get service status: {e}")
            return None

    def get_all_service_statuses(self) -> Dict[str, ServiceStatus]:
        """
        Get current status of all services.

        Returns:
            Dict mapping service name to ServiceStatus
        """
        if not self.memori.enabled:
            return {}

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Get most recent status for each service using DISTINCT ON
            cur.execute("""
                SELECT DISTINCT ON (metadata->>'service_name')
                    metadata, created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'service_status'
                ORDER BY metadata->>'service_name', created_at DESC
            """, (self.memori.user_id,))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            results = {}
            for row in rows:
                metadata = row[0]
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)

                service_name = metadata.get("service_name")
                if service_name:
                    results[service_name] = ServiceStatus(
                        service_name=service_name,
                        prd_reference=metadata.get("prd_reference", "unknown"),
                        status=metadata.get("status", "not_started"),
                        code_exists=metadata.get("code_exists", False),
                        tests_exist=metadata.get("tests_exist", False),
                        files_created=metadata.get("files_created", []),
                        validation_gates_passed=metadata.get("validation_gates_passed", []),
                        blockers=metadata.get("blockers", []),
                        last_updated=row[1].isoformat() if row[1] else ""
                    )

            return results

        except Exception as e:
            logger.error(f"Failed to get all service statuses: {e}")
            return {}

    def get_phase_status(self, phase: int) -> Optional[PhaseStatus]:
        """
        Get current status of a specific phase.

        Args:
            phase: Phase number (1, 2, or 3)

        Returns:
            PhaseStatus dataclass or None
        """
        phase_def = self.PHASE_DEFINITIONS.get(phase)
        if not phase_def:
            return None

        # Get service statuses for services in this phase
        all_statuses = self.get_all_service_statuses()

        services_required = phase_def.get("services", [])
        services_completed = []
        services_pending = []
        blockers = []

        for service in services_required:
            status = all_statuses.get(service)
            if status and status.status in ("implemented", "tested"):
                services_completed.append(service)
            else:
                services_pending.append(service)
                if status and status.blockers:
                    blockers.extend(status.blockers)

        # Determine phase status
        if len(services_completed) == len(services_required):
            phase_status = "completed"
        elif blockers:
            phase_status = "blocked"
        elif services_completed:
            phase_status = "in_progress"
        else:
            phase_status = "not_started"

        return PhaseStatus(
            phase_number=phase,
            phase_name=phase_def.get("name", f"Phase {phase}"),
            gate_number=phase_def.get("gate", phase),
            status=phase_status,
            services_required=services_required,
            services_completed=services_completed,
            services_pending=services_pending,
            blockers=list(set(blockers))  # Deduplicate
        )

    def get_overall_progress(self) -> Dict[str, Any]:
        """
        Get overall MVP progress summary.

        Returns:
            Dict with overall progress metrics
        """
        all_statuses = self.get_all_service_statuses()

        total_services = len(self.SERVICE_PRD_MAP)
        completed = sum(1 for s in all_statuses.values()
                       if s.status in ("implemented", "tested"))
        in_progress = sum(1 for s in all_statuses.values()
                         if s.status == "in_progress")
        not_started = total_services - completed - in_progress

        # Get phase statuses
        phase_statuses = {}
        for phase_num in self.PHASE_DEFINITIONS.keys():
            phase_statuses[f"phase_{phase_num}"] = self.get_phase_status(phase_num)

        # Calculate completion percentage
        completion_pct = (completed / total_services * 100) if total_services > 0 else 0

        return {
            "total_services": total_services,
            "completed": completed,
            "in_progress": in_progress,
            "not_started": not_started,
            "completion_percentage": round(completion_pct, 1),
            "phases": phase_statuses,
            "service_statuses": all_statuses,
            "timestamp": datetime.now().isoformat(),
        }

    def get_critical_path(self) -> List[Dict[str, Any]]:
        """
        Get critical path analysis - services that block others.

        Returns:
            List of critical path items with dependencies
        """
        # Based on the PT-2 service dependencies from architecture docs
        critical_path = [
            {
                "service": "CasinoService",
                "prd": "PRD-000",
                "reason": "Root authority - Temporal Authority owner (TEMP-001, TEMP-002)",
                "blocks": ["PlayerService", "VisitService", "TableContextService", "All downstream"],
                "priority": 1,
            },
            {
                "service": "PlayerService",
                "prd": "PRD-003",
                "reason": "Identity context - Player profiles and enrollment",
                "blocks": ["VisitService", "RatingSlipService", "LoyaltyService"],
                "priority": 2,
            },
            {
                "service": "VisitService",
                "prd": "PRD-003",
                "reason": "Session lifecycle - Check-in/check-out workflow",
                "blocks": ["RatingSlipService", "LoyaltyService"],
                "priority": 3,
            },
        ]

        # Mark status for each critical path item
        all_statuses = self.get_all_service_statuses()
        for item in critical_path:
            status = all_statuses.get(item["service"])
            item["status"] = status.status if status else "not_started"
            item["is_blocking"] = item["status"] not in ("implemented", "tested")

        return critical_path

    # -------------------------------------------------------------------------
    # Velocity Metrics
    # -------------------------------------------------------------------------

    def get_velocity_metrics(self, days: int = 30) -> VelocityMetrics:
        """
        Calculate MVP velocity metrics.

        Args:
            days: Number of days to analyze for recent velocity

        Returns:
            VelocityMetrics dataclass
        """
        if not self.memori.enabled:
            return VelocityMetrics(
                services_completed_total=0,
                services_completed_last_7_days=0,
                services_completed_last_30_days=0,
                avg_days_per_service=0,
                estimated_days_to_completion=0,
                trend="unknown"
            )

        try:
            import psycopg2
            import json

            db_url = self.memori.config.database_url.split('?')[0]
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SET search_path TO memori, public")

            # Get all completion events
            cur.execute("""
                SELECT metadata, created_at
                FROM memori.memories
                WHERE user_id = %s
                  AND metadata->>'type' = 'service_status'
                  AND metadata->>'status' IN ('implemented', 'tested')
                ORDER BY created_at
            """, (self.memori.user_id,))

            rows = cur.fetchall()
            cur.close()
            conn.close()

            now = datetime.now()
            seven_days_ago = now - timedelta(days=7)
            thirty_days_ago = now - timedelta(days=30)

            # Track unique service completions
            completed_services = set()
            completed_last_7 = set()
            completed_last_30 = set()
            completion_dates = []

            for row in rows:
                metadata = row[0]
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)

                service = metadata.get("service_name")
                created = row[1]

                if service and service not in completed_services:
                    completed_services.add(service)
                    completion_dates.append(created)

                    if created >= thirty_days_ago:
                        completed_last_30.add(service)
                    if created >= seven_days_ago:
                        completed_last_7.add(service)

            total_completed = len(completed_services)
            last_7 = len(completed_last_7)
            last_30 = len(completed_last_30)

            # Calculate average days per service
            if len(completion_dates) >= 2:
                total_days = (completion_dates[-1] - completion_dates[0]).days
                avg_days = total_days / (len(completion_dates) - 1) if len(completion_dates) > 1 else 0
            else:
                avg_days = 0

            # Estimate days to completion
            remaining = len(self.SERVICE_PRD_MAP) - total_completed
            estimated_days = remaining * avg_days if avg_days > 0 else float('inf')

            # Determine trend
            if last_7 > last_30 / 4:  # More than expected weekly rate
                trend = "accelerating"
            elif last_7 < last_30 / 8:  # Less than half expected
                trend = "slowing"
            else:
                trend = "stable"

            return VelocityMetrics(
                services_completed_total=total_completed,
                services_completed_last_7_days=last_7,
                services_completed_last_30_days=last_30,
                avg_days_per_service=round(avg_days, 1),
                estimated_days_to_completion=round(estimated_days, 1) if estimated_days != float('inf') else -1,
                trend=trend
            )

        except Exception as e:
            logger.error(f"Failed to calculate velocity metrics: {e}")
            return VelocityMetrics(
                services_completed_total=0,
                services_completed_last_7_days=0,
                services_completed_last_30_days=0,
                avg_days_per_service=0,
                estimated_days_to_completion=0,
                trend="error"
            )

    # -------------------------------------------------------------------------
    # Formatted Output Methods
    # -------------------------------------------------------------------------

    def format_progress_summary(self) -> str:
        """
        Format a markdown summary of MVP progress for display.

        Returns:
            Formatted markdown string
        """
        progress = self.get_overall_progress()
        velocity = self.get_velocity_metrics()
        critical_path = self.get_critical_path()

        lines = [
            "# MVP Progress Summary",
            "",
            f"**Last Updated:** {progress['timestamp'][:19]}",
            "",
            "## Overall Progress",
            "",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Services | {progress['total_services']} |",
            f"| Completed | {progress['completed']} |",
            f"| In Progress | {progress['in_progress']} |",
            f"| Not Started | {progress['not_started']} |",
            f"| **Completion** | **{progress['completion_percentage']}%** |",
            "",
            "## Phase Status",
            "",
            "| Phase | Name | Status | Completed | Pending |",
            "|-------|------|--------|-----------|---------|",
        ]

        for phase_num in sorted(self.PHASE_DEFINITIONS.keys()):
            phase = progress['phases'].get(f'phase_{phase_num}')
            if phase:
                status_icon = {
                    "completed": "DONE",
                    "in_progress": "WIP",
                    "blocked": "BLOCKED",
                    "not_started": "TODO",
                }.get(phase.status, phase.status)

                lines.append(
                    f"| {phase.phase_number} | {phase.phase_name} | {status_icon} | "
                    f"{len(phase.services_completed)} | {len(phase.services_pending)} |"
                )

        lines.extend([
            "",
            "## Critical Path",
            "",
        ])

        for item in critical_path:
            status_icon = "DONE" if not item["is_blocking"] else "BLOCKING"
            lines.append(f"- **{item['service']}** ({item['prd']}) - {status_icon}")
            lines.append(f"  - {item['reason']}")
            if item["is_blocking"]:
                lines.append(f"  - Blocks: {', '.join(item['blocks'])}")

        lines.extend([
            "",
            "## Velocity Metrics",
            "",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Completed | {velocity.services_completed_total} |",
            f"| Last 7 Days | {velocity.services_completed_last_7_days} |",
            f"| Last 30 Days | {velocity.services_completed_last_30_days} |",
            f"| Avg Days/Service | {velocity.avg_days_per_service} |",
            f"| Est. Days to Complete | {velocity.estimated_days_to_completion if velocity.estimated_days_to_completion > 0 else 'N/A'} |",
            f"| Trend | {velocity.trend} |",
        ])

        return "\n".join(lines)

    def format_service_table(self) -> str:
        """
        Format service status table for display.

        Returns:
            Formatted markdown table
        """
        all_statuses = self.get_all_service_statuses()

        lines = [
            "## Service Implementation Status",
            "",
            "| Service | PRD | Code | Tests | Status |",
            "|---------|-----|------|-------|--------|",
        ]

        for service_name in sorted(self.SERVICE_PRD_MAP.keys()):
            prd = self.SERVICE_PRD_MAP[service_name]
            status = all_statuses.get(service_name)

            if status:
                code = "Yes" if status.code_exists else "No"
                tests = "Yes" if status.tests_exist else "No"
                status_text = status.status.replace("_", " ").title()
            else:
                code = "No"
                tests = "No"
                status_text = "Not Started"

            lines.append(f"| {service_name} | {prd} | {code} | {tests} | {status_text} |")

        return "\n".join(lines)

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _get_phase_for_service(self, service_name: str) -> Optional[int]:
        """Get the phase number for a given service."""
        for phase_num, phase_def in self.PHASE_DEFINITIONS.items():
            if service_name in phase_def.get("services", []):
                return phase_num
        return None


def create_mvp_progress_context() -> MVPProgressContext:
    """
    Factory function to create MVP progress context.

    Returns:
        Configured MVPProgressContext instance
    """
    from .client import create_memori_client

    client = create_memori_client("skill:mvp-progress")
    client.enable()
    return MVPProgressContext(client)
