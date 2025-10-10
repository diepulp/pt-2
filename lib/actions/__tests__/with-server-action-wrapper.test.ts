/**
 * Tests for withServerAction wrapper
 * Testing error mapping, audit logging, and integration with services
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import type { ServiceResult } from "@/services/shared/types";

import { withServerAction } from "../with-server-action-wrapper";

describe("withServerAction", () => {
  let mockSupabase: SupabaseClient<Database>;

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as SupabaseClient<Database>;

    // Reset NODE_ENV
    process.env.NODE_ENV = "test";
  });

  it("should return successful result from service", async () => {
    const mockAction = async (): Promise<ServiceResult<{ id: string; name: string }>> => ({
      data: { id: "123", name: "Test Casino" },
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: "req-123",
    });

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "123", name: "Test Casino" });
    expect(result.error).toBeNull();
  });

  it("should return error result from service", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => ({
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Casino not found",
      },
      success: false,
      status: 404,
      timestamp: new Date().toISOString(),
      requestId: "req-456",
    });

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.status).toBe(404);
  });

  it("should map PostgreSQL foreign key violation error", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "23503", message: "FK violation" };
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
    expect(result.error?.message).toContain("Invalid reference");
    expect(result.status).toBe(400);
  });

  it("should map PostgreSQL unique constraint violation error", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "23505", message: "Unique violation" };
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("UNIQUE_VIOLATION");
    expect(result.error?.message).toContain("already exists");
    expect(result.status).toBe(409);
  });

  it("should map PostgreSQL check constraint violation error", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "23514", message: "Check constraint violation" };
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("check constraints failed");
    expect(result.status).toBe(400);
  });

  it("should map PostgREST not found error", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "PGRST116", message: "Not found" };
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.error?.message).toBe("Record not found");
    expect(result.status).toBe(404);
  });

  it("should map not null violation error", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "23502", message: "Not null violation" };
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(result.error?.message).toContain("Required field is missing");
    expect(result.status).toBe(400);
  });

  it("should handle unknown errors", async () => {
    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw new Error("Unknown error");
    };

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "test_action",
      userId: "user-123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(result.error?.message).toBe("Unknown error");
    expect(result.status).toBe(500);
  });

  it("should write audit log in production for successful action", async () => {
    process.env.NODE_ENV = "production";

    const insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: insertMock,
      }),
    } as unknown as SupabaseClient<Database>;

    const mockAction = async (): Promise<ServiceResult<{ id: string }>> => ({
      data: { id: "123" },
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: "req-123",
    });

    await withServerAction(mockAction, mockSupabase, {
      action: "create_casino",
      userId: "user-123",
      entity: "casino",
      entityId: "123",
      metadata: { name: "Test Casino" },
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("AuditLog");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        action: "create_casino",
        entity: "casino",
        entityId: "123",
        details: expect.objectContaining({
          success: true,
          status: 200,
          metadata: { name: "Test Casino" },
        }),
      }),
    );
  });

  it("should write audit log in production for failed action", async () => {
    process.env.NODE_ENV = "production";

    const insertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: insertMock,
      }),
    } as unknown as SupabaseClient<Database>;

    const mockAction = async (): Promise<ServiceResult<unknown>> => {
      throw { code: "23503", message: "FK violation" };
    };

    await withServerAction(mockAction, mockSupabase, {
      action: "create_casino",
      userId: "user-123",
      entity: "casino",
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("AuditLog");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        action: "create_casino",
        entity: "casino",
        details: expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "FOREIGN_KEY_VIOLATION",
          }),
        }),
      }),
    );
  });

  it("should not write audit log in non-production environment", async () => {
    process.env.NODE_ENV = "test";

    const insertMock = jest.fn();
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: insertMock,
      }),
    } as unknown as SupabaseClient<Database>;

    const mockAction = async (): Promise<ServiceResult<{ id: string }>> => ({
      data: { id: "123" },
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: "req-123",
    });

    await withServerAction(mockAction, mockSupabase, {
      action: "create_casino",
      userId: "user-123",
    });

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("should not write audit log for anonymous actions", async () => {
    process.env.NODE_ENV = "production";

    const insertMock = jest.fn();
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: insertMock,
      }),
    } as unknown as SupabaseClient<Database>;

    const mockAction = async (): Promise<ServiceResult<{ id: string }>> => ({
      data: { id: "123" },
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: "req-123",
    });

    await withServerAction(mockAction, mockSupabase, {
      action: "create_casino",
      // No userId provided
    });

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("should not fail if audit log write fails", async () => {
    process.env.NODE_ENV = "production";

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const insertMock = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("Audit log failed"),
    });
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        insert: insertMock,
      }),
    } as unknown as SupabaseClient<Database>;

    const mockAction = async (): Promise<ServiceResult<{ id: string }>> => ({
      data: { id: "123" },
      error: null,
      success: true,
      status: 200,
      timestamp: new Date().toISOString(),
      requestId: "req-123",
    });

    const result = await withServerAction(mockAction, mockSupabase, {
      action: "create_casino",
      userId: "user-123",
    });

    // Action should still succeed even if audit log fails
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "123" });

    consoleErrorSpy.mockRestore();
  });
});
