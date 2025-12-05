/**
 * CasinoService Zod Schema Validation Tests
 *
 * Tests the Zod validation schemas for API request bodies and query parameters.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 4.3
 * @see services/casino/schemas.ts
 */

import {
  createCasinoSchema,
  updateCasinoSettingsSchema,
  createStaffSchema,
  gamingDayQuerySchema,
} from "../schemas";

describe("createCasinoSchema", () => {
  describe("valid inputs", () => {
    it("accepts valid input with all required fields", () => {
      const input = {
        name: "Test Casino",
        location: "Las Vegas, NV",
        address: { street: "123 Main St", city: "Las Vegas" },
        company_id: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Test Casino");
        expect(result.data.location).toBe("Las Vegas, NV");
        expect(result.data.company_id).toBe(
          "550e8400-e29b-41d4-a716-446655440000",
        );
      }
    });

    it("accepts input with only required name field", () => {
      const input = { name: "Minimal Casino" };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Minimal Casino");
        expect(result.data.location).toBeUndefined();
      }
    });

    it("accepts optional fields as null", () => {
      const input = {
        name: "Test Casino",
        location: null,
        address: null,
        company_id: null,
      };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.location).toBeNull();
        expect(result.data.address).toBeNull();
        expect(result.data.company_id).toBeNull();
      }
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty name", () => {
      const input = { name: "" };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("name");
      }
    });

    it("rejects missing name field", () => {
      const input = { location: "Las Vegas" };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects name exceeding max length", () => {
      const input = { name: "A".repeat(256) };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("name");
      }
    });

    it("rejects invalid company_id format", () => {
      const input = {
        name: "Test Casino",
        company_id: "not-a-uuid",
      };

      const result = createCasinoSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("company_id");
      }
    });
  });
});

