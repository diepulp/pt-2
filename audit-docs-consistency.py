#!/usr/bin/env python3
"""
Documentation Consistency Auditor
Analyzes compressed docs for contradictions, redundancy, and drift.

Phase 0.1 of Documentation Audit & Reconciliation
"""

import re
import json
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Any
from difflib import SequenceMatcher


class ConsistencyAuditor:
    def __init__(self, docs_dir: Path):
        self.docs_dir = docs_dir
        self.documents = {}
        self.facts = defaultdict(list)
        self.contradictions = []
        self.redundancy = []
        self.broken_links = []
        self.outdated_refs = []

    def load_documents(self):
        """Load all markdown files from the docs directory"""
        print("📂 Loading documentation files...")
        md_files = list(self.docs_dir.rglob('*.md'))

        for file_path in md_files:
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

        print(f"✅ Loaded {len(self.documents)} documents\n")

    def extract_tech_stack_mentions(self):
        """Find all mentions of tech stack"""
        print("🔍 Extracting tech stack mentions...")

        tech_patterns = {
            'Next.js': r'Next\.js\s*(?:v?(\d+(?:\.\d+)*))?',
            'Supabase': r'Supabase\s*(?:v?(\d+(?:\.\d+)*))?',
            'React Query': r'React\s+Query\s*(?:v?(\d+(?:\.\d+)*))?|@tanstack/react-query',
            'Zustand': r'Zustand\s*(?:v?(\d+(?:\.\d+)*))?',
            'shadcn': r'shadcn(?:/ui)?\s*(?:v?(\d+(?:\.\d+)*))?',
            'TypeScript': r'TypeScript\s*(?:v?(\d+(?:\.\d+)*))?',
        }

        for doc_path, doc in self.documents.items():
            for tech, pattern in tech_patterns.items():
                matches = re.finditer(pattern, doc['content'], re.IGNORECASE)
                for match in matches:
                    version = match.group(1) if match.lastindex else 'unspecified'
                    self.facts['tech_stack'].append({
                        'tech': tech,
                        'version': version,
                        'source': doc_path,
                        'context': self._get_context(doc['content'], match.start())
                    })

    def extract_pattern_statements(self):
        """Find statements about patterns (should/must/never)"""
        print("🔍 Extracting pattern statements...")

        pattern_keywords = [
            r'(service|Service)s?\s+(should|SHOULD|must|MUST|MUST NOT|never|NEVER|cannot|CANNOT)',
            r'(type|Type)s?\s+(should|SHOULD|must|MUST|MUST NOT|never|NEVER)',
            r'(hook|Hook)s?\s+(should|SHOULD|must|MUST|MUST NOT|never|NEVER)',
            r'(component|Component)s?\s+(should|SHOULD|must|MUST|MUST NOT|never|NEVER)',
            r'(DO NOT|❌|anti-pattern|forbidden|prohibited|deprecated)',
            r'(functional factories|class-based|classes)',
            r'(ReturnType|explicit interfaces)',
            r'(global|singleton|stateful)',
        ]

        for doc_path, doc in self.documents.items():
            for pattern in pattern_keywords:
                matches = re.finditer(pattern, doc['content'], re.MULTILINE)
                for match in matches:
                    line_num = doc['content'][:match.start()].count('\n') + 1
                    context = self._get_line_context(doc['lines'], line_num)

                    self.facts['patterns'].append({
                        'statement': context,
                        'source': doc_path,
                        'line': line_num,
                        'matched': match.group(0)
                    })

    def extract_temporal_references(self):
        """Find date and status references"""
        print("🔍 Extracting temporal references...")

        temporal_patterns = [
            r'(Phase\s+\d+)\s+is\s+(\d+%)\s+complete',
            r'(Week\s+\d+)',
            r'(Wave\s+\d+)',
            r'(\d{4}-\d{2}-\d{2})',
            r'(Status|STATUS):\s*(\w+)',
            r'(completed?|in[- ]?progress|pending)',
        ]

        for doc_path, doc in self.documents.items():
            for pattern in temporal_patterns:
                matches = re.finditer(pattern, doc['content'], re.IGNORECASE)
                for match in matches:
                    line_num = doc['content'][:match.start()].count('\n') + 1

                    self.facts['temporal'].append({
                        'reference': match.group(0),
                        'source': doc_path,
                        'line': line_num,
                        'context': self._get_line_context(doc['lines'], line_num)
                    })

    def validate_cross_references(self):
        """Check all markdown links resolve"""
        print("🔍 Validating cross-references...")

        # Pattern for markdown links: [text](path)
        link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'

        for doc_path, doc in self.documents.items():
            matches = re.finditer(link_pattern, doc['content'])
            for match in matches:
                link_text = match.group(1)
                link_target = match.group(2)

                # Skip external links
                if link_target.startswith('http://') or link_target.startswith('https://'):
                    continue

                # Skip anchors only
                if link_target.startswith('#'):
                    continue

                # Clean up the link target
                link_target = link_target.split('#')[0]  # Remove anchor

                # Resolve relative path
                doc_file_path = self.docs_dir / doc_path
                target_path = (doc_file_path.parent / link_target).resolve()

                # Check if file exists
                if not target_path.exists():
                    line_num = doc['content'][:match.start()].count('\n') + 1
                    self.broken_links.append({
                        'source': doc_path,
                        'line': line_num,
                        'link_text': link_text,
                        'target': link_target,
                        'resolved_path': str(target_path),
                        'context': self._get_line_context(doc['lines'], line_num)
                    })

    def detect_contradictions(self):
        """Compare extracted facts for conflicts"""
        print("🔍 Detecting contradictions...")

        # Check for contradictory pattern statements
        service_patterns = [f for f in self.facts['patterns'] if 'service' in f['statement'].lower()]

        # Look for conflicting statements about services
        class_based = []
        functional = []

        for pattern in service_patterns:
            stmt = pattern['statement'].lower()
            if 'class' in stmt and ('should' in stmt or 'must' in stmt):
                class_based.append(pattern)
            if 'functional' in stmt or 'functional factories' in stmt:
                functional.append(pattern)

        if class_based and functional:
            self.contradictions.append({
                'category': 'service_implementation',
                'severity': 'high',
                'description': 'Conflicting guidance on service implementation (class vs functional)',
                'sources': {
                    'class_based': class_based,
                    'functional': functional
                }
            })

        # Check for conflicting type guidance
        type_patterns = [f for f in self.facts['patterns'] if 'type' in f['statement'].lower() or 'returntype' in f['statement'].lower()]

        returntype_allowed = []
        returntype_banned = []

        for pattern in type_patterns:
            stmt = pattern['statement'].lower()
            if 'returntype' in stmt:
                if any(word in stmt for word in ['never', 'must not', 'ban', '❌', 'do not']):
                    returntype_banned.append(pattern)
                elif any(word in stmt for word in ['should', 'can', 'use']):
                    returntype_allowed.append(pattern)

        if returntype_allowed and returntype_banned:
            self.contradictions.append({
                'category': 'type_inference',
                'severity': 'high',
                'description': 'Conflicting guidance on ReturnType usage',
                'sources': {
                    'allowed': returntype_allowed,
                    'banned': returntype_banned
                }
            })

    def find_redundancy(self):
        """Identify duplicate information with variations"""
        print("🔍 Finding redundant information...")

        # Compare document titles and content for similarity
        doc_list = list(self.documents.items())

        for i, (path1, doc1) in enumerate(doc_list):
            for path2, doc2 in doc_list[i+1:]:
                # Skip if same directory suggests intentional organization
                if Path(path1).parent != Path(path2).parent:
                    continue

                # Calculate content similarity
                similarity = self._calculate_similarity(doc1['content'], doc2['content'])

                if similarity > 0.7:  # 70% similar
                    self.redundancy.append({
                        'files': [path1, path2],
                        'similarity': similarity,
                        'note': 'High content similarity detected'
                    })

        # Check for repeated explanations of key concepts
        key_concepts = [
            'service layer',
            'type safety',
            'real-time',
            'state management',
            'anti-pattern',
        ]

        for concept in key_concepts:
            occurrences = []
            pattern = re.compile(rf'#{1,3}\s*.*{re.escape(concept)}.*', re.IGNORECASE)

            for doc_path, doc in self.documents.items():
                matches = pattern.finditer(doc['content'])
                for match in matches:
                    line_num = doc['content'][:match.start()].count('\n') + 1
                    # Get the section content (until next heading or end)
                    section_content = self._extract_section(doc['content'], match.start())
                    occurrences.append({
                        'source': doc_path,
                        'line': line_num,
                        'heading': match.group(0),
                        'content_length': len(section_content)
                    })

            if len(occurrences) > 2:  # Repeated in more than 2 places
                self.redundancy.append({
                    'type': 'concept_redundancy',
                    'concept': concept,
                    'occurrences': occurrences,
                    'count': len(occurrences),
                    'note': f'Concept "{concept}" explained in {len(occurrences)} different locations'
                })

    def find_outdated_temporal_refs(self):
        """Find date/status references that may be outdated"""
        print("🔍 Finding outdated temporal references...")

        # Group temporal references by type
        phase_completions = defaultdict(list)

        for ref in self.facts['temporal']:
            # Look for phase completion percentages
            match = re.search(r'(Phase\s+\d+)\s+is\s+(\d+)%\s+complete', ref['reference'], re.IGNORECASE)
            if match:
                phase = match.group(1)
                percentage = int(match.group(2))
                phase_completions[phase].append({
                    'percentage': percentage,
                    'source': ref['source'],
                    'line': ref['line'],
                    'context': ref['context']
                })

        # Check for conflicting percentages
        for phase, completions in phase_completions.items():
            if len(completions) > 1:
                percentages = [c['percentage'] for c in completions]
                if len(set(percentages)) > 1:  # Different values
                    self.outdated_refs.append({
                        'type': 'conflicting_status',
                        'phase': phase,
                        'values': completions,
                        'note': f'Multiple different completion percentages found for {phase}'
                    })

    def _get_context(self, content: str, pos: int, chars: int = 100) -> str:
        """Get surrounding context for a position in content"""
        start = max(0, pos - chars)
        end = min(len(content), pos + chars)
        return content[start:end].replace('\n', ' ').strip()

    def _get_line_context(self, lines: List[str], line_num: int, context_lines: int = 2) -> str:
        """Get surrounding lines for context"""
        start = max(0, line_num - context_lines - 1)
        end = min(len(lines), line_num + context_lines)
        return '\n'.join(lines[start:end])

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity ratio between two texts"""
        return SequenceMatcher(None, text1, text2).ratio()

    def _extract_section(self, content: str, start_pos: int) -> str:
        """Extract section content from a heading to the next heading"""
        # Find next heading or end of document
        next_heading = re.search(r'\n#{1,6}\s', content[start_pos:])
        if next_heading:
            end_pos = start_pos + next_heading.start()
        else:
            end_pos = len(content)

        return content[start_pos:end_pos]

    def generate_report(self) -> dict:
        """Generate comprehensive audit report"""
        return {
            'summary': {
                'total_files': len(self.documents),
                'contradictions_found': len(self.contradictions),
                'redundancy_found': len(self.redundancy),
                'broken_links_found': len(self.broken_links),
                'outdated_refs_found': len(self.outdated_refs)
            },
            'contradictions': self.contradictions,
            'redundancy': self.redundancy,
            'broken_links': self.broken_links,
            'outdated_refs': self.outdated_refs,
            'tech_stack': self.facts['tech_stack'][:10],  # Sample
            'pattern_statements': self.facts['patterns'][:20],  # Sample
            'temporal_refs': self.facts['temporal'][:20]  # Sample
        }

    def generate_markdown_report(self) -> str:
        """Generate human-readable markdown report"""
        report = self.generate_report()

        md = "# Documentation Consistency Audit Report\n\n"
        md += f"**Generated**: {Path.cwd()}\n"
        md += f"**Source**: {self.docs_dir}\n\n"

        md += "## Executive Summary\n\n"
        md += f"- **Files Analyzed**: {report['summary']['total_files']}\n"
        md += f"- **Contradictions Found**: {report['summary']['contradictions_found']}\n"
        md += f"- **Redundancy Instances**: {report['summary']['redundancy_found']}\n"
        md += f"- **Broken Links**: {report['summary']['broken_links_found']}\n"
        md += f"- **Outdated References**: {report['summary']['outdated_refs_found']}\n\n"

        # Contradictions
        if report['contradictions']:
            md += "## Contradictions\n\n"
            for i, contradiction in enumerate(report['contradictions'], 1):
                md += f"### C{i:03d}: {contradiction['description']}\n\n"
                md += f"**Category**: {contradiction['category']}\n"
                md += f"**Severity**: {contradiction['severity']}\n\n"

                for source_type, sources in contradiction['sources'].items():
                    md += f"**{source_type.replace('_', ' ').title()}**:\n"
                    for source in sources[:3]:  # Limit to 3 examples
                        md += f"- `{source['source']}:{source['line']}` - {source['statement'][:100]}...\n"
                    md += "\n"

        # Broken Links
        if report['broken_links']:
            md += "## Broken Links\n\n"
            for i, link in enumerate(report['broken_links'][:20], 1):  # Limit to 20
                md += f"{i}. `{link['source']}:{link['line']}`\n"
                md += f"   - Link text: `{link['link_text']}`\n"
                md += f"   - Target: `{link['target']}`\n"
                md += f"   - Resolved to: `{link['resolved_path']}`\n\n"

        # Redundancy
        if report['redundancy']:
            md += "## Redundancy\n\n"
            for i, item in enumerate(report['redundancy'], 1):
                if 'files' in item:
                    md += f"{i}. **File Similarity**: {item['similarity']:.1%}\n"
                    md += f"   - {item['files'][0]}\n"
                    md += f"   - {item['files'][1]}\n\n"
                elif 'concept' in item:
                    md += f"{i}. **Concept Redundancy**: `{item['concept']}` ({item['count']} occurrences)\n"
                    for occ in item['occurrences'][:3]:
                        md += f"   - {occ['source']}:{occ['line']}\n"
                    md += "\n"

        # Outdated References
        if report['outdated_refs']:
            md += "## Outdated References\n\n"
            for i, ref in enumerate(report['outdated_refs'], 1):
                md += f"{i}. **{ref['phase']}**: {ref['note']}\n"
                for val in ref['values']:
                    md += f"   - {val['percentage']}% in `{val['source']}:{val['line']}`\n"
                md += "\n"

        md += "---\n\n"
        md += "*End of Audit Report*\n"

        return md


def main():
    import sys
    from datetime import datetime

    # Get docs directory from command line or use default
    if len(sys.argv) > 1:
        docs_dir = Path(sys.argv[1])
    else:
        docs_dir = Path('docs-compressed')

    if not docs_dir.exists():
        print(f"❌ Error: Directory {docs_dir} does not exist")
        sys.exit(1)

    print("=" * 60)
    print("📚 DOCUMENTATION CONSISTENCY AUDITOR")
    print("=" * 60)
    print(f"Source: {docs_dir.absolute()}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    auditor = ConsistencyAuditor(docs_dir)

    # Run all audit steps
    auditor.load_documents()
    auditor.extract_tech_stack_mentions()
    auditor.extract_pattern_statements()
    auditor.extract_temporal_references()
    auditor.validate_cross_references()
    auditor.detect_contradictions()
    auditor.find_redundancy()
    auditor.find_outdated_temporal_refs()

    # Generate reports
    report = auditor.generate_report()

    # Save JSON report
    json_path = Path('docs-consistency-report.json')
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"💾 JSON report saved: {json_path}")

    # Save Markdown report
    md_report = auditor.generate_markdown_report()
    md_path = Path('docs-consistency-report.md')
    with open(md_path, 'w') as f:
        f.write(md_report)
    print(f"💾 Markdown report saved: {md_path}")

    # Print summary
    print()
    print("=" * 60)
    print("📊 AUDIT SUMMARY")
    print("=" * 60)
    print(f"Files Analyzed:       {report['summary']['total_files']}")
    print(f"Contradictions:       {report['summary']['contradictions_found']}")
    print(f"Redundancy:           {report['summary']['redundancy_found']}")
    print(f"Broken Links:         {report['summary']['broken_links_found']}")
    print(f"Outdated References:  {report['summary']['outdated_refs_found']}")
    print()
    print(f"📄 Full reports:")
    print(f"   - {json_path}")
    print(f"   - {md_path}")
    print()

    # Return non-zero exit code if issues found
    issues = (report['summary']['contradictions_found'] +
             report['summary']['broken_links_found'])

    if issues > 0:
        print(f"⚠️  {issues} critical issues found requiring attention")
        sys.exit(1)
    else:
        print("✅ No critical issues found")
        sys.exit(0)


if __name__ == "__main__":
    main()
