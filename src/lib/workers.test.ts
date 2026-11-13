import { describe, expect, it } from "vitest";
import { claimsLabel, sortWorkerRows, workerRows, type WorkerInput } from "./workers";

const worker = (name: string, over: Partial<WorkerInput> = {}): WorkerInput => ({
  id: name,
  name,
  live: true,
  last_seen_at: "2026-11-12T10:00:00Z",
  scope: { claims: [{ kind: "agent" }] },
  runtime: { platform: "local" },
  ...over,
});

describe("workerRows", () => {
  it("says Live for a live worker and Offline for the rest", () => {
    const [live, offline] = workerRows([worker("a"), worker("b", { live: false })]);
    expect(live.status).toBe("Live");
    expect(offline.status).toBe("Offline");
  });

  it("has no platform when the worker reports an empty one", () => {
    const [row] = workerRows([worker("a", { runtime: { platform: "" } })]);
    expect(row.platform).toBeNull();
  });
});

describe("claimsLabel", () => {
  it("lists each kind once, with a capital first letter", () => {
    expect(claimsLabel(["agent", "evaluator", "agent"])).toBe("Agent, evaluator");
  });

  it("writes underscores as spaces", () => {
    expect(claimsLabel(["session_run"])).toBe("Session run");
  });

  it("is null when the worker claims no kind", () => {
    expect(claimsLabel([])).toBeNull();
  });
});

describe("sortWorkerRows", () => {
  const rows = workerRows([
    worker("old", { last_seen_at: "2026-11-10T10:00:00Z", live: false }),
    worker("new", { last_seen_at: "2026-11-12T10:00:00Z" }),
    worker("mid", { last_seen_at: "2026-11-11T10:00:00Z", live: false }),
  ]);
  const names = (r: ReturnType<typeof workerRows>) => r.map((x) => x.name);

  it("sorts by last seen, newest first", () => {
    expect(names(sortWorkerRows(rows, { key: "lastSeen", dir: "desc" }))).toEqual(["new", "mid", "old"]);
  });

  it("puts live workers first when status sorts ascending", () => {
    expect(names(sortWorkerRows(rows, { key: "status", dir: "asc" }))[0]).toBe("new");
  });

  it("sorts by name", () => {
    expect(names(sortWorkerRows(rows, { key: "name", dir: "asc" }))).toEqual(["mid", "new", "old"]);
  });
});
