import { describe, expect, it } from "vitest";
import { errorSummary, failingTaskLabel, isJobOpen, kindLabel, noErrorsText, sentenceCase, tracebackLines } from "./jobs";

describe("kindLabel", () => {
  it("names the kinds the server sends", () => {
    expect(kindLabel("session_run")).toBe("Session run");
    expect(kindLabel("replay")).toBe("Replay");
  });

  it("falls back to the kind in sentence case", () => {
    expect(kindLabel("bulk_export")).toBe("Bulk export");
  });
});

describe("sentenceCase", () => {
  it("writes underscores as spaces, with a capital first letter", () => {
    expect(sentenceCase("timed_out")).toBe("Timed out");
  });
});

describe("errorSummary", () => {
  it("is the first line that is not blank", () => {
    expect(errorSummary("\nTimeoutError: replay took too long\n  at run()")).toBe("TimeoutError: replay took too long");
  });

  it("is null for a job with no error", () => {
    expect(errorSummary(null)).toBeNull();
    expect(errorSummary("")).toBeNull();
  });
});

describe("tracebackLines", () => {
  const jobError = "ValueError: bad input\nTraceback:\n  File a.py";

  it("uses the job's error, without the summary line", () => {
    expect(tracebackLines(jobError, null)).toEqual(["Traceback:", "  File a.py"]);
  });

  it("uses the failing task's error when there is one", () => {
    expect(tracebackLines(jobError, "ValueError: bad input\n\n  File b.py\n  File c.py")).toEqual(["  File b.py", "  File c.py"]);
  });

  it("keeps a task error's first line when it is not the summary", () => {
    expect(tracebackLines(jobError, "KeyError: id")).toEqual(["KeyError: id"]);
  });

  it("is empty when the error is one line", () => {
    expect(tracebackLines("ValueError: bad input", null)).toEqual([]);
  });
});

describe("noErrorsText", () => {
  it("says the status and that there are no errors", () => {
    expect(noErrorsText("completed")).toBe("Completed. No errors.");
  });
});

describe("failingTaskLabel", () => {
  const agents = (id: string) => ({ a1: "support-desk" })[id];
  const workers = (id: string) => ({ w1: "laptop-1" })[id];

  it("names the kind, the agent and the worker", () => {
    expect(failingTaskLabel({ kind: "agent", agent_id: "a1", worker_id: "w1" }, agents, workers)).toBe("Agent task · support-desk · worker laptop-1");
  });

  it("shows a worker's short id when its name is not known", () => {
    expect(failingTaskLabel({ kind: "evaluator", worker_id: "0000-1111-22223333" }, agents, workers)).toBe("Evaluator task · worker 22223333");
  });

  it("leaves out an agent whose name is not known", () => {
    expect(failingTaskLabel({ kind: "agent", agent_id: "a9" }, agents, workers)).toBe("Agent task");
  });
});

describe("isJobOpen", () => {
  it("opens only the first row until the person opens or closes one", () => {
    expect(isJobOpen({}, "j1", 0)).toBe(true);
    expect(isJobOpen({}, "j2", 1)).toBe(false);
  });

  it("follows what the person chose", () => {
    expect(isJobOpen({ j1: false, j2: true }, "j1", 0)).toBe(false);
    expect(isJobOpen({ j1: false, j2: true }, "j2", 1)).toBe(true);
  });
});
