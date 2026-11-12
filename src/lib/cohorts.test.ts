import { describe, expect, it } from "vitest";
import { cohortRows, pickCohortVersion, type CohortInput, type CohortVersionInput } from "./cohorts";

const cohort = (id: string, updated: string, over: Partial<CohortInput> = {}): CohortInput => ({ id, name: id, description: null, updated, ...over });
const version = (n: number, sessions: number, display: string | null = null): CohortVersionInput => ({ version: n, display_version: display, session_count: sessions });

describe("cohortRows", () => {
  it("puts the cohort that changed last first", () => {
    const rows = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z"), cohort("late-fees", "2026-11-09T10:00:00Z"), cohort("returns", "2026-11-05T10:00:00Z")], {});
    expect(rows.map((r) => r.name)).toEqual(["late-fees", "returns", "refunds"]);
  });

  it("shows the newest version and its session count", () => {
    const [row] = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z")], { refunds: [version(1, 12), version(3, 20), version(2, 15)] });
    expect(row.versionLabel).toBe("v3 · 3 versions");
    expect(row.sessionCount).toBe(20);
  });

  it("uses the display version when the newest version has one", () => {
    const [row] = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z")], { refunds: [version(1, 12), version(2, 15, "after-refund-fix")] });
    expect(row.versionLabel).toBe("after-refund-fix · 2 versions");
  });

  it("leaves out the version count when the cohort has one version", () => {
    const [row] = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z")], { refunds: [version(1, 12)] });
    expect(row.versionLabel).toBe("v1");
    expect(row.sessionCount).toBe(12);
  });

  it("has no version and no session count until the versions of a cohort load", () => {
    const rows = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z"), cohort("returns", "2026-11-05T10:00:00Z")], { returns: [version(1, 4)] });
    expect(rows).toMatchObject([
      { name: "returns", versionLabel: "v1", sessionCount: 4 },
      { name: "refunds", versionLabel: null, sessionCount: null },
    ]);
  });

  it("has no version and no session count for a cohort with no versions", () => {
    const [row] = cohortRows([cohort("refunds", "2026-11-01T10:00:00Z")], { refunds: [] });
    expect(row).toMatchObject({ versionLabel: null, sessionCount: null });
  });
});

describe("pickCohortVersion", () => {
  const versions = [version(1, 12), version(3, 20), version(2, 15)];

  it("picks the newest version when the URL names no version", () => {
    expect(pickCohortVersion(versions, null)).toMatchObject({ version: 3, session_count: 20 });
  });

  it("picks the version that the URL names", () => {
    expect(pickCohortVersion(versions, "2")).toMatchObject({ version: 2, session_count: 15 });
  });

  it("picks the newest version when the URL names a version that does not exist", () => {
    expect(pickCohortVersion(versions, "7")).toMatchObject({ version: 3 });
    expect(pickCohortVersion(versions, "latest")).toMatchObject({ version: 3 });
  });

  it("picks nothing when the cohort has no versions", () => {
    expect(pickCohortVersion([], "1")).toBeNull();
  });
});
