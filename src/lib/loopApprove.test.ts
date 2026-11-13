import { describe, expect, it } from "vitest";
import { approveButtons, nextApproveState } from "./loopApprove";

const ok = { hasProblem: false };
const problem = { hasProblem: true };

describe("nextApproveState", () => {
  it("locks the setup when the person approves a setup with no problem", () => {
    expect(nextApproveState("edit", "approve", ok)).toBe("approved");
  });

  it("does not approve a setup that has a problem", () => {
    expect(nextApproveState("edit", "approve", problem)).toBe("edit");
  });

  it("unlocks the setup when the person cancels after Approve", () => {
    expect(nextApproveState("approved", "cancel", ok)).toBe("edit");
  });

  it("shows the handoff prompt only after Approve", () => {
    expect(nextApproveState("edit", "getPrompt", ok)).toBe("edit");
    expect(nextApproveState("approved", "getPrompt", ok)).toBe("prompt");
  });

  it("unlocks the setup and removes the handoff prompt when the person cancels before the copy", () => {
    expect(nextApproveState("prompt", "cancel", ok)).toBe("edit");
  });

  it("waits for the coding agent after the person copies the handoff prompt", () => {
    expect(nextApproveState("approved", "copyPrompt", ok)).toBe("approved");
    expect(nextApproveState("prompt", "copyPrompt", ok)).toBe("copied");
  });

  it("stays in the copied state for each button", () => {
    for (const action of ["approve", "cancel", "getPrompt", "copyPrompt"] as const) expect(nextApproveState("copied", action, ok)).toBe("copied");
  });
});

describe("approveButtons", () => {
  it("has only Approve active while the person edits a setup with no problem", () => {
    expect(approveButtons("edit", ok)).toEqual({ approve: true, cancel: false, getPrompt: false, copyPrompt: false });
  });

  it("has no active button while the setup has a problem", () => {
    expect(approveButtons("edit", problem)).toEqual({ approve: false, cancel: false, getPrompt: false, copyPrompt: false });
  });

  it("has Cancel and Get prompt active after Approve", () => {
    expect(approveButtons("approved", ok)).toEqual({ approve: false, cancel: true, getPrompt: true, copyPrompt: false });
  });

  it("has Cancel and Copy prompt active while the handoff prompt shows", () => {
    expect(approveButtons("prompt", ok)).toEqual({ approve: false, cancel: true, getPrompt: false, copyPrompt: true });
  });

  it("has no active button after the copy", () => {
    expect(approveButtons("copied", ok)).toEqual({ approve: false, cancel: false, getPrompt: false, copyPrompt: false });
  });
});
