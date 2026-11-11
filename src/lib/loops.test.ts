import { describe, expect, it } from "vitest";
import { lapSummary, parseRoundName } from "./loops";

describe("parseRoundName", () => {
  it("reads round and lap names as the lap number", () => {
    expect(parseRoundName("day-30-refunds-round-0")).toEqual({ slug: "day-30-refunds", lap: 0 });
    expect(parseRoundName("day-30-refunds-lap-2")).toEqual({ slug: "day-30-refunds", lap: 2 });
  });

  it("reads iteration names from 1, so iteration 1 is the baseline lap", () => {
    expect(parseRoundName("support-desk-demo-iteration-1")).toEqual({ slug: "support-desk-demo", lap: 0 });
    expect(parseRoundName("support-desk-demo-iteration-2")).toEqual({ slug: "support-desk-demo", lap: 1 });
  });

  it("ignores names that are not part of a loop", () => {
    expect(parseRoundName("support-desk-demo-iteration-0")).toBeNull();
    expect(parseRoundName("refund prompt test")).toBeNull();
  });
});

describe("lapSummary", () => {
  it("drops a leading 'Iteration N:' as it drops 'Round N:'", () => {
    expect(lapSummary("Iteration 2: Tighten the refund policy. Hypothesis: fewer late-fee refunds", 1)).toBe("Tighten the refund policy.");
    expect(lapSummary("Round 2: Use gpt-4.1. Hypothesis: better", 2)).toBe("Use gpt-4.1.");
  });
});
