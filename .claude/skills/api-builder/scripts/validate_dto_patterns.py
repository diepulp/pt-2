#!/usr/bin/env python3
"""
Validate DTO Patterns

Checks DTO files for compliance with PT-2 patterns:
- Pattern A: Manual interfaces with mappers (complex business logic)
- Pattern B: Pick/Omit from Database types (simple CRUD)
- Zod schema alignment
"""

import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Tuple

@dataclass
class ValidationIssue:
    severity: str  # ERROR, WARNING, INFO
    category: str
    message: str
    line: Optional[int] = None
    suggestion: Optional[str] = None

def detect_pattern(content: str) -> str:
    """Detect which DTO pattern the file uses."""
    has_pick_omit = bool(re.search(r'Pick<\s*Database\[', content))
    has_manual_interface = bool(re.search(r'export\s+interface\s+\w+DTO', content))
    has_mapper = bool(re.search(r'function\s+(to|build|map)\w+', content))

    if has_pick_omit and not has_manual_interface:
        return "Pattern B (Canonical CRUD)"
    elif has_manual_interface and has_mapper:
        return "Pattern A (Contract-First)"
    elif has_manual_interface:
        return "Pattern A (incomplete - missing mappers)"
    elif has_pick_omit and has_manual_interface:
        return "Pattern C (Hybrid)"
    else:
        return "Unknown"

def validate_pattern_a(content: str, lines: List[str]) -> List[ValidationIssue]:
    """Validate Pattern A (Contract-First) compliance."""
    issues = []

    # Check for manual interfaces
    interfaces = re.findall(r'export\s+interface\s+(\w+)', content)
    dto_interfaces = [i for i in interfaces if 'DTO' in i or 'Input' in i]

    if not dto_interfaces:
        issues.append(ValidationIssue(
            "ERROR", "PATTERN_A",
            "Pattern A requires explicit interface definitions",
            suggestion="Add: export interface {Name}DTO { ... }"
        ))

    # Check for mapper functions
    mappers = re.findall(r'export\s+function\s+(to|build|map)(\w+)', content)

    if dto_interfaces and not mappers:
        issues.append(ValidationIssue(
            "WARNING", "PATTERN_A",
            "Pattern A should have mapper functions for DTO conversion",
            suggestion="Add: export function to{Name}DTO(row: DatabaseRow): {Name}DTO { ... }"
        ))

    # Check mapper returns DTO type
    for line_num, line in enumerate(lines, 1):
        if re.search(r'function\s+(to|build|map)\w+', line):
            # Check if next lines have return type with DTO
            if 'DTO' not in line and 'Input' not in line:
                issues.append(ValidationIssue(
                    "WARNING", "PATTERN_A",
                    "Mapper function should have explicit DTO return type",
                    line=line_num,
                    suggestion=": SomeDTO"
                ))

    return issues

def validate_pattern_b(content: str, lines: List[str]) -> List[ValidationIssue]:
    """Validate Pattern B (Canonical CRUD) compliance."""
    issues = []

    # Check for Pick/Omit usage
    if not re.search(r'Pick<\s*Database\[', content):
        issues.append(ValidationIssue(
            "ERROR", "PATTERN_B",
            "Pattern B requires DTOs derived from Database types using Pick/Omit",
            suggestion="export type PlayerDTO = Pick<Database['public']['Tables']['player']['Row'], 'id' | 'name'>;"
        ))

    # Check for BANNED manual interfaces in Pattern B
    manual_interfaces = re.findall(r'export\s+interface\s+(\w+DTO)', content)
    if manual_interfaces:
        for interface in manual_interfaces:
            issues.append(ValidationIssue(
                "ERROR", "PATTERN_B",
                f"Manual interface '{interface}' not allowed in Pattern B - use type with Pick/Omit",
                suggestion=f"export type {interface} = Pick<Database['public']['Tables']['...']['Row'], '...'>;"
            ))

    # Check for correct Row vs Insert usage
    create_dtos = re.findall(r'(\w+Create\w*)\s*=\s*Pick<[^>]+\[\'Row\'\]', content)
    for dto in create_dtos:
        issues.append(ValidationIssue(
            "ERROR", "PATTERN_B",
            f"Create DTO '{dto}' should use 'Insert' not 'Row'",
            suggestion="Change ['Row'] to ['Insert']"
        ))

    # Check for proper type alias (not interface)
    for line_num, line in enumerate(lines, 1):
        if re.search(r'interface\s+\w+\s*{', line):
            if 'DTO' in line or 'Create' in line or 'Update' in line:
                issues.append(ValidationIssue(
                    "ERROR", "PATTERN_B",
                    "Pattern B must use 'type' alias, not 'interface'",
                    line=line_num,
                    suggestion="Replace 'interface' with 'type ... = Pick<...>'"
                ))

    return issues

