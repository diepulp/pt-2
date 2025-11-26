#!/usr/bin/env python3
"""
Check OpenAPI Alignment

Validates that route handlers align with OpenAPI specification:
- Routes documented in OpenAPI exist as handlers
- Handler methods match spec
- Required fields documented
"""

import re
import sys
import yaml
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional, Set

@dataclass
class AlignmentIssue:
    severity: str  # ERROR, WARNING, INFO
    category: str
    message: str
    spec_path: Optional[str] = None
    handler_path: Optional[str] = None

def load_openapi_spec(spec_path: str) -> Optional[Dict]:
    """Load and parse OpenAPI specification."""
    path = Path(spec_path)
    if not path.exists():
        return None

    with open(path) as f:
        return yaml.safe_load(f)

def get_spec_routes(spec: Dict) -> Dict[str, Set[str]]:
    """Extract routes and methods from OpenAPI spec."""
    routes = {}
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        route_methods = set()
        for method in methods.keys():
            if method.upper() in ('GET', 'POST', 'PATCH', 'PUT', 'DELETE'):
                route_methods.add(method.upper())
        if route_methods:
            routes[path] = route_methods

    return routes

def find_route_handlers(api_dir: str) -> Dict[str, Set[str]]:
    """Find all route handlers and their methods."""
    handlers = {}
    api_path = Path(api_dir)

    if not api_path.exists():
        return handlers

    for route_file in api_path.rglob('route.ts'):
        # Convert file path to API route
        rel_path = route_file.relative_to(api_path)
        parts = list(rel_path.parent.parts)

        # Convert [param] to {param} for OpenAPI matching
        api_route = '/api/v1/' + '/'.join(
            '{' + p[1:-1] + '}' if p.startswith('[') and p.endswith(']') else p
            for p in parts
        )

        # Extract methods from file
        content = route_file.read_text()
        methods = set()
        for method in ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']:
            if f'export async function {method}' in content:
                methods.add(method)

        if methods:
            handlers[api_route] = methods

    return handlers

def check_alignment(
    spec_routes: Dict[str, Set[str]],
    handler_routes: Dict[str, Set[str]]
) -> List[AlignmentIssue]:
    """Check alignment between spec and handlers."""
    issues = []

    # Routes in spec but not implemented
    for path, methods in spec_routes.items():
        # Normalize path for comparison
        normalized = path.replace('/api/', '/api/v1/') if not path.startswith('/api/v1') else path

        if normalized not in handler_routes:
            # Try without v1 prefix
            alt_path = path.replace('/v1/', '/')
            if alt_path not in handler_routes:
                issues.append(AlignmentIssue(
                    "ERROR", "MISSING_HANDLER",
                    f"Route documented in OpenAPI but no handler found",
                    spec_path=path
                ))
                continue

        handler_methods = handler_routes.get(normalized, set())
        missing_methods = methods - handler_methods

        for method in missing_methods:
            issues.append(AlignmentIssue(
                "ERROR", "MISSING_METHOD",
                f"Method {method} documented in spec but not implemented",
                spec_path=f"{path} ({method})"
            ))

    # Handlers not in spec
    for path, methods in handler_routes.items():
        # Normalize for comparison
        spec_path = path.replace('/api/v1/', '/') if '/api/v1/' in path else path

        if spec_path not in spec_routes and path not in spec_routes:
            issues.append(AlignmentIssue(
                "WARNING", "UNDOCUMENTED",
                f"Route handler exists but not in OpenAPI spec",
                handler_path=path
            ))
            continue

        spec_methods = spec_routes.get(spec_path, spec_routes.get(path, set()))
        extra_methods = methods - spec_methods

        for method in extra_methods:
            issues.append(AlignmentIssue(
                "WARNING", "EXTRA_METHOD",
                f"Method {method} implemented but not in OpenAPI spec",
                handler_path=f"{path} ({method})"
            ))

    return issues

