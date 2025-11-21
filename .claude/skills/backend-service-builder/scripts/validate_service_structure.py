#!/usr/bin/env python3
"""
Validate service structure against PT-2 architecture standards.

Checks:
- Required files exist (keys.ts, README.md)
- No class-based services (functional factories only)
- No ReturnType inference for service types
- Proper supabase typing (SupabaseClient<Database>)
- Pattern-appropriate file structure
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Tuple

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

class ServiceValidator:
    def __init__(self, service_path: str):
        self.service_path = Path(service_path)
        self.service_name = self.service_path.name
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.info: List[str] = []

    def validate(self) -> bool:
        """Run all validation checks. Returns True if all pass."""
        print(f"\n{'='*60}")
        print(f"Validating service: {self.service_name}")
        print(f"Path: {self.service_path}")
        print(f"{'='*60}\n")

        # Run all checks
        self.check_required_files()
        self.check_no_class_services()
        self.check_no_returntype_inference()
        self.check_supabase_typing()
        self.check_readme_content()
        self.detect_pattern()

        # Print results
        self.print_results()

        return len(self.errors) == 0

    def check_required_files(self):
        """Verify required files exist."""
        required = ['keys.ts', 'README.md']

        for filename in required:
            file_path = self.service_path / filename
            if not file_path.exists():
                self.errors.append(f"Missing required file: {filename}")
            else:
                self.info.append(f"✓ Found {filename}")

    def check_no_class_services(self):
        """Ensure no class-based service definitions."""
        pattern = re.compile(r'export\s+class\s+\w+Service')

        for ts_file in self.service_path.glob('*.ts'):
            if ts_file.name.endswith('.test.ts'):
                continue

            content = ts_file.read_text()
            if pattern.search(content):
                self.errors.append(
                    f"{ts_file.name}: ANTI-PATTERN: Class-based service detected. "
                    "Use functional factories instead."
                )

    def check_no_returntype_inference(self):
        """Detect ReturnType inference anti-pattern."""
        pattern = re.compile(r'ReturnType<typeof\s+create\w+Service>')

        for ts_file in self.service_path.glob('*.ts'):
            content = ts_file.read_text()
            if pattern.search(content):
                self.errors.append(
                    f"{ts_file.name}: ANTI-PATTERN: ReturnType inference detected. "
                    "Use explicit interface instead."
                )

    def check_supabase_typing(self):
        """Verify proper SupabaseClient typing."""
        any_pattern = re.compile(r'supabase:\s*any')
        correct_pattern = re.compile(r'SupabaseClient<Database>')

        for ts_file in self.service_path.glob('*.ts'):
            if ts_file.name.endswith('.test.ts'):
                continue

            content = ts_file.read_text()

            # Check for 'supabase: any'
            if any_pattern.search(content):
                self.errors.append(
                    f"{ts_file.name}: Type safety violation: 'supabase: any' detected. "
                    "Use 'supabase: SupabaseClient<Database>' instead."
                )

            # If file has supabase parameter, verify correct typing
            if 'supabase' in content and correct_pattern.search(content):
                self.info.append(f"✓ {ts_file.name}: Proper SupabaseClient typing")

    def check_readme_content(self):
        """Validate README.md has required sections."""
        readme_path = self.service_path / 'README.md'
        if not readme_path.exists():
            return

        content = readme_path.read_text()

        required_sections = {
            'Bounded Context': r'>\s*\*\*Bounded Context\*\*:',
            'SRM Reference': r'>\s*\*\*SRM Reference\*\*:',
            'Pattern': r'##\s*Pattern',
            'Ownership': r'##\s*Ownership',
        }

        for section_name, pattern_str in required_sections.items():
            if not re.search(pattern_str, content):
                self.warnings.append(
                    f"README.md: Missing or malformed section: {section_name}"
                )
            else:
                self.info.append(f"✓ README.md: Found {section_name} section")

    def detect_pattern(self):
        """Detect service pattern (A, B, or C)."""
        has_business_logic = any(
            f.suffix == '.ts' and not f.name.startswith('keys') and not f.name.endswith('.test.ts')
            for f in self.service_path.glob('*.ts')
        )
        has_tests = any(f.name.endswith('.test.ts') for f in self.service_path.glob('*.ts'))

        if has_business_logic and has_tests:
            pattern = "A (Contract-First)"
            self.info.append(f"✓ Detected Pattern {pattern}")
        elif not has_business_logic:
            pattern = "B (Canonical CRUD)"
            self.info.append(f"✓ Detected Pattern {pattern}")
        else:
            pattern = "C (Hybrid) or incomplete Pattern A"
            self.warnings.append(f"Pattern {pattern} detected. Verify intentional.")

    def print_results(self):
        """Print validation results with color coding."""
        print(f"\n{'-'*60}")
        print("VALIDATION RESULTS")
        print(f"{'-'*60}\n")

        if self.info:
            print(f"{GREEN}INFO:{RESET}")
            for msg in self.info:
                print(f"  {msg}")
            print()

        if self.warnings:
            print(f"{YELLOW}WARNINGS:{RESET}")
            for msg in self.warnings:
                print(f"  ⚠️  {msg}")
            print()

        if self.errors:
            print(f"{RED}ERRORS:{RESET}")
            for msg in self.errors:
                print(f"  ❌ {msg}")
            print()

        # Summary
        if self.errors:
            print(f"{RED}❌ VALIDATION FAILED{RESET} ({len(self.errors)} errors, {len(self.warnings)} warnings)\n")
        elif self.warnings:
            print(f"{YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS{RESET} ({len(self.warnings)} warnings)\n")
        else:
            print(f"{GREEN}✅ VALIDATION PASSED{RESET}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_service_structure.py <service-path>")
        print("Example: python validate_service_structure.py services/loyalty")
        sys.exit(1)

    service_path = sys.argv[1]

    if not os.path.exists(service_path):
        print(f"{RED}Error:{RESET} Service path does not exist: {service_path}")
        sys.exit(1)

    validator = ServiceValidator(service_path)
    success = validator.validate()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
