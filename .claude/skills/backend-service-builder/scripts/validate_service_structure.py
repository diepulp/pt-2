#!/usr/bin/env python3
"""
Validate service structure against PT-2 architecture standards.

Checks:
- Required files exist (keys.ts, README.md)
- No class-based services (functional factories only)
- No ReturnType inference for service types
- Proper supabase typing (SupabaseClient<Database>)
- Pattern-appropriate file structure

Enhanced with Memori integration for historical violation tracking.
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional

# Add lib/memori to path
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "lib"))

try:
    from memori import create_memori_client, BackendServiceContext
    MEMORI_AVAILABLE = True
except ImportError:
    MEMORI_AVAILABLE = False
    print("⚠️  Memori SDK not available - running without historical context")

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

class ServiceValidator:
    def __init__(self, service_path: str):
        self.service_path = Path(service_path)
        self.service_name = self.service_path.name
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.info: List[str] = []

        # Memori integration with Self-Improving Intelligence
        self.memori = None
        self.context = None
        if MEMORI_AVAILABLE:
            try:
                self.memori = create_memori_client("skill:backend-service-builder")
                self.memori.enable()  # Required to activate memory recording
                self.context = BackendServiceContext(self.memori)
            except Exception as e:
                print(f"⚠️  Could not initialize Memori: {e}")
                MEMORI_AVAILABLE = False

    def validate(self) -> bool:
        """Run all validation checks. Returns True if all pass."""
        print(f"\n{'='*60}")
        print(f"Validating service: {self.service_name}")
        print(f"Path: {self.service_path}")
        print(f"{'='*60}\n")

        # Query past violations BEFORE validating (Memori integration)
        if self.context:
            self.query_past_violations()

        # Run all checks
        self.check_required_files()
        self.check_no_class_services()
        self.check_no_returntype_inference()
        self.check_supabase_typing()
        self.check_readme_content()
        self.detect_pattern()

        # Record findings to Memori
        if self.context:
            self.record_findings()

        # Print results (includes fix suggestions from history)
        self.print_results()

        # Record validation session outcome
        if self.context:
            self.record_validation_session()

        # Check for pattern regressions (Self-Improving Intelligence)
        if self.context:
            self.check_for_regressions()

        return len(self.errors) == 0

    def check_for_regressions(self):
        """Check for pattern regressions using Self-Improving Intelligence."""
        if not self.context:
            return

        try:
            regressions = self.context.detect_pattern_regressions()
            if regressions:
                print(f"\n{YELLOW}📉 Pattern Regressions Detected:{RESET}")
                for r in regressions:
                    print(f"  {r.pattern}: {r.baseline_success_rate:.0%} → {r.current_success_rate:.0%}")
                    print(f"    Decline: {r.decline_percentage:.1f}%")
                    print(f"    Suspected cause: {r.suspected_cause}")
                print()

            # Check for emerging anti-patterns
            anti_patterns = self.context.detect_anti_pattern_emergence(days=30)
            if anti_patterns:
                print(f"{YELLOW}🔍 Emerging Anti-Patterns:{RESET}")
                for ap in anti_patterns:
                    print(f"  {ap['anti_pattern']}: {ap['occurrence_count']} occurrences")
                    print(f"    {ap['recommendation']}")
                print()

        except Exception as e:
            print(f"⚠️  Could not check for regressions: {e}")

    def query_past_violations(self):
        """Query Memori for past validation issues with this service."""
        if not self.context:
            return

        past_violations = self.context.query_past_violations(
            service_name=self.service_name,
            limit=10
        )

        if past_violations:
            print(f"{BLUE}📚 Historical Context:{RESET}")
            print(f"   Found {len(past_violations)} past validation issues for {self.service_name}\n")

            # Group by pattern
            patterns = {}
            for v in past_violations:
                metadata = v.get("metadata", {})
                pattern = metadata.get("pattern_violated", "Unknown")
                if pattern not in patterns:
                    patterns[pattern] = []
                patterns[pattern].append(v)

            for pattern, issues in list(patterns.items())[:3]:  # Show top 3
                resolved_count = sum(1 for i in issues if i.get("metadata", {}).get("resolved"))
                print(f"   - {pattern}: {len(issues)} occurrences ({resolved_count} resolved)")

            print()

    def record_findings(self):
        """Record all validation findings to Memori."""
        if not self.context:
            return

        # Record errors
        for error in self.errors:
            pattern = self.extract_pattern_from_message(error)
            file_location = self.extract_file_location(error)

            self.context.record_validation_finding(
                service_name=self.service_name,
                finding_type="error",
                pattern_violated=pattern,
                description=error,
                file_location=file_location,
                severity="high",
                resolved=False
            )

        # Record warnings
        for warning in self.warnings:
            pattern = self.extract_pattern_from_message(warning)
            file_location = self.extract_file_location(warning)

            self.context.record_validation_finding(
                service_name=self.service_name,
                finding_type="warning",
                pattern_violated=pattern,
                description=warning,
                file_location=file_location,
                severity="medium",
                resolved=False
            )

    def record_validation_session(self):
        """Record validation session outcome."""
        if not self.context:
            return

        self.context.record_validation_session(
            service_name=self.service_name,
            validation_type="structure",
            errors_found=len(self.errors),
            warnings_found=len(self.warnings),
            all_checks_passed=(len(self.errors) == 0)
        )

    def extract_pattern_from_message(self, message: str) -> str:
        """Extract anti-pattern name from error/warning message."""
        if "ANTI-PATTERN" in message:
            # Extract pattern name from "ANTI-PATTERN: Pattern name detected"
            match = re.search(r'ANTI-PATTERN:\s*([^.]+?)(?:\sdetected|\.|$)', message)
            if match:
                return match.group(1).strip()

        if "Class-based service" in message:
            return "Class-based service"
        if "ReturnType inference" in message:
            return "ReturnType inference"
        if "supabase: any" in message:
            return "Supabase any typing"
        if "Missing required file" in message:
            return "Missing required file"
        if "Missing or malformed section" in message:
            return "README missing section"

        return "Unknown"

    def extract_file_location(self, message: str) -> Optional[str]:
        """Extract file location from error/warning message."""
        # Look for pattern: "filename.ts:"
        match = re.search(r'(\w+\.ts)(?::\d+)?', message)
        if match:
            return match.group(1)
        return None

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

            # Suggest fixes from historical resolutions (Memori integration)
            if self.context:
                self.suggest_fixes_from_history()

        # Summary
        if self.errors:
            print(f"{RED}❌ VALIDATION FAILED{RESET} ({len(self.errors)} errors, {len(self.warnings)} warnings)\n")
        elif self.warnings:
            print(f"{YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS{RESET} ({len(self.warnings)} warnings)\n")
        else:
            print(f"{GREEN}✅ VALIDATION PASSED{RESET}\n")

    def suggest_fixes_from_history(self):
        """Suggest fixes based on how similar violations were resolved before."""
        if not self.context:
            return

        # Get unique patterns from errors
        patterns = set(self.extract_pattern_from_message(e) for e in self.errors)

        print(f"{BLUE}💡 Suggested Fixes (from historical resolutions):{RESET}")

        for pattern in patterns:
            if pattern == "Unknown":
                continue

            suggestions = self.context.suggest_fix_from_history(pattern, limit=3)

            if suggestions:
                print(f"\n   {pattern}:")
                for i, suggestion in enumerate(suggestions, 1):
                    print(f"     {i}. {suggestion}")

        print()


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