def check_dto_alignment(spec: Dict, domain: str) -> List[AlignmentIssue]:
    """Check if DTOs align between spec and code."""
    issues = []

    # Find domain DTOs in spec
    schemas = spec.get('components', {}).get('schemas', {})
    domain_schemas = {
        name: schema for name, schema in schemas.items()
        if domain.lower() in name.lower()
    }

    # Check if service has corresponding DTOs
    dto_file = Path(f'services/{domain}/dto.ts')
    if dto_file.exists():
        dto_content = dto_file.read_text()

        for schema_name in domain_schemas:
            # Convert schema name to likely TypeScript name
            ts_name = schema_name.replace('DTO', '')

            if ts_name not in dto_content and schema_name not in dto_content:
                issues.append(AlignmentIssue(
                    "INFO", "DTO_ALIGNMENT",
                    f"OpenAPI schema '{schema_name}' may not have matching TypeScript DTO",
                    spec_path=f"components/schemas/{schema_name}"
                ))

    return issues

def format_issues(issues: List[AlignmentIssue]) -> str:
    """Format alignment issues for display."""
    if not issues:
        return "✅ OpenAPI and handlers are aligned!"

    output = []
    errors = [i for i in issues if i.severity == "ERROR"]
    warnings = [i for i in issues if i.severity == "WARNING"]
    infos = [i for i in issues if i.severity == "INFO"]

    if errors:
        output.append(f"\n❌ ERRORS ({len(errors)}):")
        for issue in errors:
            output.append(f"  [{issue.category}] {issue.message}")
            if issue.spec_path:
                output.append(f"    Spec: {issue.spec_path}")
            if issue.handler_path:
                output.append(f"    Handler: {issue.handler_path}")

    if warnings:
        output.append(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for issue in warnings:
            output.append(f"  [{issue.category}] {issue.message}")
            if issue.spec_path:
                output.append(f"    Spec: {issue.spec_path}")
            if issue.handler_path:
                output.append(f"    Handler: {issue.handler_path}")

    if infos:
        output.append(f"\nℹ️  INFO ({len(infos)}):")
        for issue in infos:
            output.append(f"  [{issue.category}] {issue.message}")

    return '\n'.join(output)

def main():
    # Default paths
    spec_path = 'docs/25-api-data/api-surface.openapi.yaml'
    api_dir = 'app/api/v1'
    domain = None

    if len(sys.argv) >= 2:
        domain = sys.argv[1]

    print("🔍 Checking OpenAPI alignment...")
    print(f"   Spec: {spec_path}")
    print(f"   Handlers: {api_dir}")
    if domain:
        print(f"   Domain filter: {domain}")

    # Load spec
    spec = load_openapi_spec(spec_path)
    if not spec:
        print(f"\n❌ Could not load OpenAPI spec from {spec_path}")
        sys.exit(1)

    # Get routes
    spec_routes = get_spec_routes(spec)
    handler_routes = find_route_handlers(api_dir)

    # Filter by domain if specified
    if domain:
        spec_routes = {
            k: v for k, v in spec_routes.items()
            if domain.lower() in k.lower()
        }
        handler_routes = {
            k: v for k, v in handler_routes.items()
            if domain.lower() in k.lower()
        }

    print(f"\n📊 Found {len(spec_routes)} spec routes, {len(handler_routes)} handlers")

    # Check alignment
    issues = check_alignment(spec_routes, handler_routes)

    # Check DTO alignment if domain specified
    if domain:
        issues.extend(check_dto_alignment(spec, domain))

    print(format_issues(issues))

    # Summary
    print("\n" + "="*50)
    print("SUMMARY:")
    print(f"  Spec routes: {len(spec_routes)}")
    print(f"  Handlers: {len(handler_routes)}")
    print(f"  Issues: {len(issues)}")

    errors = [i for i in issues if i.severity == "ERROR"]
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
