import { describe, expect, it } from "vitest";
import { formatDuration, formatLongDuration } from "./format";

describe("formatDuration", () => {
  it("gives minutes and seconds for a duration of less than one hour", () => {
    expect(formatDuration("2026-01-01T10:00:00Z", "2026-01-01T10:12:05Z")).toBe("12m 5s");
  });

  it("gives hours and minutes for a duration of one hour or more", () => {
    expect(formatDuration("2026-01-01T10:00:00Z", "2026-01-01T11:12:40Z")).toBe("1h 12m");
    expect(formatDuration("2026-01-01T10:00:00Z", "2026-01-02T13:00:00Z")).toBe("27h 0m");
  });

  it("gives a dash with no start or no end", () => {
    expect(formatDuration(null, "2026-01-01T10:00:00Z")).toBe("—");
    expect(formatDuration("2026-01-01T10:00:00Z", undefined)).toBe("—");
  });
});

describe("formatLongDuration", () => {
  it("gives whole minutes for a duration of less than one hour", () => {
    expect(formatLongDuration("2026-01-01T10:00:00Z", "2026-01-01T10:12:05Z")).toBe("12 min");
    expect(formatLongDuration("2026-01-01T10:00:00Z", "2026-01-01T10:59:40Z")).toBe("59 min");
  });

  it("gives hours and minutes for a duration of one hour or more", () => {
    expect(formatLongDuration("2026-01-01T10:00:00Z", "2026-01-01T11:12:40Z")).toBe("1 h 12 min");
    expect(formatLongDuration("2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z")).toBe("2 h");
  });

  it("says that a duration of less than one minute is less than 1 min", () => {
    expect(formatLongDuration("2026-01-01T10:00:00Z", "2026-01-01T10:00:45Z")).toBe("less than 1 min");
  });

  it("gives a dash with no start or no end", () => {
    expect(formatLongDuration(null, "2026-01-01T10:00:00Z")).toBe("—");
  });
});
