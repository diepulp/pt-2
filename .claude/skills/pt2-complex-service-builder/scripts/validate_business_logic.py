#!/usr/bin/env python3
"""
Validate Business Logic Patterns for Complex Services

Checks complex service-specific patterns:
- Transaction coordination
- State machine patterns
- Outbox pattern usage
- Error handling strategies
- Multi-step workflow validation

Usage:
    validate_business_logic.py <service-path>

Example:
    validate_business_logic.py services/loyalty
"""

import sys
import re
from pathlib import Path
from typing import List, Dict, Set


class BusinessLogicIssue:
    def __init__(self, category: str, message: str, file_path: str, line_number: int = 0, severity: str = "INFO"):
        self.category = category
        self.message = message
        self.file_path = file_path
        self.line_number = line_number
        self.severity = severity

    def __str__(self):
        location = f"{self.file_path}:{self.line_number}" if self.line_number > 0 else self.file_path
        return f"[{self.severity}] {self.category}: {self.message} ({location})"


def analyze_transaction_patterns(file_path: Path) -> List[BusinessLogicIssue]:
    """Analyze transaction coordination patterns."""
    issues = []
    content = file_path.read_text()
    lines = content.split('\n')

    # Check for transaction usage
    has_transactions = any('transaction' in line.lower() or '.rpc(' in line for line in lines)

    if has_transactions:
        # Check for error handling in transactions
        transaction_blocks = []
        for i, line in enumerate(lines, 1):
            if '.rpc(' in line or 'transaction' in line.lower():
                transaction_blocks.append(i)

        # Look for try/catch around transactions
        for tx_line in transaction_blocks:
            # Check surrounding lines for try/catch
            context_start = max(0, tx_line - 10)
            context_end = min(len(lines), tx_line + 10)
            context = '\n'.join(lines[context_start:context_end])

            if 'try' not in context or 'catch' not in context:
                issues.append(BusinessLogicIssue(
                    "Transaction Safety",
                    "Transaction found without try/catch error handling",
                    str(file_path),
                    tx_line,
                    "WARNING"
                ))

    return issues


def analyze_outbox_pattern(file_path: Path, service_path: Path) -> List[BusinessLogicIssue]:
    """Check for outbox pattern usage in complex workflows."""
    issues = []
    content = file_path.read_text()

    # Complex services that modify financial or loyalty data should use outbox
    service_name = service_path.name.lower()
    complex_domains = ['loyalty', 'finance', 'mtl', 'player-financial']

    if any(domain in service_name for domain in complex_domains):
        # Check for outbox table usage
        has_outbox = re.search(r'_outbox', content)

        if not has_outbox:
            issues.append(BusinessLogicIssue(
                "Outbox Pattern",
                f"Complex service '{service_name}' should use outbox pattern for event publishing",
                str(file_path),
                0,
                "WARNING"
            ))
        else:
            issues.append(BusinessLogicIssue(
                "Outbox Pattern",
                "Outbox pattern detected - ensure events are published reliably",
                str(file_path),
                0,
                "INFO"
            ))

    return issues


def analyze_state_machines(file_path: Path) -> List[BusinessLogicIssue]:
    """Check for state machine patterns."""
    issues = []
    content = file_path.read_text()

    # Look for state transition patterns
    has_status_field = re.search(r"(status|state|stage)\s*:", content)
    has_transitions = re.search(r"(transition|setState|updateStatus)", content)

    if has_status_field and has_transitions:
        # Check for validation of state transitions
        has_validation = re.search(r"(validate|allowed|valid|can)", content, re.IGNORECASE)

        if not has_validation:
            issues.append(BusinessLogicIssue(
                "State Machine",
                "State transitions detected but no validation logic found. Ensure invalid state changes are prevented",
                str(file_path),
                0,
                "WARNING"
            ))
        else:
            issues.append(BusinessLogicIssue(
                "State Machine",
                "State machine pattern detected with validation - good practice",
                str(file_path),
                0,
                "INFO"
            ))

    return issues


def analyze_error_handling(file_path: Path) -> List[BusinessLogicIssue]:
    """Analyze error handling strategies."""
    issues = []
    content = file_path.read_text()
    lines = content.split('\n')

    # Check for database operations
    db_operations = []
    for i, line in enumerate(lines, 1):
        if re.search(r'\.(from|select|insert|update|delete|rpc)\(', line):
            db_operations.append(i)

    # For each DB operation, check error handling
    for op_line in db_operations:
        # Look for error handling in nearby lines
        context_start = max(0, op_line - 5)
        context_end = min(len(lines), op_line + 15)
        context = '\n'.join(lines[context_start:context_end])

        # Check for error property access
        has_error_check = 'error' in context and ('if' in context or 'throw' in context)

        if not has_error_check:
            issues.append(BusinessLogicIssue(
                "Error Handling",
                "Database operation without error handling",
                str(file_path),
                op_line,
                "ERROR"
            ))

    return issues


