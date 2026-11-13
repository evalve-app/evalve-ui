import { describe, expect, it } from "vitest";
import { evaluatorRows, firstEvaluatorSortDir, sortEvaluatorRows, type EvaluatorInput } from "./evaluators";

const evaluator = (name: string, over: Partial<EvaluatorInput> = {}): EvaluatorInput => ({ id: name, name, description: null, latest_version: 1, agent_id: null, updated: "2026-11-01T10:00:00Z", ...over });

describe("evaluatorRows", () => {
  it("sorts the evaluators by name, A to Z", () => {
    const rows = evaluatorRows([evaluator("tone"), evaluator("action-correct"), evaluator("Refund-policy")], {});
    expect(rows.map((r) => r.name)).toEqual(["action-correct", "Refund-policy", "tone"]);
  });

  it("shows the latest version", () => {
    const [row] = evaluatorRows([evaluator("tone", { latest_version: 4 })], {});
    expect(row.versionLabel).toBe("v4");
  });

  it("has no agent for a global evaluator", () => {
    const [row] = evaluatorRows([evaluator("tone")], { a1: "support-desk" });
    expect(row.agentId).toBeNull();
    expect(row.agentName).toBeNull();
  });

  it("names the agent of an evaluator that belongs to one agent", () => {
    const [row] = evaluatorRows([evaluator("tone", { agent_id: "a1" })], { a1: "support-desk" });
    expect(row.agentId).toBe("a1");
    expect(row.agentName).toBe("support-desk");
  });

  it("keeps the agent id when the agent's name is not known", () => {
    const [row] = evaluatorRows([evaluator("tone", { agent_id: "a2" })], { a1: "support-desk" });
    expect(row.agentId).toBe("a2");
    expect(row.agentName).toBeNull();
  });
});

describe("sortEvaluatorRows", () => {
  const rows = evaluatorRows(
    [
      evaluator("tone", { latest_version: 2, updated: "2026-11-10T10:00:00Z", agent_id: "a1" }),
      evaluator("action", { latest_version: 5, updated: "2026-11-12T10:00:00Z" }),
      evaluator("refund", { latest_version: 1, updated: "2026-11-11T10:00:00Z", agent_id: "a2" }),
    ],
    { a1: "support-desk", a2: "billing" },
  );
  const names = (r: typeof rows) => r.map((x) => x.name);

  it("sorts by last change, newest first", () => {
    expect(names(sortEvaluatorRows(rows, { key: "updated", dir: "desc" }))).toEqual(["action", "refund", "tone"]);
  });

  it("sorts by version as a number", () => {
    expect(names(sortEvaluatorRows(rows, { key: "version", dir: "desc" }))).toEqual(["action", "tone", "refund"]);
  });

  it("sorts by agent name, with global evaluators last", () => {
    expect(names(sortEvaluatorRows(rows, { key: "scope", dir: "asc" }))).toEqual(["refund", "tone", "action"]);
  });

  it("starts Updated and Version highest first, the rest A to Z", () => {
    expect(firstEvaluatorSortDir("updated")).toBe("desc");
    expect(firstEvaluatorSortDir("version")).toBe("desc");
    expect(firstEvaluatorSortDir("name")).toBe("asc");
  });
});
