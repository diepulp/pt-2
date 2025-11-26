#!/usr/bin/env python3
"""
Check documentation consistency - The Innovation!

Flags inconsistencies between governance documents and actual implementations:
- SERVICE_TEMPLATE vs actual service implementations
- SRM ownership vs service README claims
- DTO_CANONICAL_STANDARD vs actual DTO definitions
- Migration naming convention adherence

This helps surface documentation drift and conflicting guidance.

Enhanced with Memori integration for historical regression tracking.
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

# Add lib/memori to path
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "lib"))

try:
    from memori import create_memori_client, BackendServiceContext
    MEMORI_AVAILABLE = True
except ImportError:
    MEMORI_AVAILABLE = False
    print("⚠️  Memori SDK not available - running without historical context")

# Color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
BLUE = '\033[94m'
RESET = '\033[0m'

@dataclass
class Inconsistency:
    severity: str  # 'error' | 'warning' | 'info'
    category: str
    message: str
    doc_reference: str
    location: str

class DocConsistencyChecker:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.inconsistencies: List[Inconsistency] = []

        # Memori integration with Self-Improving Intelligence
        self.memori = None
        self.context: Optional[BackendServiceContext] = None
        if MEMORI_AVAILABLE:
            try:
                self.memori = create_memori_client("skill:backend-service-builder")
                self.memori.enable()
                self.context = BackendServiceContext(self.memori)
            except Exception as e:
                print(f"⚠️  Could not initialize Memori: {e}")

    def check_all(self):
        """Run all documentation consistency checks."""
        print(f"\n{'='*70}")
        print(f"{CYAN}PT-2 Documentation Consistency Checker{RESET}")
        print(f"{'='*70}\n")

        # Query past regressions BEFORE checking (Memori integration)
        if self.context:
            self._query_past_regressions()

        self.check_service_template_alignment()
        self.check_srm_ownership_claims()
        self.check_migration_naming()
        self.check_dto_standard_compliance()
        self.check_readme_completeness()

        # Record findings to Memori
        if self.context:
            self._record_findings()

        self.print_results()

        # Record validation session outcome
        if self.context:
            self._record_validation_session()

        # Auto-propose primitive updates for recurring issues (Self-Improving Intelligence)
        if self.context:
            self._propose_primitive_updates_for_recurring_issues()

    def _query_past_regressions(self):
        """Query Memori for past documentation regressions."""
        if not self.context:
            return

        past_regressions = self.context.query_past_violations(
            pattern_violated="documentation",
            limit=10
        )

        if past_regressions:
            print(f"{BLUE}📚 Historical Context:{RESET}")
            print(f"   Found {len(past_regressions)} past documentation issues\n")

            # Group by category
            categories = {}
            for r in past_regressions:
                metadata = r.get("metadata", {})
                category = metadata.get("finding_type", "Unknown")
                if category not in categories:
                    categories[category] = 0
                categories[category] += 1

            for category, count in list(categories.items())[:3]:
                print(f"   - {category}: {count} occurrences")

            print()

    def _record_findings(self):
        """Record all inconsistencies to Memori."""
        if not self.context:
            return

        for inc in self.inconsistencies:
            self.context.record_validation_finding(
                service_name="documentation",
                finding_type=inc.severity,
                pattern_violated=inc.category,
                description=inc.message,
                file_location=inc.location,
                severity="high" if inc.severity == "error" else "medium",
                resolved=False
            )

    def _record_validation_session(self):
        """Record validation session outcome."""
        if not self.context:
            return

        errors = sum(1 for i in self.inconsistencies if i.severity == 'error')
        warnings = sum(1 for i in self.inconsistencies if i.severity == 'warning')

        self.context.record_validation_session(
            service_name="documentation",
            validation_type="doc_consistency",
            errors_found=errors,
            warnings_found=warnings,
            all_checks_passed=(errors == 0)
        )

    def _propose_primitive_updates_for_recurring_issues(self):
        """
        Auto-propose primitive updates when issues recur frequently.

        This is part of the Self-Improving Intelligence system - it detects
        recurring documentation issues and proposes updates to the primitives.
        """
        if not self.context:
            return

        try:
            # Group current issues by category
            issue_counts = {}
            for inc in self.inconsistencies:
                if inc.severity == 'error':
                    key = (inc.category, inc.doc_reference)
                    if key not in issue_counts:
                        issue_counts[key] = []
                    issue_counts[key].append(inc)

            # Check if any category has 3+ issues (threshold for proposal)
            for (category, doc_ref), issues in issue_counts.items():
                if len(issues) >= 3:
                    # Build proposal
                    locations = [i.location for i in issues[:5]]  # Cap at 5 examples
                    proposal_text = f"Multiple {category} issues detected across {len(issues)} locations. "

                    if category == "SRM_OWNERSHIP":
                        proposal_text += "Consider updating SRM to reflect actual table ownership patterns."
                        update_type = "modify_pattern_rule"
                        primitive_file = "references/bounded-contexts.md"
                    elif category == "MIGRATION_NAMING":
                        proposal_text += "Migration naming conventions may need clarification or tooling enforcement."
                        update_type = "update_migration_pattern"
                        primitive_file = "references/migration-workflow.md"
                    elif category == "DTO_STANDARD":
                        proposal_text += "DTO standards may need revision for Pattern B services."
                        update_type = "add_dto_standard"
                        primitive_file = "references/dto-standards.md"
                    else:
                        proposal_text += "Consider reviewing and updating documentation."
                        update_type = "modify_pattern_rule"
                        primitive_file = f"references/{doc_ref.lower().replace(' ', '-')}"

                    # Propose the update
                    proposal_id = self.context.propose_primitive_update(
                        primitive_file=primitive_file,
                        update_type=update_type,
                        proposal=proposal_text,
                        evidence=[],  # Would need memory IDs from recording
                        impact_assessment=f"Affects {len(issues)} locations: {', '.join(locations[:3])}"
                    )

                    if proposal_id:
                        print(f"\n{CYAN}📋 Auto-Proposed Primitive Update:{RESET}")
                        print(f"  ID: {proposal_id}")
                        print(f"  File: {primitive_file}")
                        print(f"  Proposal: {proposal_text[:100]}...")
                        print(f"  Review with: context.get_pending_primitive_updates()")

        except Exception as e:
            print(f"⚠️  Could not propose primitive updates: {e}")

    def check_service_template_alignment(self):
        """Check if services match SERVICE_TEMPLATE patterns."""
        print(f"{CYAN}[1/5] Checking SERVICE_TEMPLATE alignment...{RESET}")

        template_path = self.project_root / 'docs/70-governance/SERVICE_TEMPLATE.md'
        if not template_path.exists():
            return

        # Read template to extract pattern requirements
        template_content = template_path.read_text()

        # Pattern A: Should have {feature}.ts and {feature}.test.ts
        # Pattern B: Should only have keys.ts and README.md

        services_dir = self.project_root / 'services'
        if not services_dir.exists():
            return

        for service_dir in services_dir.iterdir():
            if not service_dir.is_dir() or service_dir.name.startswith('.'):
                continue

            readme_path = service_dir / 'README.md'
            if not readme_path.exists():
                continue

            # Extract pattern from README
            readme = readme_path.read_text()
            # Match both formats: "Pattern A" or "**Pattern A: Description**"
            pattern_match = re.search(r'##\s*Pattern\s*\n+\s*\*?\*?Pattern\s+([ABC])', readme)

            if not pattern_match:
                self.inconsistencies.append(Inconsistency(
                    severity='warning',
                    category='SERVICE_TEMPLATE',
                    message=f"Pattern not clearly documented in README.md",
                    doc_reference='SERVICE_TEMPLATE.md § Pattern Selection',
                    location=f'services/{service_dir.name}/README.md'
                ))
                continue

            pattern = pattern_match.group(1)
            self.validate_pattern_structure(service_dir, pattern)

    def validate_pattern_structure(self, service_dir: Path, pattern: str):
        """Validate service directory structure matches declared pattern."""
        files = [f.name for f in service_dir.glob('*.ts')]
        has_keys = 'keys.ts' in files
        has_business_logic = any(
            f not in ['keys.ts'] and not f.endswith('.test.ts')
            for f in files
        )
        has_tests = any(f.endswith('.test.ts') for f in files)

        if pattern == 'A':
            # Pattern A: Should have business logic + tests
            if not has_business_logic:
                self.inconsistencies.append(Inconsistency(
                    severity='warning',
                    category='SERVICE_TEMPLATE',
                    message=f"Pattern A service missing business logic files",
                    doc_reference='SERVICE_TEMPLATE.md § Pattern A',
                    location=f'services/{service_dir.name}/'
                ))

            if not has_tests:
                self.inconsistencies.append(Inconsistency(
                    severity='warning',
                    category='SERVICE_TEMPLATE',
                    message=f"Pattern A service missing test files (recommended ~80% coverage)",
                    doc_reference='SERVICE_TEMPLATE.md § Pattern A Checklist',
                    location=f'services/{service_dir.name}/'
                ))

        elif pattern == 'B':
            # Pattern B: Should be minimal (keys.ts + README only)
            if has_business_logic:
                self.inconsistencies.append(Inconsistency(
                    severity='info',
                    category='SERVICE_TEMPLATE',
                    message=f"Pattern B service has business logic files (may be Pattern C?)",
                    doc_reference='SERVICE_TEMPLATE.md § Pattern B',
                    location=f'services/{service_dir.name}/'
                ))

    def check_srm_ownership_claims(self):
        """Verify service README ownership claims match SRM."""
        print(f"{CYAN}[2/5] Checking SRM ownership alignment...{RESET}")

        # Hard-coded SRM ownership (from bounded-contexts.md reference)
        SRM_OWNERSHIP = {
            'casino': ['casino', 'casino_settings', 'company', 'staff', 'game_settings', 'audit_log', 'report'],
            'player': ['player', 'player_casino'],
            'visit': ['visit'],
            'loyalty': ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
            'rating-slip': ['rating_slip'],
            'finance': ['player_financial_transaction', 'finance_outbox'],
            'mtl': ['mtl_entry', 'mtl_audit_note'],
            'table-context': ['gaming_table', 'gaming_table_settings', 'dealer_rotation',
                               'table_inventory_snapshot', 'table_fill', 'table_credit', 'table_drop_event'],
            'floor-layout': ['floor_layout', 'floor_layout_version', 'floor_pit',
                              'floor_table_slot', 'floor_layout_activation'],
        }

        services_dir = self.project_root / 'services'
        if not services_dir.exists():
            return

        for service_dir in services_dir.iterdir():
            if not service_dir.is_dir():
                continue

            service_name = service_dir.name
            readme_path = service_dir / 'README.md'

            if not readme_path.exists():
                continue

            readme = readme_path.read_text()

            # Extract ownership claims from README
            ownership_section = re.search(
                r'##\s*Ownership\s*\n\s*\*\*Tables\*\*:\s*([^\n]+)',
                readme
            )

            if not ownership_section:
                continue

            claimed_tables = [
                t.strip().strip('`')
                for t in ownership_section.group(1).split(',')
            ]

            # Compare with SRM
            srm_tables = SRM_OWNERSHIP.get(service_name, [])

            # Check for tables claimed but not in SRM
            for table in claimed_tables:
                if table and table not in srm_tables:
                    self.inconsistencies.append(Inconsistency(
                        severity='error',
                        category='SRM_OWNERSHIP',
                        message=f"Service claims ownership of '{table}' but SRM doesn't list it",
                        doc_reference='SERVICE_RESPONSIBILITY_MATRIX.md',
                        location=f'services/{service_name}/README.md'
                    ))

            # Check for SRM tables not claimed in README
            for table in srm_tables:
                if table not in claimed_tables:
                    self.inconsistencies.append(Inconsistency(
                        severity='warning',
                        category='SRM_OWNERSHIP',
                        message=f"SRM lists '{table}' but README doesn't claim it",
                        doc_reference='SERVICE_RESPONSIBILITY_MATRIX.md',
                        location=f'services/{service_name}/README.md'
                    ))

    def check_migration_naming(self):
        """Verify migrations follow YYYYMMDDHHMMSS naming convention."""
        print(f"{CYAN}[3/5] Checking migration naming conventions...{RESET}")

        migrations_dir = self.project_root / 'supabase/migrations'
        if not migrations_dir.exists():
            return

        # Correct pattern: 14-digit timestamp + underscore + description
        correct_pattern = re.compile(r'^\d{14}_[a-z_]+\.sql$')

        for migration_file in migrations_dir.glob('*.sql'):
            filename = migration_file.name

            if not correct_pattern.match(filename):
                self.inconsistencies.append(Inconsistency(
                    severity='error',
                    category='MIGRATION_NAMING',
                    message=f"Migration doesn't follow YYYYMMDDHHMMSS_description.sql pattern: {filename}",
                    doc_reference='CLAUDE.md § Migration Naming Convention',
                    location=f'supabase/migrations/{filename}'
                ))

    def check_dto_standard_compliance(self):
        """Check DTO definitions comply with DTO_CANONICAL_STANDARD."""
        print(f"{CYAN}[4/5] Checking DTO_CANONICAL_STANDARD compliance...{RESET}")

        services_dir = self.project_root / 'services'
        if not services_dir.exists():
            return

        # Pattern B services (should use Pick/Omit, not manual interfaces)
        pattern_b_services = ['player', 'visit', 'casino', 'floor-layout']

        for service_dir in services_dir.iterdir():
            if not service_dir.is_dir() or service_dir.name not in pattern_b_services:
                continue

            # Check all .ts files for manual interface definitions
            for ts_file in service_dir.glob('*.ts'):
                if ts_file.name.endswith('.test.ts'):
                    continue

                content = ts_file.read_text()

                # Detect manual interface DTOs (anti-pattern for Pattern B)
                interface_pattern = re.compile(r'export\s+interface\s+\w+DTO\s*{')
                if interface_pattern.search(content):
                    self.inconsistencies.append(Inconsistency(
                        severity='error',
                        category='DTO_STANDARD',
                        message=f"Pattern B service uses manual interface (should use Pick/Omit)",
                        doc_reference='DTO_CANONICAL_STANDARD.md § Pattern B',
                        location=f'services/{service_dir.name}/{ts_file.name}'
                    ))

    def check_readme_completeness(self):
        """Verify all services have complete README.md."""
        print(f"{CYAN}[5/5] Checking README.md completeness...{RESET}")

        required_sections = [
            ('Bounded Context', r'>\s*\*\*Bounded Context\*\*:'),
            ('SRM Reference', r'>\s*\*\*SRM Reference\*\*:'),
            ('Ownership', r'##\s*Ownership'),
            ('Pattern', r'##\s*Pattern'),
        ]

        services_dir = self.project_root / 'services'
        if not services_dir.exists():
            return

        for service_dir in services_dir.iterdir():
            if not service_dir.is_dir():
                continue

            readme_path = service_dir / 'README.md'

            if not readme_path.exists():
                self.inconsistencies.append(Inconsistency(
                    severity='error',
                    category='README_MISSING',
                    message=f"Service missing README.md",
                    doc_reference='SERVICE_TEMPLATE.md § Service Documentation',
                    location=f'services/{service_dir.name}/'
                ))
                continue

            readme = readme_path.read_text()

            for section_name, pattern in required_sections:
                if not re.search(pattern, readme):
                    self.inconsistencies.append(Inconsistency(
                        severity='warning',
                        category='README_INCOMPLETE',
                        message=f"README.md missing or malformed section: {section_name}",
                        doc_reference='SERVICE_TEMPLATE.md § Service Documentation',
                        location=f'services/{service_dir.name}/README.md'
                    ))

    def print_results(self):
        """Print all inconsistencies found."""
        print(f"\n{'='*70}")
        print(f"{CYAN}DOCUMENTATION CONSISTENCY RESULTS{RESET}")
        print(f"{'='*70}\n")

        if not self.inconsistencies:
            print(f"{GREEN}✅ NO INCONSISTENCIES FOUND{RESET}")
            print(f"Documentation is aligned with implementations.\n")
            return

        # Group by severity
        errors = [i for i in self.inconsistencies if i.severity == 'error']
        warnings = [i for i in self.inconsistencies if i.severity == 'warning']
        infos = [i for i in self.inconsistencies if i.severity == 'info']

        if errors:
            print(f"{RED}ERRORS ({len(errors)}):{RESET}\n")
            for inc in errors:
                print(f"  ❌ [{inc.category}] {inc.message}")
                print(f"     Location: {inc.location}")
                print(f"     Reference: {inc.doc_reference}")
                print()

        if warnings:
            print(f"{YELLOW}WARNINGS ({len(warnings)}):{RESET}\n")
            for inc in warnings:
                print(f"  ⚠️  [{inc.category}] {inc.message}")
                print(f"     Location: {inc.location}")
                print(f"     Reference: {inc.doc_reference}")
                print()

        if infos:
            print(f"{CYAN}INFO ({len(infos)}):{RESET}\n")
            for inc in infos:
                print(f"  ℹ️  [{inc.category}] {inc.message}")
                print(f"     Location: {inc.location}")
                print(f"     Reference: {inc.doc_reference}")
                print()

        # Summary
        total = len(self.inconsistencies)
        print(f"{'='*70}")
        if errors:
            print(f"{RED}❌ VALIDATION FAILED{RESET} ({len(errors)} errors, {len(warnings)} warnings, {len(infos)} info)\n")
        elif warnings:
            print(f"{YELLOW}⚠️  INCONSISTENCIES DETECTED{RESET} ({len(warnings)} warnings, {len(infos)} info)\n")
        else:
            print(f"{GREEN}✅ MINOR INCONSISTENCIES{RESET} ({len(infos)} info items)\n")

        print(f"{CYAN}Recommendation:{RESET} Review inconsistencies and update either:")
        print("  1. Documentation (if implementation is correct)")
        print("  2. Implementation (if documentation is correct)")
        print()

def main():
    if len(sys.argv) < 2:
        project_root = os.getcwd()
    else:
        project_root = sys.argv[1]

    checker = DocConsistencyChecker(project_root)
    checker.check_all()

    # Exit with error code if critical issues found
    has_errors = any(i.severity == 'error' for i in checker.inconsistencies)
    sys.exit(1 if has_errors else 0)

if __name__ == '__main__':
    main()
