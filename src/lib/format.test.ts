import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

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
