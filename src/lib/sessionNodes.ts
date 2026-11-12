import type { SessionNode } from "../api/client";

// Helpers that turn a session's raw nodes into something readable. Payload
// shapes differ by agent framework, so everything here is best effort and
// falls back to showing the JSON.

export type Step = {
  node: SessionNode;
  index: number; // 1-based position in the list
  depth: number; // 0 = top level; a tool call sits under the model call that made it
  children: SessionNode[];
};

// Nodes arrive in start order. This nests each one under its parent and
// numbers them top to bottom.
export function buildSteps(nodes: SessionNode[]): Step[] {
  const known = new Set(nodes.map((n) => n.external_id));
  const kids = new Map<string, SessionNode[]>();
  const roots: SessionNode[] = [];
  for (const n of nodes) {
    const parent = n.parent_external_id;
    if (parent && known.has(parent)) kids.set(parent, [...(kids.get(parent) ?? []), n]);
    else roots.push(n);
  }
  // A single wrapping span (the adapter's "run") is the session itself, so its
  // children become the top level.
  const wrapper = roots.length === 1 && roots[0].node_type === "span" ? kids.get(roots[0].external_id) : undefined;
  const steps: Step[] = [];
  const walk = (list: SessionNode[], depth: number) => {
    for (const node of list) {
      const children = kids.get(node.external_id) ?? [];
      steps.push({ node, index: steps.length + 1, depth, children });
      walk(children, depth + 1);
    }
  };
  walk(wrapper?.length ? wrapper : roots, 0);
  return steps;
}

// RFC 6901 JSON Pointer ("/items/0/content"), which Kitaru uses to say where
// the display text lives inside a payload.
export function pointer(value: unknown, path: string | null | undefined): unknown {
  if (!path) return undefined;
  let cur: unknown = value;
  for (const raw of path.split("/").slice(1)) {
    if (cur == null || typeof cur !== "object") return undefined;
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Plain text out of a model payload: a string, a message with content parts,
// or a list of those. Null when there is no text (for example a bare tool call).
export function textOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(textOf).filter((p): p is string => !!p);
    return parts.length ? parts.join("\n\n") : null;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim() || null;
    if ("content" in o) return textOf(o.content);
  }
  return null;
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// Tool arguments and results are often JSON inside a string. Show them parsed.
export function pretty(value: unknown): string {
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

// One line for a list row: `item: "T-shirt", size: "M"` or the text itself.
export function oneLine(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (isPlainObject(value)) return Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
  return JSON.stringify(value);
}

export function stepTitle(node: SessionNode): string {
  if (node.node_type === "llm_call") return "Model call";
  if (node.node_type === "tool_call") return node.tool_name ?? node.name;
  if (node.node_type === "subagent_call") return node.subagent_id ?? node.name;
  return node.name;
}

// The model's text reply for this step, if it wrote one.
export function replyText(node: SessionNode): string | null {
  return textOf(pointer(node.outputs, node.output_text_selector)) ?? textOf(node.outputs);
}

export function stepSummary(step: Step): string {
  const { node } = step;
  if (node.error) return node.error;
  if (node.node_type === "llm_call") {
    const tools = step.children.filter((c) => c.node_type === "tool_call").map((c) => c.tool_name ?? c.name);
    if (tools.length) return `Calls ${tools.join(", ")}`;
    return oneLine(replyText(node));
  }
  return oneLine(node.outputs);
}

export function systemPrompt(node: SessionNode): string | null {
  const selected = pointer(node.inputs, node.system_prompt_selector);
  if (typeof selected === "string") return selected;
  if (isPlainObject(node.inputs)) {
    const o = node.inputs;
    if (typeof o.system_prompt === "string") return o.system_prompt;
    if (typeof o.instructions === "string") return o.instructions;
  }
  return null;
}

// The agent's own settings, as one recorded session used them: the system
// prompt of the first LLM step that has one, and the model and parameters of
// the first LLM step. A value is null when the session does not give it.
export function agentOwnSettings(nodes: SessionNode[]): { prompt: string | null; model: string | null; modelParams: Record<string, unknown> | null } {
  const llmSteps = nodes.filter((n) => n.node_type === "llm_call");
  const first = llmSteps[0];
  return {
    prompt: llmSteps.map(systemPrompt).find((p) => !!p) ?? null,
    model: first?.model ?? first?.requested_model ?? null,
    modelParams: first?.model_params ?? null,
  };
}

// What was sent to the model, as a readable back-and-forth.
export type Turn = { label: string; kind: "user" | "assistant" | "system" | "tool"; text: string; code: boolean };

export function turnsOf(inputs: unknown): Turn[] | null {
  const list = Array.isArray(inputs) ? inputs : isPlainObject(inputs) && Array.isArray(inputs.items) ? inputs.items : isPlainObject(inputs) && Array.isArray(inputs.messages) ? inputs.messages : null;
  if (!list) return null;
  return list.map((item: unknown): Turn => {
    const o = isPlainObject(item) ? item : {};
    if (o.type === "function_call") return { label: `Called ${typeof o.name === "string" ? o.name : "a tool"}`, kind: "tool", text: pretty(o.arguments), code: true };
    if (o.type === "function_call_output" || o.role === "tool") return { label: "Tool result", kind: "tool", text: pretty(o.output ?? o.content), code: true };
    const text = textOf(item);
    const kind = o.role === "user" ? "user" : o.role === "assistant" ? "assistant" : o.role === "system" || o.role === "developer" ? "system" : "assistant";
    const label = kind === "user" ? "User" : kind === "system" ? "System" : "Assistant";
    return text ? { label, kind, text, code: false } : { label, kind, text: pretty(item), code: true };
  });
}
