#!/usr/bin/env python3
"""
Validate PT-2 Complex Service Structure

Checks that a service follows PT-2 architectural standards for complex business logic services:
- Functional factory pattern (no classes)
- Explicit interfaces (no ReturnType inference)
- Proper DTO exports
- Bounded context isolation
- Type safety (SupabaseClient<Database>)

Usage:
    validate_service_structure.py <service-path>

Example:
    validate_service_structure.py services/loyalty
"""

import sys
import re
from pathlib import Path
from typing import List, Tuple


class ValidationError:
    def __init__(self, file_path: str, line_number: int, message: str, severity: str = "ERROR"):
        self.file_path = file_path
        self.line_number = line_number
        self.message = message
        self.severity = severity

    def __str__(self):
        return f"[{self.severity}] {self.file_path}:{self.line_number} - {self.message}"


def validate_no_classes(file_path: Path) -> List[ValidationError]:
    """Check that service uses functional factories, not classes."""
    errors = []
    content = file_path.read_text()
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for class definitions (but allow TypeScript interfaces/types)
        if re.search(r'\bclass\s+\w+', line) and not re.search(r'(interface|type)\s+', line):
            errors.append(ValidationError(
                str(file_path),
                i,
                "Service uses class-based pattern. Use functional factory instead: export function createXService()",
                "ERROR"
            ))

    return errors


def validate_no_returntype_inference(file_path: Path) -> List[ValidationError]:
    """Check that DTOs use explicit interfaces, not ReturnType inference."""
    errors = []
    content = file_path.read_text()
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        if 'ReturnType' in line and 'typeof' in line:
            errors.append(ValidationError(
                str(file_path),
                i,
                "DTO uses ReturnType inference. Define explicit interface instead",
                "ERROR"
            ))

    return errors


def validate_typed_supabase(file_path: Path) -> List[ValidationError]:
    """Check that supabase parameter is typed as SupabaseClient<Database>."""
    errors = []
    content = file_path.read_text()
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for supabase parameter with 'any' type
        if re.search(r'supabase\s*:\s*any', line):
            errors.append(ValidationError(
                str(file_path),
                i,
                "Supabase parameter typed as 'any'. Use 'SupabaseClient<Database>' instead",
                "ERROR"
            ))

        # Check for untyped supabase parameter in function signatures
        if re.search(r'function\s+\w+\([^)]*supabase[^)]*\)', line):
            if not re.search(r'supabase\s*:\s*SupabaseClient', line):
                errors.append(ValidationError(
                    str(file_path),
                    i,
                    "Supabase parameter may be untyped. Ensure type is 'SupabaseClient<Database>'",
                    "WARNING"
                ))

    return errors


def validate_dtos_exported(service_path: Path) -> List[ValidationError]:
    """Check that dtos.ts exists and exports DTOs."""
    errors = []
    dtos_path = service_path / 'dtos.ts'

    if not dtos_path.exists():
        errors.append(ValidationError(
            str(service_path),
            0,
            "Missing dtos.ts file. Services must export DTOs in dtos.ts",
            "ERROR"
        ))
        return errors

    content = dtos_path.read_text()

    # Check for at least one export
    if not re.search(r'export\s+(type|interface|const)', content):
        errors.append(ValidationError(
            str(dtos_path),
            0,
            "dtos.ts exists but contains no exports. Export DTOs for all owned tables",
            "WARNING"
        ))

    return errors


def validate_service_interface(file_path: Path) -> List[ValidationError]:
    """Check that service defines an explicit interface."""
    errors = []
    content = file_path.read_text()

    # Look for exported interface with 'Service' suffix
    if not re.search(r'export\s+interface\s+\w+Service\s*\{', content):
        errors.append(ValidationError(
            str(file_path),
            0,
            "Service should export an explicit interface (e.g., export interface LoyaltyService)",
            "WARNING"
        ))

    return errors


