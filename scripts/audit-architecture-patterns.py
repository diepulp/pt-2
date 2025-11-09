#!/usr/bin/env python3
"""
Architecture Pattern Consistency Auditor
Focuses on core system patterns, anti-patterns, and architectural decisions.

Audits:
- Service layer patterns
- Type system patterns
- State management patterns
- Real-time patterns
- Anti-patterns and prohibitions
"""

import re
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Set
import json


class PatternAuditor:
    def __init__(self, docs_dir: Path):
        self.docs_dir = docs_dir
        self.documents = {}
        self.patterns = defaultdict(lambda: defaultdict(list))
        self.contradictions = []

        # Core pattern categories to audit
        self.pattern_categories = {
            'service_implementation': {
                'keywords': ['functional factories', 'factory function', 'class-based',
                            'classes', 'BaseService', 'ServiceFactory'],
                'description': 'How services should be implemented'
            },
            'type_inference': {
                'keywords': ['ReturnType', 'explicit interface', 'type inference'],
                'description': 'Type declaration patterns'
            },
            'supabase_client': {
                'keywords': ['SupabaseClient', 'createClient', 'any', 'client instantiation'],
                'description': 'Supabase client handling'
            },
            'state_management': {
                'keywords': ['React Query', 'Zustand', 'staleTime', 'global state',
                            'real-time', 'cache'],
                'description': 'State management approach'
            },
            'exports': {
                'keywords': ['default export', 'named export', 'export pattern'],
                'description': 'Module export patterns'
            }
        }

    def load_architecture_docs(self):
        """Load only core architecture documents"""
        print("📂 Loading architecture documents...")

        # Core architecture paths
        patterns = [
            'system-prd/*.md',
            'patterns/*.md',
            'adr/*.md'
        ]

        for pattern in patterns:
            for file_path in self.docs_dir.glob(pattern):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        rel_path = file_path.relative_to(self.docs_dir)
                        self.documents[str(rel_path)] = {
                            'path': file_path,
                            'content': content,
                            'lines': content.split('\n')
                        }
                except Exception as e:
                    print(f"⚠️  Error loading {file_path}: {e}")

        print(f"✅ Loaded {len(self.documents)} architecture documents\n")

    def extract_pattern_statements(self):
        """Extract statements about each pattern category"""
        print("🔍 Extracting pattern statements...\n")

        for doc_path, doc in self.documents.items():
            content_lower = doc['content'].lower()

            for category, config in self.pattern_categories.items():
                for keyword in config['keywords']:
                    keyword_lower = keyword.lower()

                    # Find all occurrences of this keyword
                    for match in re.finditer(re.escape(keyword_lower), content_lower):
                        start_pos = match.start()

                        # Get the full line and surrounding context
                        line_num = content_lower[:start_pos].count('\n') + 1
                        line_start = content_lower.rfind('\n', 0, start_pos) + 1
                        line_end = content_lower.find('\n', start_pos)
                        if line_end == -1:
                            line_end = len(content_lower)

                        full_line = doc['content'][line_start:line_end]

                        # Determine directive (should/must/never/ban/etc)
                        directive = self._extract_directive(full_line)

                        if directive:
                            self.patterns[category][doc_path].append({
                                'line': line_num,
                                'keyword': keyword,
                                'directive': directive,
                                'statement': full_line.strip(),
                                'context': self._get_context(doc['lines'], line_num, 2)
                            })

    def _extract_directive(self, text: str) -> str:
        """Extract the directive (prescriptive/prohibitive/neutral)"""
        text_lower = text.lower()

        # Prohibitive patterns (anti-patterns, bans)
        if any(word in text_lower for word in ['ban', 'never', 'must not', 'do not',
                                                 'don\'t', 'forbidden', 'prohibited',
                                                 'anti-pattern', '❌', 'avoid']):
            return 'PROHIBITED'

        # Prescriptive patterns (requirements)
        if any(word in text_lower for word in ['must', 'should', 'require', 'enforce',
                                                 'always', '✅', 'use', 'implement']):
            return 'REQUIRED'

        # Permissive
        if any(word in text_lower for word in ['can', 'may', 'optional', 'allowed']):
            return 'OPTIONAL'

        return 'NEUTRAL'

    def _get_context(self, lines: List[str], line_num: int, context_lines: int = 2) -> str:
        """Get surrounding lines for context"""
        start = max(0, line_num - context_lines - 1)
        end = min(len(lines), line_num + context_lines)
        return '\n'.join(lines[start:end])

    def detect_pattern_contradictions(self):
        """Detect contradictions in architectural patterns"""
        print("🔍 Detecting pattern contradictions...\n")

        for category, config in self.pattern_categories.items():
            doc_patterns = self.patterns[category]

            if not doc_patterns:
                continue

            # Collect all directives for this category
            required = []
            prohibited = []

            for doc_path, statements in doc_patterns.items():
                for stmt in statements:
                    if stmt['directive'] == 'REQUIRED':
                        required.append({**stmt, 'source': doc_path})
                    elif stmt['directive'] == 'PROHIBITED':
                        prohibited.append({**stmt, 'source': doc_path})

            # Check for conflicts between required and prohibited
            if required and prohibited:
                # Look for actual semantic conflicts
                conflicts = self._find_semantic_conflicts(category, required, prohibited)

                if conflicts:
                    self.contradictions.append({
                        'category': category,
                        'description': config['description'],
                        'conflicts': conflicts
                    })

    def _find_semantic_conflicts(self, category: str, required: List, prohibited: List) -> List:
        """Find actual semantic conflicts (not just keyword matches)"""
        conflicts = []

        # Category-specific conflict detection
        if category == 'service_implementation':
            # Check if classes are both required and prohibited
            classes_required = any('class' in r['keyword'].lower() and
                                  'factory' not in r['statement'].lower()
                                  for r in required)
            classes_prohibited = any('class' in p['keyword'].lower()
                                    for p in prohibited)

            if classes_required and classes_prohibited:
                conflicts.append({
                    'issue': 'Class-based services',
                    'required_by': [r for r in required if 'class' in r['keyword'].lower()],
                    'prohibited_by': [p for p in prohibited if 'class' in p['keyword'].lower()]
                })

        elif category == 'type_inference':
            # Check ReturnType guidance
            returntype_allowed = any('returntype' in r['statement'].lower() and
                                    'use' in r['statement'].lower()
                                    for r in required)
            returntype_banned = any('returntype' in p['statement'].lower()
                                   for p in prohibited)

            if returntype_allowed and returntype_banned:
                conflicts.append({
                    'issue': 'ReturnType usage',
                    'required_by': [r for r in required if 'returntype' in r['statement'].lower()],
                    'prohibited_by': [p for p in prohibited if 'returntype' in p['statement'].lower()]
                })

        elif category == 'supabase_client':
            # Check if 'any' typing is both required and prohibited
            any_required = any('any' in r['statement'].lower() and
                              'use' in r['statement'].lower()
                              for r in required)
            any_prohibited = any('any' in p['statement'].lower()
                                for p in prohibited)

            if any_required and any_prohibited:
                conflicts.append({
                    'issue': 'Supabase client typing with any',
                    'required_by': [r for r in required if 'any' in r['statement'].lower()],
                    'prohibited_by': [p for p in prohibited if 'any' in p['statement'].lower()]
                })

        elif category == 'exports':
            # Check export pattern consistency
            default_required = any('default' in r['statement'].lower() and
                                  'use' in r['statement'].lower()
                                  for r in required)
            default_prohibited = any('default' in p['statement'].lower()
                                    for p in prohibited)

            if default_required and default_prohibited:
                conflicts.append({
                    'issue': 'Default vs named exports',
                    'required_by': [r for r in required if 'default' in r['statement'].lower()],
                    'prohibited_by': [p for p in prohibited if 'default' in p['statement'].lower()]
                })

        return conflicts

    def generate_pattern_summary(self) -> dict:
        """Generate summary of pattern consistency"""
        summary = {
            'documents_analyzed': len(self.documents),
            'pattern_categories': len(self.pattern_categories),
            'contradictions_found': len(self.contradictions),
            'patterns_by_category': {}
        }

        for category, config in self.pattern_categories.items():
            doc_patterns = self.patterns[category]

            required_count = sum(1 for doc in doc_patterns.values()
                               for stmt in doc if stmt['directive'] == 'REQUIRED')
            prohibited_count = sum(1 for doc in doc_patterns.values()
                                 for stmt in doc if stmt['directive'] == 'PROHIBITED')

            summary['patterns_by_category'][category] = {
                'description': config['description'],
                'documents_mentioning': len(doc_patterns),
                'required_statements': required_count,
                'prohibited_statements': prohibited_count
            }

        return summary

    def generate_report(self) -> dict:
        """Generate comprehensive audit report"""
        return {
            'summary': self.generate_pattern_summary(),
            'contradictions': self.contradictions,
            'pattern_details': {
                category: dict(patterns)
                for category, patterns in self.patterns.items()
            }
        }

    def generate_markdown_report(self) -> str:
        """Generate human-readable markdown report"""
        report = self.generate_report()
        summary = report['summary']

        md = "# Architecture Pattern Consistency Audit\n\n"
        md += f"**Scope**: System patterns, anti-patterns, and architectural decisions\n"
        md += f"**Documents**: {summary['documents_analyzed']}\n\n"

        md += "## Executive Summary\n\n"
        md += f"- **Pattern Categories Analyzed**: {summary['pattern_categories']}\n"
        md += f"- **Contradictions Found**: {summary['contradictions_found']}\n\n"

        # Pattern summary by category
        md += "## Pattern Categories\n\n"
        for category, info in summary['patterns_by_category'].items():
            md += f"### {category.replace('_', ' ').title()}\n\n"
            md += f"**Description**: {info['description']}\n\n"
            md += f"- Documents mentioning: {info['documents_mentioning']}\n"
            md += f"- REQUIRED statements: {info['required_statements']}\n"
            md += f"- PROHIBITED statements: {info['prohibited_statements']}\n"
            md += f"- **Status**: "

            if info['required_statements'] > 0 and info['prohibited_statements'] == 0:
                md += "✅ Clear guidance (prescribed)\n"
            elif info['prohibited_statements'] > 0 and info['required_statements'] == 0:
                md += "✅ Clear guidance (anti-pattern)\n"
            elif info['required_statements'] > 0 and info['prohibited_statements'] > 0:
                md += "⚠️  Mixed guidance (check for contradictions)\n"
            else:
                md += "ℹ️  Neutral (no strong guidance)\n"

            md += "\n"

        # Contradictions
        if report['contradictions']:
            md += "## Contradictions Found\n\n"
            for i, contradiction in enumerate(report['contradictions'], 1):
                md += f"### C{i:03d}: {contradiction['description']}\n\n"
                md += f"**Category**: {contradiction['category']}\n\n"

                for conflict in contradiction['conflicts']:
                    md += f"#### Issue: {conflict['issue']}\n\n"

                    if conflict.get('required_by'):
                        md += "**Required by**:\n"
                        for req in conflict['required_by'][:3]:  # Limit to 3 examples
                            md += f"- `{req['source']}:{req['line']}` - {req['statement'][:100]}...\n"
                        md += "\n"

                    if conflict.get('prohibited_by'):
                        md += "**Prohibited by**:\n"
                        for proh in conflict['prohibited_by'][:3]:  # Limit to 3 examples
                            md += f"- `{proh['source']}:{proh['line']}` - {proh['statement'][:100]}...\n"
                        md += "\n"
        else:
            md += "## ✅ No Contradictions Found\n\n"
            md += "All architectural patterns are consistent across documents.\n\n"

        # Detailed pattern statements
        md += "## Detailed Pattern Statements\n\n"
        for category, config in self.pattern_categories.items():
            doc_patterns = self.patterns[category]

            if not doc_patterns:
                continue

            md += f"### {category.replace('_', ' ').title()}\n\n"

            for doc_path, statements in sorted(doc_patterns.items()):
                md += f"#### {doc_path}\n\n"

                for stmt in statements:
                    directive_symbol = {
                        'REQUIRED': '✅',
                        'PROHIBITED': '❌',
                        'OPTIONAL': '⚪',
                        'NEUTRAL': 'ℹ️'
                    }.get(stmt['directive'], '•')

                    md += f"{directive_symbol} **Line {stmt['line']}** ({stmt['directive']})\n"
                    md += f"   - Keyword: `{stmt['keyword']}`\n"
                    md += f"   - Statement: {stmt['statement']}\n\n"

        md += "---\n\n*End of Architecture Pattern Audit*\n"

        return md