describe("updateCasinoSettingsSchema", () => {
  describe("valid time formats", () => {
    it("accepts HH:MM format", () => {
      const input = { gaming_day_start_time: "06:00" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaming_day_start_time).toBe("06:00");
      }
    });

    it("accepts HH:MM:SS format", () => {
      const input = { gaming_day_start_time: "06:00:00" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaming_day_start_time).toBe("06:00:00");
      }
    });

    it("accepts midnight time", () => {
      const input = { gaming_day_start_time: "00:00" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("accepts late night time", () => {
      const input = { gaming_day_start_time: "23:59" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("accepts early morning time with seconds", () => {
      const input = { gaming_day_start_time: "04:00:30" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("invalid time formats", () => {
    it("rejects invalid format without colon", () => {
      const input = { gaming_day_start_time: "0600" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("gaming_day_start_time");
        expect(result.error.issues[0].message).toContain("HH:MM");
      }
    });

    it("rejects single-digit hour format", () => {
      const input = { gaming_day_start_time: "6:00" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects invalid 12-hour format with AM/PM", () => {
      const input = { gaming_day_start_time: "06:00 AM" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const input = { gaming_day_start_time: "" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("timezone validation", () => {
    it("accepts valid timezone string", () => {
      const input = { timezone: "America/Los_Angeles" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timezone).toBe("America/Los_Angeles");
      }
    });

    it("accepts other valid timezone formats", () => {
      const inputs = [
        { timezone: "UTC" },
        { timezone: "America/New_York" },
        { timezone: "Europe/London" },
        { timezone: "Asia/Tokyo" },
      ];

      inputs.forEach((input) => {
        const result = updateCasinoSettingsSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("rejects empty timezone", () => {
      const input = { timezone: "" };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects timezone exceeding max length", () => {
      const input = { timezone: "A".repeat(65) };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("threshold validation", () => {
    it("accepts positive watchlist_floor", () => {
      const input = { watchlist_floor: 3000 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.watchlist_floor).toBe(3000);
      }
    });

    it("accepts positive ctr_threshold", () => {
      const input = { ctr_threshold: 10000 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ctr_threshold).toBe(10000);
      }
    });

    it("rejects negative watchlist_floor", () => {
      const input = { watchlist_floor: -100 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("watchlist_floor");
        expect(result.error.issues[0].message).toContain("positive");
      }
    });

    it("rejects negative ctr_threshold", () => {
      const input = { ctr_threshold: -5000 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("ctr_threshold");
        expect(result.error.issues[0].message).toContain("positive");
      }
    });

    it("rejects zero watchlist_floor", () => {
      const input = { watchlist_floor: 0 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects zero ctr_threshold", () => {
      const input = { ctr_threshold: 0 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("accepts decimal threshold values", () => {
      const input = { watchlist_floor: 3000.5, ctr_threshold: 10000.99 };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("partial updates", () => {
    it("accepts empty object (no updates)", () => {
      const input = {};

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("accepts multiple fields at once", () => {
      const input = {
        gaming_day_start_time: "04:00",
        timezone: "America/New_York",
        watchlist_floor: 5000,
        ctr_threshold: 15000,
      };

      const result = updateCasinoSettingsSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaming_day_start_time).toBe("04:00");
        expect(result.data.timezone).toBe("America/New_York");
        expect(result.data.watchlist_floor).toBe(5000);
        expect(result.data.ctr_threshold).toBe(15000);
      }
    });
  });
});

describe("createStaffSchema", () => {
  const validDealerBase = {
    first_name: "John",
    last_name: "Doe",
    role: "dealer" as const,
    casino_id: "550e8400-e29b-41d4-a716-446655440000",
  };

  const validPitBossBase = {
    first_name: "Jane",
    last_name: "Smith",
    role: "pit_boss" as const,
    casino_id: "550e8400-e29b-41d4-a716-446655440000",
    user_id: "660e8400-e29b-41d4-a716-446655440001",
  };

  const validAdminBase = {
    first_name: "Admin",
    last_name: "User",
    role: "admin" as const,
    casino_id: "550e8400-e29b-41d4-a716-446655440000",
    user_id: "770e8400-e29b-41d4-a716-446655440002",
  };

  describe("dealer role", () => {
    it("accepts dealer without user_id", () => {
      const input = { ...validDealerBase };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("dealer");
        expect(result.data.user_id).toBeUndefined();
      }
    });

    it("accepts dealer with explicit null user_id", () => {
      const input = { ...validDealerBase, user_id: null };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("rejects dealer with user_id", () => {
      const input = {
        ...validDealerBase,
        user_id: "660e8400-e29b-41d4-a716-446655440001",
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("user_id");
        expect(result.error.issues[0].message).toContain("Dealer");
      }
    });

    it("accepts dealer with optional employee_id", () => {
      const input = {
        ...validDealerBase,
        employee_id: "EMP-001",
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("accepts dealer with optional email", () => {
      const input = {
        ...validDealerBase,
        email: "john.doe@casino.com",
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("pit_boss role", () => {
    it("accepts pit_boss with user_id", () => {
      const input = { ...validPitBossBase };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("pit_boss");
        expect(result.data.user_id).toBe(
          "660e8400-e29b-41d4-a716-446655440001",
        );
      }
    });

    it("rejects pit_boss without user_id", () => {
      const input = {
        first_name: "Jane",
        last_name: "Smith",
        role: "pit_boss" as const,
        casino_id: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("user_id");
        expect(result.error.issues[0].message).toContain("pit_boss");
      }
    });

    it("rejects pit_boss with null user_id", () => {
      const input = {
        ...validPitBossBase,
        user_id: null,
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("admin role", () => {
    it("accepts admin with user_id", () => {
      const input = { ...validAdminBase };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("admin");
        expect(result.data.user_id).toBe(
          "770e8400-e29b-41d4-a716-446655440002",
        );
      }
    });

    it("rejects admin without user_id", () => {
      const input = {
        first_name: "Admin",
        last_name: "User",
        role: "admin" as const,
        casino_id: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("user_id");
        expect(result.error.issues[0].message).toContain("admin");
      }
    });

    it("rejects admin with null user_id", () => {
      const input = {
        ...validAdminBase,
        user_id: null,
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("common validations", () => {
    it("rejects empty first_name", () => {
      const input = { ...validDealerBase, first_name: "" };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("first_name");
      }
    });

    it("rejects empty last_name", () => {
      const input = { ...validDealerBase, last_name: "" };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("last_name");
      }
    });

    it("rejects invalid email format", () => {
      const input = { ...validDealerBase, email: "not-an-email" };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("email");
      }
    });

    it("rejects invalid casino_id format", () => {
      const input = { ...validDealerBase, casino_id: "not-a-uuid" };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("casino_id");
      }
    });

    it("rejects invalid role", () => {
      const input = { ...validDealerBase, role: "manager" };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects first_name exceeding max length", () => {
      const input = { ...validDealerBase, first_name: "A".repeat(101) };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects last_name exceeding max length", () => {
      const input = { ...validDealerBase, last_name: "B".repeat(101) };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects employee_id exceeding max length", () => {
      const input = {
        ...validDealerBase,
        employee_id: "EMP-" + "X".repeat(50),
      };

      const result = createStaffSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});

describe("gamingDayQuerySchema", () => {
  describe("valid inputs", () => {
    it("accepts valid ISO 8601 timestamp", () => {
      const input = { timestamp: "2025-11-29T14:30:00Z" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBe("2025-11-29T14:30:00Z");
      }
    });

    it("rejects ISO 8601 with timezone offset (requires UTC Z suffix)", () => {
      // Note: z.string().datetime() by default only accepts UTC (Z suffix)
      // Timezone offsets like -08:00 are not accepted
      const input = { timestamp: "2025-11-29T14:30:00-08:00" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("accepts ISO 8601 with milliseconds", () => {
      const input = { timestamp: "2025-11-29T14:30:00.123Z" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("accepts undefined timestamp (defaults to server time)", () => {
      const input = {};

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeUndefined();
      }
    });

    it("accepts explicit undefined timestamp", () => {
      const input = { timestamp: undefined };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects invalid date format", () => {
      const input = { timestamp: "2025-11-29" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("timestamp");
        expect(result.error.issues[0].message).toContain("ISO 8601");
      }
    });

    it("rejects plain date without time", () => {
      const input = { timestamp: "11/29/2025" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects random string", () => {
      const input = { timestamp: "not-a-timestamp" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const input = { timestamp: "" };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects Unix timestamp number", () => {
      const input = { timestamp: 1732892400000 };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects null timestamp", () => {
      const input = { timestamp: null };

      const result = gamingDayQuerySchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});