def validate_zod_schemas(content: str, lines: List[str]) -> List[ValidationIssue]:
    """Validate Zod schema compliance."""
    issues = []

    # Find DTOs and Zod schemas
    dtos = set(re.findall(r'type\s+(\w+DTO)\s*=', content))
    dtos.update(re.findall(r'interface\s+(\w+DTO)', content))
    dtos.update(re.findall(r'type\s+(\w+Input)\s*=', content))
    dtos.update(re.findall(r'interface\s+(\w+Input)', content))

    schemas = set(re.findall(r'const\s+(\w+Schema)\s*=\s*z\.', content))

    # Check for matching schemas
    for dto in dtos:
        base_name = dto.replace('DTO', '').replace('Input', '')
        expected_schema = f"{base_name}Schema"

        if expected_schema not in schemas and f"{dto}Schema" not in schemas:
            # Check for Create/Update variants
            if 'Create' not in dto and 'Update' not in dto:
                issues.append(ValidationIssue(
                    "WARNING", "ZOD",
                    f"DTO '{dto}' may need a matching Zod schema for validation",
                    suggestion=f"const {expected_schema} = z.object({{ ... }});"
                ))

    # Check for z.infer alignment
    zod_infer = re.findall(r'z\.infer<typeof\s+(\w+)>', content)
    for schema_name in zod_infer:
        if schema_name not in schemas:
            issues.append(ValidationIssue(
                "ERROR", "ZOD",
                f"z.infer references '{schema_name}' but schema not found in file"
            ))

    # Check for proper Zod imports
    if 'z.' in content and "from 'zod'" not in content and 'from "zod"' not in content:
        issues.append(ValidationIssue(
            "ERROR", "ZOD",
            "Zod schemas used but zod not imported",
            suggestion="import { z } from 'zod';"
        ))

    return issues

def validate_anti_patterns(content: str, lines: List[str]) -> List[ValidationIssue]:
    """Check for anti-patterns in DTO definitions."""
    issues = []

    # Check for 'any' types
    for line_num, line in enumerate(lines, 1):
        if re.search(r':\s*any\b', line) or re.search(r'as\s+any\b', line):
            issues.append(ValidationIssue(
                "ERROR", "ANTI_PATTERN",
                "'any' type detected - use proper typing",
                line=line_num
            ))

    # Check for direct Database type access (should use Pick/Omit)
    for line_num, line in enumerate(lines, 1):
        if re.search(r"Database\['public'\]\['Tables'\]\[\w+\]\['Row'\](?!\s*,)", line):
            if 'Pick<' not in line and 'Omit<' not in line:
                issues.append(ValidationIssue(
                    "WARNING", "ANTI_PATTERN",
                    "Direct Database type access - prefer Pick/Omit for DTOs",
                    line=line_num
                ))

    # Check for ReturnType inference (banned)
    if 'ReturnType<typeof' in content:
        issues.append(ValidationIssue(
            "ERROR", "ANTI_PATTERN",
            "ReturnType<typeof ...> inference banned - use explicit types"
        ))

    return issues

def validate_dto_file(file_path: str) -> Tuple[str, List[ValidationIssue]]:
    """Validate a DTO file against PT-2 standards."""
    path = Path(file_path)

    if not path.exists():
        return "Unknown", [ValidationIssue("ERROR", "FILE", f"File not found: {file_path}")]

    content = path.read_text()
    lines = content.split('\n')

    # Detect pattern
    pattern = detect_pattern(content)

    issues = []

    # Validate based on detected pattern
    if "Pattern A" in pattern:
        issues.extend(validate_pattern_a(content, lines))
    elif "Pattern B" in pattern:
        issues.extend(validate_pattern_b(content, lines))
    elif "Pattern C" in pattern:
        # Hybrid - check both
        issues.extend(validate_pattern_a(content, lines))
        issues.extend(validate_pattern_b(content, lines))
    else:
        issues.append(ValidationIssue(
            "WARNING", "PATTERN",
            "Could not determine DTO pattern - ensure file follows Pattern A or B"
        ))

    # Always check Zod and anti-patterns
    issues.extend(validate_zod_schemas(content, lines))
    issues.extend(validate_anti_patterns(content, lines))

    return pattern, issues

def format_issues(pattern: str, issues: List[ValidationIssue]) -> str:
    """Format validation issues for display."""
    output = [f"\n📋 Detected Pattern: {pattern}"]

    if not issues:
        output.append("✅ All checks passed!")
        return '\n'.join(output)

    errors = [i for i in issues if i.severity == "ERROR"]
    warnings = [i for i in issues if i.severity == "WARNING"]
    infos = [i for i in issues if i.severity == "INFO"]

    if errors:
        output.append(f"\n❌ ERRORS ({len(errors)}):")
        for issue in errors:
            line_info = f" (line {issue.line})" if issue.line else ""
            output.append(f"  [{issue.category}]{line_info} {issue.message}")
            if issue.suggestion:
                output.append(f"    💡 {issue.suggestion}")

    if warnings:
        output.append(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for issue in warnings:
            line_info = f" (line {issue.line})" if issue.line else ""
            output.append(f"  [{issue.category}]{line_info} {issue.message}")
            if issue.suggestion:
                output.append(f"    💡 {issue.suggestion}")

    if infos:
        output.append(f"\nℹ️  INFO ({len(infos)}):")
        for issue in infos:
            output.append(f"  [{issue.category}] {issue.message}")

    return '\n'.join(output)

def main():
    if len(sys.argv) < 2:
        print("Usage: validate_dto_patterns.py <path/to/dto.ts>")
        print("Example: validate_dto_patterns.py services/player/dto.ts")
        sys.exit(1)

    file_path = sys.argv[1]
    print(f"🔍 Validating DTO patterns: {file_path}")

    pattern, issues = validate_dto_file(file_path)
    print(format_issues(pattern, issues))

    # Exit with error if any ERRORs found
    errors = [i for i in issues if i.severity == "ERROR"]
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
