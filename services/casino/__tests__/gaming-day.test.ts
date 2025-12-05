/**
 * Gaming Day Computation Logic Unit Tests
 *
 * Tests the gaming day computation algorithm in isolation.
 * The algorithm determines the "gaming day" based on a timestamp and gaming day start time.
 *
 * Rules:
 * - If current time >= gaming day start -> return current calendar day
 * - If current time < gaming day start -> return previous calendar day
 *
 * @see SPEC-PRD-000-casino-foundation.md section 8.1
 */

/**
 * Pure function that computes gaming day based on the algorithm.
 * This mirrors the logic in app/actions/casino.ts computeGamingDay()
 * but is extracted for pure unit testing.
 *
 * @param localDate - The date portion of the local time (YYYY-MM-DD)
 * @param localTimeMinutes - Current time in minutes since midnight (0-1439)
 * @param gamingDayStartMinutes - Gaming day start time in minutes since midnight
 * @returns The gaming day as YYYY-MM-DD string
 */
function computeGamingDayPure(
  localDate: string,
  localTimeMinutes: number,
  gamingDayStartMinutes: number,
): string {
  // Parse the date
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  // If before gaming day start, use previous calendar day
  if (localTimeMinutes < gamingDayStartMinutes) {
    date.setDate(date.getDate() - 1);
  }

  // Format as YYYY-MM-DD
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Converts HH:MM or HH:MM:SS time string to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

describe("Gaming Day Computation Logic", () => {
  describe("Basic time boundary tests", () => {
    it("returns current day when time is after gaming day start", () => {
      // 10:00 AM, gaming day starts at 06:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("10:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-11-29");
    });

    it("returns previous day when time is before gaming day start", () => {
      // 05:30 AM, gaming day starts at 06:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("05:30"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("returns current day when time equals gaming day start", () => {
      // 06:00 AM, gaming day starts at 06:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("06:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-11-29");
    });
  });

  describe("Midnight gaming day start", () => {
    it("returns current day when time is after midnight start", () => {
      // 00:01 AM, gaming day starts at 00:00
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("00:01"),
        timeToMinutes("00:00"),
      );
      expect(result).toBe("2025-11-29");
    });

    it("returns current day when time exactly equals midnight start", () => {
      // 00:00, gaming day starts at 00:00
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("00:00"),
        timeToMinutes("00:00"),
      );
      expect(result).toBe("2025-11-29");
    });

    it("handles late evening before midnight start", () => {
      // 23:59, gaming day starts at 00:00 (next day starts at midnight)
      // This means 23:59 is still part of the current day's gaming day
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("23:59"),
        timeToMinutes("00:00"),
      );
      expect(result).toBe("2025-11-29");
    });
  });

  describe("Late night gaming day start (e.g., 4am)", () => {
    it("returns previous day at 2am when gaming day starts at 4am", () => {
      // 02:00 AM, gaming day starts at 04:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("02:00"),
        timeToMinutes("04:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("returns previous day at 3:59am when gaming day starts at 4am", () => {
      // 03:59 AM, gaming day starts at 04:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("03:59"),
        timeToMinutes("04:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("returns current day at 4:00am when gaming day starts at 4am", () => {
      // 04:00 AM, gaming day starts at 04:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("04:00"),
        timeToMinutes("04:00"),
      );
      expect(result).toBe("2025-11-29");
    });

    it("returns current day at 4:01am when gaming day starts at 4am", () => {
      // 04:01 AM, gaming day starts at 04:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("04:01"),
        timeToMinutes("04:00"),
      );
      expect(result).toBe("2025-11-29");
    });
  });

  describe("Early morning gaming day start (e.g., 2am)", () => {
    it("returns previous day at 1:30am when gaming day starts at 2am", () => {
      // 01:30 AM, gaming day starts at 02:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("01:30"),
        timeToMinutes("02:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("returns current day at 2:00am when gaming day starts at 2am", () => {
      // 02:00 AM, gaming day starts at 02:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("02:00"),
        timeToMinutes("02:00"),
      );
      expect(result).toBe("2025-11-29");
    });

    it("returns previous day at midnight when gaming day starts at 2am", () => {
      // 00:00 AM, gaming day starts at 02:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("00:00"),
        timeToMinutes("02:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("returns current day at 11pm when gaming day starts at 2am", () => {
      // 23:00, gaming day starts at 02:00 AM (next day)
      // 11pm is well after 2am, so still current gaming day
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("23:00"),
        timeToMinutes("02:00"),
      );
      expect(result).toBe("2025-11-29");
    });
  });

  describe("Month boundary handling", () => {
    it("handles transition from last day of month to previous day", () => {
      // 05:00 AM on March 1st, gaming day starts at 06:00 AM
      // Should return February 28th (non-leap year)
      const result = computeGamingDayPure(
        "2025-03-01",
        timeToMinutes("05:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-02-28");
    });

    it("handles leap year February 29th", () => {
      // 05:00 AM on March 1st 2024, gaming day starts at 06:00 AM
      // Should return February 29th (leap year)
      const result = computeGamingDayPure(
        "2024-03-01",
        timeToMinutes("05:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2024-02-29");
    });

    it("handles transition to 30-day month", () => {
      // 05:00 AM on May 1st, gaming day starts at 06:00 AM
      // Should return April 30th
      const result = computeGamingDayPure(
        "2025-05-01",
        timeToMinutes("05:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-04-30");
    });

    it("handles transition to 31-day month", () => {
      // 05:00 AM on February 1st, gaming day starts at 06:00 AM
      // Should return January 31st
      const result = computeGamingDayPure(
        "2025-02-01",
        timeToMinutes("05:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-01-31");
    });
  });

  describe("Year boundary handling", () => {
    it("handles transition from January 1st to previous year", () => {
      // 05:00 AM on January 1st 2025, gaming day starts at 06:00 AM
      // Should return December 31st 2024
      const result = computeGamingDayPure(
        "2025-01-01",
        timeToMinutes("05:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2024-12-31");
    });

    it("handles new year at midnight with 2am gaming start", () => {
      // 00:30 AM on January 1st 2025, gaming day starts at 02:00 AM
      // Should return December 31st 2024
      const result = computeGamingDayPure(
        "2025-01-01",
        timeToMinutes("00:30"),
        timeToMinutes("02:00"),
      );
      expect(result).toBe("2024-12-31");
    });

    it("handles new year after gaming day start", () => {
      // 10:00 AM on January 1st 2025, gaming day starts at 06:00 AM
      // Should return January 1st 2025
      const result = computeGamingDayPure(
        "2025-01-01",
        timeToMinutes("10:00"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-01-01");
    });
  });

  describe("timeToMinutes helper", () => {
    it("converts HH:MM format correctly", () => {
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("06:00")).toBe(360);
      expect(timeToMinutes("12:00")).toBe(720);
      expect(timeToMinutes("23:59")).toBe(1439);
    });

    it("converts HH:MM:SS format correctly (ignores seconds)", () => {
      expect(timeToMinutes("06:00:00")).toBe(360);
      expect(timeToMinutes("12:30:45")).toBe(750);
    });
  });

  describe("Edge cases", () => {
    it("handles noon gaming day start", () => {
      // 11:59 AM, gaming day starts at 12:00 PM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("11:59"),
        timeToMinutes("12:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("handles very late gaming day start (23:00)", () => {
      // 22:00 PM, gaming day starts at 23:00
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("22:00"),
        timeToMinutes("23:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("handles 1 minute before gaming day start", () => {
      // 05:59 AM, gaming day starts at 06:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("05:59"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-11-28");
    });

    it("handles 1 minute after gaming day start", () => {
      // 06:01 AM, gaming day starts at 06:00 AM
      const result = computeGamingDayPure(
        "2025-11-29",
        timeToMinutes("06:01"),
        timeToMinutes("06:00"),
      );
      expect(result).toBe("2025-11-29");
    });
  });
});
