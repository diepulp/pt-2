/**
 * FloorLayoutService Zod Schemas
 *
 * Validation schemas for floor layout API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-004 Floor Layout Service
 */

import { z } from "zod";

import { uuidSchema, uuidSchemaOptional } from "@/lib/validation";

// === Floor Layout Schemas ===

/** Schema for creating a new floor layout */
export const createFloorLayoutSchema = z.object({
  casino_id: uuidSchema("casino ID"),
  name: z
    .string()
    .min(1, "Layout name is required")
    .max(100, "Layout name too long"),
  description: z
    .string()
    .max(500, "Description too long")
    .optional()
    .default(""),
  created_by: uuidSchema("staff ID"),
});

/** Schema for floor layout list query params */
export const floorLayoutListQuerySchema = z.object({
  casino_id: uuidSchema("casino ID"),
  status: z.enum(["draft", "review", "approved", "archived"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// === Floor Layout Version Schemas ===

/** Schema for floor layout version list query params */
export const floorLayoutVersionQuerySchema = z.object({
  status: z
    .enum(["draft", "pending_activation", "active", "retired"])
    .optional(),
  include_slots: z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "string") {
        return value === "true" || value === "1";
      }
      return value;
    }, z.boolean())
    .optional(),
});

// === Floor Layout Activation Schemas ===

/** Schema for activating a floor layout */
export const activateFloorLayoutSchema = z.object({
  casino_id: uuidSchema("casino ID"),
  layout_version_id: uuidSchema("layout version ID"),
  activated_by: uuidSchema("staff ID"),
  activation_request_id: uuidSchemaOptional("request ID"),
});

// === Route Param Schemas ===

/** Schema for layout ID route params */
export const layoutIdParamSchema = z.object({
  layoutId: uuidSchema("layout ID"),
});

// === Type Exports ===

export type CreateFloorLayoutInput = z.infer<typeof createFloorLayoutSchema>;
export type FloorLayoutListQuery = z.infer<typeof floorLayoutListQuerySchema>;
export type FloorLayoutVersionQuery = z.infer<
  typeof floorLayoutVersionQuerySchema
>;
export type ActivateFloorLayoutInput = z.infer<
  typeof activateFloorLayoutSchema
>;
