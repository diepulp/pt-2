/**
 * Tests for React Query client configuration
 */

import { QueryClient } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";

describe("queryClient", () => {
  it("should be an instance of QueryClient", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });

  it("should have correct default query options", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 5); // 5 minutes
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(1);
  });

  it("should have correct default mutation options", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.mutations?.retry).toBe(0);
  });

  it("should be a singleton instance", () => {
    // Import again to verify same instance
    const { queryClient: queryClient2 } = require("@/lib/query-client");

    expect(queryClient).toBe(queryClient2);
  });
});
