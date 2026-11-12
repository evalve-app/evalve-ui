import { describe, expect, it } from "vitest";
import { caseStats, gate } from "./loopRules";
import { DEFAULT_CRITERIA } from "./loops";

describe("caseStats", () => {
  it("counts the passes and the scored runs of each case", () => {
    const runs = [new Map([["s1", true], ["s2", false]]), new Map([["s1", true], ["s2", true]])];
    expect([...caseStats(runs)]).toEqual([["s1", { c: 2, n: 2 }], ["s2", { c: 1, n: 2 }]]);
  });

  it("keeps a case that has no score, with no scored run", () => {
    const runs = [new Map<string, boolean | null>([["s1", true], ["s2", null]])];
    expect([...caseStats(runs)]).toEqual([["s1", { c: 1, n: 1 }], ["s2", { c: 0, n: 0 }]]);
  });
});

describe("gate", () => {
  const c = { ...DEFAULT_CRITERIA, trials_per_round: 1, k: 1 };

  it("is met when each case passed", () => {
    expect(gate(c, caseStats([new Map([["s1", true], ["s2", true]])]), null)).toMatchObject({ met: true, incomplete: false });
  });

  it("is incomplete, and not met, when a case has no score", () => {
    const stats = caseStats([new Map<string, boolean | null>([["s1", true], ["s2", null]])]);
    expect(gate(c, stats, null)).toMatchObject({ met: false, incomplete: true });
  });
});
