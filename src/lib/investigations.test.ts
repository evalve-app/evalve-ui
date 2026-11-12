import { describe, expect, it } from "vitest";
import { investigationRows, type InvestigationInput } from "./investigations";

const investigation = (name: string, updated: string, over: Partial<InvestigationInput> = {}): InvestigationInput => ({ id: name, name, description: null, status: "pending", total_sessions: 0, completed_sessions: 0, updated, ...over });

describe("investigationRows", () => {
  it("puts the investigation that changed last first", () => {
    const rows = investigationRows([investigation("refunds", "2026-11-01T10:00:00Z"), investigation("late-fees", "2026-11-09T10:00:00Z"), investigation("returns", "2026-11-05T10:00:00Z")]);
    expect(rows.map((r) => r.name)).toEqual(["late-fees", "returns", "refunds"]);
  });

  it("shows how many sessions have a verdict", () => {
    const [row] = investigationRows([investigation("refunds", "2026-11-01T10:00:00Z", { total_sessions: 12, completed_sessions: 3 })]);
    expect(row.reviewed).toBe("3 of 12");
  });

  it("writes the status in words", () => {
    const rows = investigationRows([
      investigation("a", "2026-11-03T10:00:00Z", { status: "pending" }),
      investigation("b", "2026-11-02T10:00:00Z", { status: "in_progress" }),
      investigation("c", "2026-11-01T10:00:00Z", { status: "completed" }),
    ]);
    expect(rows.map((r) => r.statusLabel)).toEqual(["Pending", "In progress", "Completed"]);
  });
});
