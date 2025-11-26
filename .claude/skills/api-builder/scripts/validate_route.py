#!/usr/bin/env python3
"""
Validate Route Handler Structure

Checks PT-2 route handlers for compliance with API patterns:
- Correct file location
- Required imports
- withServerAction usage
- Idempotency enforcement
- Response contract compliance
- Next.js 15 params handling
"""

import re
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ValidationIssue:
    severity: str  # ERROR, WARNING, INFO
    category: str
    message: str
    line: Optional[int] = None
    suggestion: Optional[str] = None

def validate_route_handler(file_path: str) -> List[ValidationIssue]:
    """Validate a route handler file against PT-2 standards."""
    issues = []
    path = Path(file_path)

    if not path.exists():
        return [ValidationIssue("ERROR", "FILE", f"File not found: {file_path}")]

    content = path.read_text()
    lines = content.split('\n')

    # 1. File location validation
    if 'app/api/v1/' not in str(path):
        issues.append(ValidationIssue(
            "ERROR", "LOCATION",
            "Route handler not in app/api/v1/ directory",
            suggestion="Move to app/api/v1/{domain}/route.ts"
        ))

    if not path.name.endswith('route.ts'):
        issues.append(ValidationIssue(
            "ERROR", "NAMING",
            f"File should be named 'route.ts', found '{path.name}'"
        ))

    # 2. Required imports
    required_imports = {
        'NextRequest': "import type { NextRequest } from 'next/server'",
        'createRequestContext': "import { createRequestContext } from '@/lib/http/service-response'",
        'errorResponse': "import { errorResponse } from '@/lib/http/service-response'",
        'successResponse': "import { successResponse } from '@/lib/http/service-response'",
        'withServerAction': "import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper'",
        'createClient': "import { createClient } from '@/lib/supabase/server'",
    }

    for name, example in required_imports.items():
        if name not in content:
            issues.append(ValidationIssue(
                "ERROR", "IMPORT",
                f"Missing required import: {name}",
                suggestion=example
            ))

    # 3. HTTP method handlers
    has_post = 'export async function POST' in content
    has_patch = 'export async function PATCH' in content
    has_delete = 'export async function DELETE' in content
    has_get = 'export async function GET' in content

    # 4. Idempotency check for write methods
    if has_post or has_patch or has_delete:
        if 'requireIdempotencyKey' not in content:
            issues.append(ValidationIssue(
                "ERROR", "IDEMPOTENCY",
                "Write methods (POST/PATCH/DELETE) require idempotency key",
                suggestion="Add: const idempotencyKey = requireIdempotencyKey(request);"
            ))
        if 'idempotency-key' not in content.lower() and 'idempotencyKey' not in content:
            issues.append(ValidationIssue(
                "WARNING", "IDEMPOTENCY",
                "No idempotency key handling found for write operations"
            ))

    # 5. withServerAction usage
    if 'withServerAction' in content:
        # Check for proper context fields
        if 'requestId: ctx.requestId' not in content:
            issues.append(ValidationIssue(
                "WARNING", "CONTEXT",
                "withServerAction should include requestId from context",
                suggestion="requestId: ctx.requestId"
            ))
        if has_post and 'idempotencyKey' not in content:
            issues.append(ValidationIssue(
                "ERROR", "CONTEXT",
                "POST handler should pass idempotencyKey to withServerAction"
            ))
    else:
        issues.append(ValidationIssue(
            "ERROR", "WRAPPER",
            "Service calls should be wrapped with withServerAction",
            suggestion="const result = await withServerAction(async () => { ... }, { supabase, action, entity, requestId });"
        ))

    # 6. Response handling
    if 'successResponse' in content and 'result.ok' not in content:
        issues.append(ValidationIssue(
            "WARNING", "RESPONSE",
            "Should check result.ok before returning successResponse",
            suggestion="if (!result.ok) { return errorResponse(ctx, result); }"
        ))

    # 7. Next.js 15 params handling
    if '[' in str(path):  # Dynamic route
        # Check for Promise params pattern
        if 'params: Promise<' not in content:
            issues.append(ValidationIssue(
                "ERROR", "NEXTJS15",
                "Dynamic route params should be typed as Promise<> in Next.js 15",
                suggestion="segmentData: { params: Promise<{ id: string }> }"
            ))
        if 'await segmentData.params' not in content and 'await params' not in content.replace('Promise<{', ''):
            issues.append(ValidationIssue(
                "ERROR", "NEXTJS15",
                "Must await params Promise before accessing values",
                suggestion="const params = await segmentData.params;"
            ))

    # 8. Zod validation
    if has_post or has_patch:
        if '.parse(' not in content:
            issues.append(ValidationIssue(
                "WARNING", "VALIDATION",
                "Input validation with Zod schema recommended",
                suggestion="const input = SomeSchema.parse(body);"
            ))

    # 9. Export configuration
    if "export const dynamic = 'force-dynamic'" not in content:
        issues.append(ValidationIssue(
            "INFO", "CONFIG",
            "Consider adding 'export const dynamic = force-dynamic' for API routes"
        ))

    # 10. Ad-hoc response patterns
    bad_patterns = [
        (r'Response\.json\s*\(\s*\{', "Ad-hoc Response.json() instead of successResponse/errorResponse"),
        (r'return\s+new\s+Response\(', "Raw Response constructor instead of helpers"),
        (r'supabase\.from\([\'"]', "Direct Supabase query in handler (should be in service)"),
        (r'console\.(log|error|warn)', "Console statements in route handler"),
        (r'as\s+any', "Type casting to 'any'"),
    ]

    for pattern, message in bad_patterns:
        for i, line in enumerate(lines, 1):
            if re.search(pattern, line):
                issues.append(ValidationIssue(
                    "ERROR", "ANTI_PATTERN",
                    message,
                    line=i
                ))

    return issues


def format_issues(issues: List[ValidationIssue]) -> str:
    """Format validation issues for display."""
    if not issues:
        return "✅ All checks passed!"

    output = []
    errors = [i for i in issues if i.severity == "ERROR"]
    warnings = [i for i in issues if i.severity == "WARNING"]
    infos = [i for i in issues if i.severity == "INFO"]

    if errors:
        output.append(f"\n❌ ERRORS ({len(errors)}):")
        for issue in errors:
            line_info = f" (line {issue.line})" if issue.line else ""
            output.append(f"  [{issue.category}]{line_info} {issue.message}")
            if issue.suggestion:
                output.append(f"    💡 Suggestion: {issue.suggestion}")

    if warnings:
        output.append(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for issue in warnings:
            line_info = f" (line {issue.line})" if issue.line else ""
            output.append(f"  [{issue.category}]{line_info} {issue.message}")
            if issue.suggestion:
                output.append(f"    💡 Suggestion: {issue.suggestion}")

    if infos:
        output.append(f"\nℹ️  INFO ({len(infos)}):")
        for issue in infos:
            output.append(f"  [{issue.category}] {issue.message}")

    return '\n'.join(output)


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_route.py <path/to/route.ts>")
        print("Example: validate_route.py app/api/v1/players/route.ts")
        sys.exit(1)

    file_path = sys.argv[1]
    print(f"🔍 Validating route handler: {file_path}\n")

    issues = validate_route_handler(file_path)
    print(format_issues(issues))

    # Exit with error if any ERRORs found
    errors = [i for i in issues if i.severity == "ERROR"]
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
