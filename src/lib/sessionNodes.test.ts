import { describe, expect, it } from "vitest";
import type { SessionNode } from "../api/client";
import { agentOwnSettings } from "./sessionNodes";

const node = (fields: Record<string, unknown>) => ({ node_type: "llm_call", ...fields }) as unknown as SessionNode;

describe("agentOwnSettings", () => {
  it("gives the prompt, the model and the parameters of the first LLM step", () => {
    const nodes = [
      node({ node_type: "span", inputs: { system_prompt: "Not an LLM step." }, model: "span-model" }),
      node({ inputs: { system_prompt: "You are a support agent." }, model: "gpt-4.1-mini", model_params: { temperature: 0.2 } }),
      node({ inputs: { system_prompt: "A later prompt." }, model: "gpt-4.1", model_params: { temperature: 1 } }),
    ];
    expect(agentOwnSettings(nodes)).toEqual({ prompt: "You are a support agent.", model: "gpt-4.1-mini", modelParams: { temperature: 0.2 } });
  });

  it("takes the prompt from the first LLM step that has one, and the model from the first LLM step", () => {
    const nodes = [node({ inputs: {}, model: "gpt-4.1-mini" }), node({ inputs: { instructions: "Be brief." }, model: "gpt-4.1" })];
    expect(agentOwnSettings(nodes)).toEqual({ prompt: "Be brief.", model: "gpt-4.1-mini", modelParams: null });
  });

  it("gives the requested model when the step has no model", () => {
    expect(agentOwnSettings([node({ requested_model: "gpt-5-mini" })]).model).toBe("gpt-5-mini");
  });

  it("gives null for each value that the session does not give", () => {
    expect(agentOwnSettings([node({ node_type: "tool_call" })])).toEqual({ prompt: null, model: null, modelParams: null });
    expect(agentOwnSettings([])).toEqual({ prompt: null, model: null, modelParams: null });
  });
});
