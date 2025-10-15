-- Migration: Create staff_permissions table
-- Phase 6 Wave 3 - Track 1: Permission Service Implementation
-- Purpose: Enable RBAC for staff operations (e.g., loyalty:award capability)

CREATE TABLE IF NOT EXISTS public.staff_permissions (
    staff_id UUID NOT NULL REFERENCES public."Staff"(id) ON DELETE CASCADE,
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (staff_id)
);

-- Index for capability lookups
CREATE INDEX idx_staff_permissions_capabilities ON public.staff_permissions USING GIN(capabilities);

-- RLS Policies (require authentication)
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read staff permissions
CREATE POLICY "Allow authenticated users to read staff permissions"
    ON public.staff_permissions
    FOR SELECT
    TO authenticated
    USING (true);

-- Only service role can modify permissions
CREATE POLICY "Only service role can modify permissions"
    ON public.staff_permissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Comment table
COMMENT ON TABLE public.staff_permissions IS 'Staff permission capabilities for RBAC (Phase 6 Wave 3)';
COMMENT ON COLUMN public.staff_permissions.staff_id IS 'Reference to Staff table';
COMMENT ON COLUMN public.staff_permissions.capabilities IS 'Array of capability strings (e.g., ["loyalty:award", "mtl:create"])';
