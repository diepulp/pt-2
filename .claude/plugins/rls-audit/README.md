# RLS Audit Plugin

Inspects Supabase Row-Level Security policies and validates compliance with SEC-001 security matrix.

## Installation

This plugin is part of the PT-2 project and loads automatically when the project is opened in Claude Code.

## Commands

- `/rls-audit table=public.player` - Audit all policies for table
- `/rls-audit table=public.visit casino_id=uuid` - Include test queries
- `/rls-audit table=public.rating_slip policy_name=name` - Focus specific policy

## What It Checks

1. **Tenancy Isolation** - `casino_id` scoping enforcement
2. **Role-Based Access** - Correct role assignments per SEC-001
3. **Operation Coverage** - All CRUD operations have policies
4. **Predicate Logic** - USING/WITH CHECK clauses match ownership rules

## When to Use

- Before deploying schema changes
- After modifying RLS policies
- During security audits
- When debugging access issues
- As part of CI/CD security checks

## Version

1.0.0 - Official plugin format (migrated from `.claude/skills/`)