def main():
    import sys
    from datetime import datetime

    docs_dir = Path('docs')

    if not docs_dir.exists():
        print(f"❌ Error: Directory {docs_dir} does not exist")
        sys.exit(1)

    print("=" * 60)
    print("🏗️  ARCHITECTURE PATTERN CONSISTENCY AUDITOR")
    print("=" * 60)
    print(f"Source: {docs_dir.absolute()}")
    print(f"Scope: System patterns, anti-patterns, architecture")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    auditor = PatternAuditor(docs_dir)

    # Run audit
    auditor.load_architecture_docs()
    auditor.extract_pattern_statements()
    auditor.detect_pattern_contradictions()

    # Generate reports
    report = auditor.generate_report()

    # Save JSON report
    json_path = Path('architecture-pattern-audit.json')
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"💾 JSON report saved: {json_path}")

    # Save Markdown report
    md_report = auditor.generate_markdown_report()
    md_path = Path('architecture-pattern-audit.md')
    with open(md_path, 'w') as f:
        f.write(md_report)
    print(f"💾 Markdown report saved: {md_path}")

    # Print summary
    summary = report['summary']
    print()
    print("=" * 60)
    print("📊 AUDIT SUMMARY")
    print("=" * 60)
    print(f"Documents Analyzed:    {summary['documents_analyzed']}")
    print(f"Pattern Categories:    {summary['pattern_categories']}")
    print(f"Contradictions Found:  {summary['contradictions_found']}")
    print()

    for category, info in summary['patterns_by_category'].items():
        print(f"\n{category.replace('_', ' ').title()}:")
        print(f"  Required: {info['required_statements']}, Prohibited: {info['prohibited_statements']}")

    print()
    print(f"📄 Full reports:")
    print(f"   - {json_path}")
    print(f"   - {md_path}")
    print()

    # Exit code
    if summary['contradictions_found'] > 0:
        print(f"⚠️  {summary['contradictions_found']} contradictions found")
        sys.exit(1)
    else:
        print("✅ No contradictions found - patterns are consistent")
        sys.exit(0)


if __name__ == "__main__":
    main()
