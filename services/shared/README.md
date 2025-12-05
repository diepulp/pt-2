# Shared Services - Cross-Cutting Utilities

> **Bounded Context**: "Reusable utilities and types shared across all service modules"
> **Status**: Implemented

## Purpose

This directory contains shared utilities and types used across multiple service modules. It does NOT own any database tables but provides:

- **React Query key serialization utilities** (`key-utils.ts`)
- **Shared TypeScript types** (`types.ts`)
- **Common service response patterns** (`service-result.ts`)

## Pattern

**Pattern**: Shared Utilities (Not a traditional service)

**Rationale**: This is not a bounded context service but rather a collection of cross-cutting utilities. It doesn't follow Pattern A/B/C because it doesn't own tables or expose DTOs.

## Contents

### key-utils.ts
Provides `serializeKeyFilters()` for React Query key factories.

Used by ALL services for consistent filter serialization in query keys.

### Types
Common types used across service layer (e.g., `ServiceResult<T>`).

## Dependencies

**Consumed By**: All services (casino, player, loyalty, finance, etc.)

## References

- [SLAD §308-350](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- [React Query Key Patterns](../../docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