def validate_functional_factory(file_path: Path) -> List[ValidationError]:
    """Check for functional factory pattern."""
    errors = []
    content = file_path.read_text()

    # Look for create*Service function
    if not re.search(r'export\s+function\s+create\w+Service\s*\(', content):
        errors.append(ValidationError(
            str(file_path),
            0,
            "Service should export a factory function (e.g., export function createLoyaltyService)",
            "WARNING"
        ))

    return errors


def validate_no_global_state(file_path: Path) -> List[ValidationError]:
    """Check for global singletons or module-level state."""
    errors = []
    content = file_path.read_text()
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # Check for module-level service instances
        if re.search(r'^(const|let|var)\s+\w+Service\s*=\s*create', line):
            errors.append(ValidationError(
                str(file_path),
                i,
                "Possible global service instance detected. Services should be created per-request, not as module singletons",
                "ERROR"
            ))

    return errors


def validate_service(service_path: Path) -> Tuple[List[ValidationError], int]:
    """
    Validate a service directory.

    Returns:
        Tuple of (errors, warnings_count)
    """
    errors = []

    if not service_path.exists():
        return [ValidationError(str(service_path), 0, "Service directory does not exist", "ERROR")], 0

    if not service_path.is_dir():
        return [ValidationError(str(service_path), 0, "Path is not a directory", "ERROR")], 0

    # Check for required files
    index_ts = service_path / 'index.ts'
    if not index_ts.exists():
        errors.append(ValidationError(str(service_path), 0, "Missing index.ts", "ERROR"))

    # Validate DTOs
    errors.extend(validate_dtos_exported(service_path))

    # Validate index.ts if it exists
    if index_ts.exists():
        errors.extend(validate_no_classes(index_ts))
        errors.extend(validate_no_returntype_inference(index_ts))
        errors.extend(validate_typed_supabase(index_ts))
        errors.extend(validate_service_interface(index_ts))
        errors.extend(validate_functional_factory(index_ts))
        errors.extend(validate_no_global_state(index_ts))

    # Validate dtos.ts if it exists
    dtos_ts = service_path / 'dtos.ts'
    if dtos_ts.exists():
        errors.extend(validate_no_classes(dtos_ts))
        errors.extend(validate_no_returntype_inference(dtos_ts))

    # Count warnings vs errors
    error_count = sum(1 for e in errors if e.severity == "ERROR")
    warning_count = sum(1 for e in errors if e.severity == "WARNING")

    return errors, warning_count


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_service_structure.py <service-path>")
        print("\nExample:")
        print("  validate_service_structure.py services/loyalty")
        sys.exit(1)

    service_path = Path(sys.argv[1])

    print("=" * 60)
    print("PT-2 Complex Service Validator")
    print("=" * 60)
    print(f"\nValidating: {service_path}\n")

    errors, warning_count = validate_service(service_path)

    if not errors:
        print("✅ All validations passed!")
        print("\nService follows PT-2 architectural standards:")
        print("  ✓ Functional factory pattern")
        print("  ✓ Explicit interfaces")
        print("  ✓ Type-safe Supabase client")
        print("  ✓ DTO exports present")
        print("  ✓ No global state")
        sys.exit(0)

    # Print errors grouped by severity
    print("Validation Results:\n")

    error_list = [e for e in errors if e.severity == "ERROR"]
    warning_list = [e for e in errors if e.severity == "WARNING"]

    if error_list:
        print(f"❌ ERRORS ({len(error_list)}):")
        for error in error_list:
            print(f"  {error}")
        print()

    if warning_list:
        print(f"⚠️  WARNINGS ({warning_count}):")
        for warning in warning_list:
            print(f"  {warning}")
        print()

    print("=" * 60)
    print(f"Total: {len(error_list)} errors, {warning_count} warnings")
    print("=" * 60)

    # Exit with error code if there are errors
    sys.exit(1 if error_list else 0)


if __name__ == "__main__":
    main()
