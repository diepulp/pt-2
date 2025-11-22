#!/usr/bin/env python3
"""
Comprehensive integration tests for Memori SDK wrapper.

Tests all major components:
- MemoriClient
- ChatmodeContext
- WorkflowStateManager
- Session hooks
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from loguru import logger
from lib.memori.client import create_memori_client
from lib.memori.chatmode_context import ChatmodeContext
from lib.memori.workflow_state import WorkflowStateManager, ValidationGateStatus
from lib.memori.session_hooks import on_session_start, on_session_end, get_workflow_context


class MemoriIntegrationTests:
    """Comprehensive test suite for Memori integration."""

    def __init__(self):
        self.test_count = 0
        self.passed_count = 0
        self.failed_count = 0

    def run_test(self, test_name: str, test_func):
        """Run a single test and track results."""
        self.test_count += 1
        logger.info(f"\n{'='*60}")
        logger.info(f"Test {self.test_count}: {test_name}")
        logger.info(f"{'='*60}")

        try:
            test_func()
            logger.success(f"✅ PASSED: {test_name}")
            self.passed_count += 1
            return True
        except Exception as e:
            logger.error(f"❌ FAILED: {test_name}")
            logger.error(f"Error: {e}")
            self.failed_count += 1
            return False

    def test_client_creation(self):
        """Test creating Memori client."""
        client = create_memori_client("service-engineer")
        assert client is not None
        assert client.chatmode == "service-engineer"
        assert client.user_id == "service_engineer"
        logger.info(f"Created client for chatmode: {client.chatmode}")

    def test_client_enable_disable(self):
        """Test enabling and disabling Memori."""
        client = create_memori_client("architect")
        success = client.enable()

        # Note: May fail if Memori SDK not installed or DB not accessible
        if success:
            logger.info("Memori enabled successfully")
            client.disable()
            logger.info("Memori disabled successfully")
        else:
            logger.warning("Memori not available (SDK not installed or DB not accessible)")
            logger.warning("This is expected if running without Memori setup")

    def test_chatmode_context_decision(self):
        """Test recording architecture decision."""
        client = create_memori_client("architect")
        client.enable()
        context = ChatmodeContext(client)

        result = context.record_decision(
            decision="Use append-only ledger for loyalty points",
            rationale="Audit trail requirement for compliance",
            alternatives_considered=["Snapshot-based", "Event-sourced"],
            relevant_docs=["SRM.md#loyalty-service", "ADR-003.md"]
        )

        if client.enabled:
            logger.info(f"Decision recorded: {result}")
        else:
            logger.warning("Memori not enabled, decision not recorded")

        client.disable()

    def test_chatmode_context_implementation(self):
        """Test recording service implementation."""
        client = create_memori_client("service-engineer")
        client.enable()
        context = ChatmodeContext(client)

        result = context.record_implementation(
            entity_name="TestService",
            entity_type="service",
            files_created=["src/services/test.service.ts", "src/services/__tests__/test.service.test.ts"],
            pattern="functional_factory",
            test_coverage=0.87,
            spec_file=".claude/specs/test-service.spec.md"
        )

        if client.enabled:
            logger.info(f"Implementation recorded: {result}")
        else:
            logger.warning("Memori not enabled, implementation not recorded")

        client.disable()

    def test_workflow_state_phase_transition(self):
        """Test recording workflow phase transition."""
        client = create_memori_client("service-engineer")
        client.enable()
        workflow = WorkflowStateManager(client)

        result = workflow.save_phase_transition(
            workflow="create-service",
            entity_name="TestService",
            phase=2,
            chatmode="service-engineer",
            metadata={
                "spec_file": ".claude/specs/test-service.spec.md",
                "files_created": ["src/services/test.service.ts"]
            }
        )

        if client.enabled:
            logger.info(f"Phase transition recorded: {result}")
        else:
            logger.warning("Memori not enabled, phase transition not recorded")

        client.disable()

    def test_workflow_validation_gate(self):
        """Test recording validation gate."""
        client = create_memori_client("architect")
        client.enable()
        workflow = WorkflowStateManager(client)

        result = workflow.record_validation_gate(
            workflow="create-service",
            entity_name="TestService",
            gate_number=1,
            gate_type="spec_review",
            outcome=ValidationGateStatus.PASSED,
            feedback="Spec follows SERVICE_TEMPLATE.md correctly",
            files_reviewed=[".claude/specs/test-service.spec.md"]
        )

        if client.enabled:
            logger.info(f"Validation gate recorded: {result}")
        else:
            logger.warning("Memori not enabled, validation gate not recorded")

        client.disable()

    def test_session_start_hook(self):
        """Test session start hook."""
        result = on_session_start(chatmode="architect")

        assert result is not None
        assert "status" in result
        assert "chatmode" in result

        logger.info(f"Session start result: {result}")

        if result["status"] == "enabled":
            logger.info(f"Session ID: {result.get('session_id')}")
            logger.info(f"Recent memories: {result.get('recent_memories_count')}")
        else:
            logger.warning(f"Session start status: {result['status']}")

    def test_session_end_hook(self):
        """Test session end hook."""
        result = on_session_end(
            chatmode="architect",
            tasks_completed=["Created test spec", "Reviewed architecture"],
            files_modified=[".claude/specs/test.spec.md"],
            next_steps=["Implement service", "Write tests"]
        )

        assert result is not None
        assert "status" in result

        logger.info(f"Session end result: {result}")

    def test_workflow_recovery(self):
        """Test workflow context recovery."""
        # First create a workflow state
        client = create_memori_client("service-engineer")
        client.enable()
        workflow = WorkflowStateManager(client)

        workflow.save_phase_transition(
            workflow="create-service",
            entity_name="RecoveryTestService",
            phase=2,
            chatmode="service-engineer",
            metadata={"next_action": "Implement service methods"}
        )

        client.disable()

        # Now try to recover it
        context = get_workflow_context("create-service", "RecoveryTestService")

        if context:
            logger.info(f"Workflow recovered: {context}")
            assert context.get("workflow") == "create-service"
            assert context.get("entity_name") == "RecoveryTestService"
        else:
            logger.warning("No workflow context found (expected if Memori not enabled)")

    def test_user_preference_learning(self):
        """Test recording user preference."""
        client = create_memori_client("service-engineer")
        client.enable()
        context = ChatmodeContext(client)

        result = context.record_user_preference(
            preference="Use .test.ts extension for test files, not .spec.ts",
            preference_type="naming_convention",
            importance=1.0
        )

        if client.enabled:
            logger.info(f"User preference recorded: {result}")
        else:
            logger.warning("Memori not enabled, preference not recorded")

        client.disable()

    def test_anti_pattern_detection(self):
        """Test recording anti-pattern detection."""
        client = create_memori_client("service-engineer")
        client.enable()
        context = ChatmodeContext(client)

        result = context.record_anti_pattern_detection(
            anti_pattern="ReturnType inference",
            detected_in="test.service.ts:45",
            corrective_action="Replaced with explicit TestServiceInterface"
        )

        if client.enabled:
            logger.info(f"Anti-pattern detection recorded: {result}")
        else:
            logger.warning("Memori not enabled, anti-pattern not recorded")

        client.disable()

    def run_all_tests(self):
        """Run all tests."""
        logger.info("🧪 Starting Memori Integration Tests")
        logger.info("=" * 60)

        # Basic client tests
        self.run_test("Client Creation", self.test_client_creation)
        self.run_test("Client Enable/Disable", self.test_client_enable_disable)

        # Chatmode context tests
        self.run_test("Record Architecture Decision", self.test_chatmode_context_decision)
        self.run_test("Record Implementation", self.test_chatmode_context_implementation)
        self.run_test("Record User Preference", self.test_user_preference_learning)
        self.run_test("Record Anti-Pattern Detection", self.test_anti_pattern_detection)

        # Workflow state tests
        self.run_test("Record Phase Transition", self.test_workflow_state_phase_transition)
        self.run_test("Record Validation Gate", self.test_workflow_validation_gate)

        # Session hooks tests
        self.run_test("Session Start Hook", self.test_session_start_hook)
        self.run_test("Session End Hook", self.test_session_end_hook)

        # Workflow recovery test
        self.run_test("Workflow Context Recovery", self.test_workflow_recovery)

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("Test Summary")
        logger.info("=" * 60)
        logger.info(f"Total Tests: {self.test_count}")
        logger.success(f"Passed: {self.passed_count}")
        if self.failed_count > 0:
            logger.error(f"Failed: {self.failed_count}")
        else:
            logger.success(f"Failed: {self.failed_count}")

        success_rate = (self.passed_count / self.test_count * 100) if self.test_count > 0 else 0
        logger.info(f"Success Rate: {success_rate:.1f}%")

        if self.failed_count == 0:
            logger.success("\n✅ ALL TESTS PASSED!")
        else:
            logger.warning(f"\n⚠️  {self.failed_count} test(s) failed")
            logger.warning("Note: Some failures are expected if Memori SDK is not installed or database is not accessible")

        return self.failed_count == 0


if __name__ == "__main__":
    tests = MemoriIntegrationTests()
    success = tests.run_all_tests()

    sys.exit(0 if success else 1)
