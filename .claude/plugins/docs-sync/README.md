# Docs Sync Plugin

Validates architecture documentation consistency and regenerates derived artifacts.

## Installation

This plugin is part of the PT-2 project and loads automatically when the project is opened in Claude Code.

## Commands

- `/docs-sync` - Full validation of all documentation
- `/docs-sync scope=path` - Validate specific directory
- `/docs-sync skip_matrix=true` - Skip SRM validation

## What It Validates

1. **Service Responsibility Matrix (SRM)** - Schema alignment
2. **Architecture Decision Records (ADRs)** - Index synchronization
3. **Memory Files** - Compression integrity
4. **Documentation Indices** - Catalog completeness

## When to Use

- Before committing documentation changes
- After modifying SRM or ADRs
- When documentation seems out of sync
- As part of CI/CD pipeline

## Version

1.0.0 - Official plugin format (migrated from `.claude/skills/`)
