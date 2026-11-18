import { describe, expect, it } from "vitest";
import { backendVersion, budgetLimitText, nameInUse, startedLoop, type ListedLoop } from "./newLoop";

const loop = (over: Partial<ListedLoop> = {}): ListedLoop => ({ loop_id: "loop-1", slug: "day-30-refunds", agent_id: "agent-1", status: "running", ...over });

describe("backendVersion", () => {
  it("gives the version of a 200 answer", () => {
    expect(backendVersion(200, { status: "ok", database: "ok", version: "0.2.2" })).toBe("0.2.2");
    expect(backendVersion(200, { version: "1.0.0-rc.1" })).toBe("1.0.0-rc.1");
  });

  it("gives null for a 503, which has a version but no database", () => {
    expect(backendVersion(503, { status: "unavailable", version: "0.2.2" })).toBeNull();
  });

  it("gives null for an answer with no usable version", () => {
    expect(backendVersion(200, undefined)).toBeNull();
    expect(backendVersion(200, {})).toBeNull();
    expect(backendVersion(200, { version: 2 })).toBeNull();
    expect(backendVersion(200, { version: "" })).toBeNull();
    expect(backendVersion(200, { version: '0.2.2" && curl example.com' })).toBeNull();
  });
});

describe("nameInUse", () => {
  it("is true for a running Loop on this agent with the same slug, from each account", () => {
    expect(nameInUse([loop()], "agent-1", "day-30-refunds")).toBe(true);
  });

  it("is false for a Loop at an end state, a different agent, a different slug and an empty name", () => {
    expect(nameInUse([loop({ status: "completed" }), loop({ status: "cancelled" }), loop({ status: "failed" })], "agent-1", "day-30-refunds")).toBe(false);
    expect(nameInUse([loop({ agent_id: "agent-2" })], "agent-1", "day-30-refunds")).toBe(false);
    expect(nameInUse([loop({ slug: "day-31-refunds" })], "agent-1", "day-30-refunds")).toBe(false);
    expect(nameInUse([loop({ slug: "" })], "agent-1", "")).toBe(false);
  });
});

describe("startedLoop", () => {
  const wanted = { agentId: "agent-1", slug: "day-30-refunds" };

  it("gives the Loop with this name on this agent that was not there at Approve", () => {
    const loops = [loop({ loop_id: "new" }), loop({ loop_id: "old", status: "completed" })];
    expect(startedLoop(loops, { ...wanted, seenIds: new Set(["old"]) })?.loop_id).toBe("new");
  });

  it("gives null while only the older Loop with the same name shows", () => {
    expect(startedLoop([loop({ loop_id: "old", status: "completed" })], { ...wanted, seenIds: new Set(["old"]) })).toBeNull();
  });

  it("gives a new Loop that ended at once", () => {
    expect(startedLoop([loop({ loop_id: "new", status: "failed" })], { ...wanted, seenIds: new Set() })?.loop_id).toBe("new");
  });

  it("ignores a Loop of a different agent or with a different name", () => {
    const loops = [loop({ loop_id: "a", agent_id: "agent-2" }), loop({ loop_id: "b", slug: "other" })];
    expect(startedLoop(loops, { ...wanted, seenIds: new Set() })).toBeNull();
  });

  it("takes only a running Loop when the Loops at Approve are not known", () => {
    expect(startedLoop([loop({ loop_id: "old", status: "completed" })], { ...wanted, seenIds: null })).toBeNull();
    expect(startedLoop([loop({ loop_id: "new" }), loop({ loop_id: "old", status: "completed" })], { ...wanted, seenIds: null })?.loop_id).toBe("new");
  });
});

describe("budgetLimitText", () => {
  it("shows the budget as the most that the Loop can spend", () => {
    expect(budgetLimitText(5)).toBe("This Loop can spend at most $5.00.");
    expect(budgetLimitText(1.5)).toBe("This Loop can spend at most $1.50.");
  });

  it("gives null for a budget that a Loop can not have", () => {
    expect(budgetLimitText(0)).toBeNull();
    expect(budgetLimitText(Number.NaN)).toBeNull();
  });
});