def analyze_business_rules(file_path: Path) -> List[BusinessLogicIssue]:
    """Check for business rule validation patterns."""
    issues = []
    content = file_path.read_text()

    # Look for validation patterns
    has_validation = re.search(r"(validate|check|verify|ensure|guard)", content, re.IGNORECASE)

    # Look for business calculations
    has_calculations = re.search(r"(calculate|compute|determine|derive)", content, re.IGNORECASE)

    if has_calculations and not has_validation:
        issues.append(BusinessLogicIssue(
            "Business Rules",
            "Business calculations found but no validation detected. Consider adding input validation and business rule checks",
            str(file_path),
            0,
            "WARNING"
        ))

    # Check for hardcoded business values
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        # Look for magic numbers in business logic (excluding common values like 0, 1, -1)
        if re.search(r'(?<![.\w])\d{2,}(?![.\w])', line) and 'const' not in line and 'enum' not in line:
            if not any(comment in line for comment in ['//', '/*', '*']):
                issues.append(BusinessLogicIssue(
                    "Business Rules",
                    "Potential magic number found. Consider extracting to named constant",
                    str(file_path),
                    i,
                    "INFO"
                ))

    return issues


def analyze_multi_step_workflows(file_path: Path) -> List[BusinessLogicIssue]:
    """Analyze multi-step workflow patterns."""
    issues = []
    content = file_path.read_text()

    # Count async operations
    async_ops = len(re.findall(r'await\s+', content))

    if async_ops >= 3:
        # Check for step logging/telemetry
        has_logging = re.search(r"(log|telemetry|trace|debug)", content, re.IGNORECASE)

        if not has_logging:
            issues.append(BusinessLogicIssue(
                "Multi-Step Workflow",
                f"Complex workflow with {async_ops} async operations should include logging/telemetry for observability",
                str(file_path),
                0,
                "WARNING"
            ))

        # Check for partial failure handling
        has_rollback = re.search(r"(rollback|compensate|revert|undo)", content, re.IGNORECASE)

        if not has_rollback:
            issues.append(BusinessLogicIssue(
                "Multi-Step Workflow",
                "Complex workflow should handle partial failures with rollback/compensation logic",
                str(file_path),
                0,
                "WARNING"
            ))

    return issues


def validate_business_logic(service_path: Path) -> List[BusinessLogicIssue]:
    """
    Validate business logic patterns in a complex service.

    Returns:
        List of business logic issues found
    """
    issues = []

    if not service_path.exists() or not service_path.is_dir():
        return [BusinessLogicIssue("Validation", "Invalid service path", str(service_path), 0, "ERROR")]

    # Analyze index.ts
    index_ts = service_path / 'index.ts'
    if index_ts.exists():
        issues.extend(analyze_transaction_patterns(index_ts))
        issues.extend(analyze_outbox_pattern(index_ts, service_path))
        issues.extend(analyze_state_machines(index_ts))
        issues.extend(analyze_error_handling(index_ts))
        issues.extend(analyze_business_rules(index_ts))
        issues.extend(analyze_multi_step_workflows(index_ts))

    return issues


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_business_logic.py <service-path>")
        print("\nExample:")
        print("  validate_business_logic.py services/loyalty")
        sys.exit(1)

    service_path = Path(sys.argv[1])

    print("=" * 60)
    print("PT-2 Business Logic Validator")
    print("=" * 60)
    print(f"\nAnalyzing: {service_path}\n")

    issues = validate_business_logic(service_path)

    if not issues:
        print("✅ No business logic issues detected!")
        sys.exit(0)

    # Group by severity
    errors = [i for i in issues if i.severity == "ERROR"]
    warnings = [i for i in issues if i.severity == "WARNING"]
    info = [i for i in issues if i.severity == "INFO"]

    print("Analysis Results:\n")

    if errors:
        print(f"❌ ERRORS ({len(errors)}):")
        for issue in errors:
            print(f"  {issue}")
        print()

    if warnings:
        print(f"⚠️  WARNINGS ({len(warnings)}):")
        for issue in warnings:
            print(f"  {issue}")
        print()

    if info:
        print(f"ℹ️  RECOMMENDATIONS ({len(info)}):")
        for issue in info:
            print(f"  {issue}")
        print()

    print("=" * 60)
    print(f"Total: {len(errors)} errors, {len(warnings)} warnings, {len(info)} recommendations")
    print("=" * 60)

    # Exit with error code if there are errors
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
