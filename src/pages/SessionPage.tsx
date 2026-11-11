import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Check, ChevronRight, CircleDot, Copy, Layers, ListTree, LoaderCircle, MessageSquareText, Repeat, Wrench, X } from "lucide-react";
import {
  getAgent,
  getExperiment,
  getExperimentRun,
  getReplayForSession,
  getSession,
  listAgentVersions,
  listSessionEvaluations,
  listSessionNodes,
  type SessionDetail,
  type SessionEvaluation,
  type SessionNode,
} from "../api/client";
import { Alert, StatusLabel } from "../design-system/components";
import { caseName } from "../lib/experiments";
import { formatCost, formatDateTime, formatDuration } from "../lib/format";
import { parseRoundName } from "../lib/loops";
import { buildSteps, isPlainObject, oneLine, pretty, replyText, stepSummary, stepTitle, systemPrompt, turnsOf, type Step } from "../lib/sessionNodes";

// One session: what the agent was asked, each step it took, what it returned,
// and how the evaluators scored it. The left column lists the steps; the right
// column shows the whole session, or the step picked on the left.
export function SessionPage() {
  const { sessionId = "" } = useParams();
  const [params, setParams] = useSearchParams();

  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
    refetchInterval: (q) => (q.state.data?.status === "in_progress" ? 3000 : false),
  });
  const s = session.data;
  const live = s?.status === "in_progress";
  const nodes = useQuery({ queryKey: ["session-nodes", sessionId, s?.status], queryFn: () => listSessionNodes(sessionId), refetchInterval: live ? 3000 : false });
  const evals = useQuery({ queryKey: ["session-evaluations", sessionId, s?.status], queryFn: () => listSessionEvaluations(sessionId) });
  const agent = useQuery({ queryKey: ["agent", s?.agent_id], queryFn: () => getAgent(s!.agent_id), enabled: !!s });
  const versions = useQuery({ queryKey: ["versions", s?.agent_id], queryFn: () => listAgentVersions(s!.agent_id), enabled: !!s });

  // A replay knows which recorded session it re-ran and which experiment run asked for it.
  const replay = useQuery({ queryKey: ["session-replay", sessionId], queryFn: () => getReplayForSession(sessionId), enabled: s?.origin === "replay" });
  const baselineId = replay.data?.baseline_session_id;
  const runId = replay.data?.experiment_run_id;
  const baseline = useQuery({ queryKey: ["session", baselineId], queryFn: () => getSession(baselineId!), enabled: !!baselineId });
  const run = useQuery({ queryKey: ["experiment-run", runId], queryFn: () => getExperimentRun(runId!), enabled: !!runId });
  const experiment = useQuery({ queryKey: ["experiment", run.data?.experiment_id], queryFn: () => getExperiment(run.data!.experiment_id), enabled: !!run.data });

  const steps = useMemo(() => buildSteps(nodes.data ?? []), [nodes.data]);
  const selected = steps.find((st) => String(st.index) === params.get("step")) ?? null;
  const select = (index: number | null) => setParams(index ? { step: String(index) } : {}, { replace: true });

  if (session.isError) {
    return (
      <section className="page">
        <Alert variant="destructive" title="Could not load this session">
          {session.error.message}
        </Alert>
      </section>
    );
  }

  const agentId = s?.agent_id ?? "";
  const version = versions.data?.find((v) => v.id === s?.agent_version_id);
  const round = experiment.data ? parseRoundName(experiment.data.name) : null;
  const tokens = s?.tokens ? (s.tokens.input_tokens ?? 0) + (s.tokens.output_tokens ?? 0) : null;
  const name = caseName(s?.name) || caseIdOf(s?.inputs);

  return (
    <div className="agent-page">
      <div className="agent-header session-header">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/agents">Agents</Link>
          <ChevronRight size={14} aria-hidden />
          {agent.data ? <Link to={`/agents/${agentId}/sessions`}>{agent.data.name}</Link> : <span>…</span>}
          <ChevronRight size={14} aria-hidden />
          <span aria-current="page">{s ? `#${s.number}` : "…"}</span>
        </nav>

        <div className="session-title-row">
          <h1 className="agent-name">{s ? `#${s.number}` : " "}</h1>
          {name ? <span className="session-name">{name}</span> : null}
          {s ? <StatusLabel status={statusWord(s.status)} /> : null}
          {s ? <OriginTag origin={s.origin} /> : null}
          {s?.framework ? <span className="version-chip">{s.framework}</span> : null}
          {version ? <span className="version-chip">v{version.display_version ?? version.version}</span> : null}
        </div>

        {replay.data ? (
          <p className="session-context">
            Replay of{" "}
            <Link to={`/sessions/${replay.data.baseline_session_id}`} className="inline-link mono">
              {baseline.data ? `#${baseline.data.number}` : "the recorded session"}
            </Link>
            {experiment.data && run.data ? (
              <>
                {" "}
                for{" "}
                <Link to={`/agents/${agentId}/experiments/${experiment.data.id}`} className="inline-link mono">
                  {experiment.data.name}
                </Link>
                , run {run.data.number}
                {round ? (
                  <>
                    {" "}
                    (lap {round.lap} of loop{" "}
                    <Link to={`/agents/${agentId}/loop/${round.slug}`} className="inline-link mono">
                      {round.slug}
                    </Link>
                    )
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        ) : null}

        {s ? (
          <dl className="session-meta">
            <Fact label="Elapsed" value={formatDuration(s.started_at, s.ended_at)} />
            <Fact label="Started" value={formatDateTime(s.started_at) || "—"} />
            <Fact label="Tokens" value={tokens != null ? tokens.toLocaleString() : "—"} title={s.tokens ? inOut(s.tokens) : undefined} />
            <Fact label="Cost" value={formatCost(s.cost)} />
            <Fact label="Model calls" value={String(s.llm_call_count)} />
            <Fact label="Tool calls" value={String(s.tool_call_count)} />
          </dl>
        ) : null}
      </div>

      <div className="agent-body">
        {s?.error ? (
          <div className="session-error">
            <Alert variant="destructive" title="This session failed">
              {s.error}
            </Alert>
          </div>
        ) : null}

        <div className="session-layout">
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Steps</div>
                <div className="panel-sub">In the order the agent took them. Pick one to see what went in and what came out.</div>
              </div>
            </div>
            {s ? <TimeBar steps={steps} start={s.started_at} end={s.ended_at} selected={selected?.index ?? null} onSelect={select} /> : null}
            {nodes.isPending ? (
              <div className="skeleton-block" />
            ) : nodes.isError ? (
              <Alert variant="destructive" title="Could not load the steps">
                {nodes.error.message}
              </Alert>
            ) : (
              <ol className="node-list">
                <li>
                  <button type="button" className={selected ? "node-row" : "node-row active"} aria-current={selected ? undefined : "true"} onClick={() => select(null)}>
                    <span className="node-index" />
                    <span className="node-icon">
                      <ListTree size={15} aria-hidden />
                    </span>
                    <span className="node-main">
                      <span className="node-title">Whole session</span>
                      <span className="node-summary">What was asked, what came back, and the verdicts</span>
                    </span>
                  </button>
                </li>
                {steps.map((st) => (
                  <li key={st.node.id} style={{ paddingLeft: st.depth * 28 }}>
                    <StepRow step={st} active={selected?.index === st.index} onSelect={() => select(st.index)} />
                  </li>
                ))}
                {steps.length === 0 ? <li className="muted node-empty">{live ? "Waiting for the first step." : "No steps were recorded for this session."}</li> : null}
              </ol>
            )}
          </div>

          <div className="panel detail-panel">
            {selected ? <StepDetail key={selected.node.id} step={selected} steps={steps} onSelect={select} /> : s ? <Overview session={s} evaluations={evals.data ?? []} evaluationsLoading={evals.isPending} /> : <div className="skeleton-block" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// The demo agent passes a case id in its inputs. Show it when the session has no name.
function caseIdOf(inputs: unknown): string {
  return isPlainObject(inputs) && typeof inputs.case_id === "string" ? inputs.case_id : "";
}

const inOut = (t: { input_tokens?: number | null; output_tokens?: number | null }) => `${(t.input_tokens ?? 0).toLocaleString()} in, ${(t.output_tokens ?? 0).toLocaleString()} out`;

function statusWord(status: SessionDetail["status"] | SessionNode["status"]) {
  if (status === "in_progress") return "Running";
  if (status === "failed") return "Failed";
  return "Completed";
}

function OriginTag({ origin }: { origin: SessionDetail["origin"] }) {
  const Icon = origin === "replay" ? Repeat : CircleDot;
  return (
    <span className="origin-tag">
      <Icon size={12} aria-hidden />
      {origin === "replay" ? "Replay" : origin === "recorded" ? "Recorded" : "Imported"}
    </span>
  );
}

function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Where the time went: one block per top-level step, placed by when it ran.
function TimeBar({ steps, start, end, selected, onSelect }: { steps: Step[]; start?: string | null; end?: string | null; selected: number | null; onSelect: (index: number) => void }) {
  const t0 = start ? Date.parse(start) : NaN;
  const t1 = end ? Date.parse(end) : NaN;
  const top = steps.filter((st) => st.depth === 0 && st.node.started_at && st.node.ended_at);
  if (!(t1 > t0) || top.length === 0) return null;
  return (
    <div className="time-bar" aria-hidden>
      {top.map((st) => {
        const a = Date.parse(st.node.started_at!);
        const b = Date.parse(st.node.ended_at!);
        const left = Math.max(0, ((a - t0) / (t1 - t0)) * 100);
        const width = Math.max(0.6, Math.min(100 - left, ((b - a) / (t1 - t0)) * 100));
        return (
          <button
            key={st.node.id}
            type="button"
            tabIndex={-1}
            className={selected === st.index ? "time-seg active" : "time-seg"}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Step ${st.index}: ${stepTitle(st.node)}, ${formatDuration(st.node.started_at, st.node.ended_at)}`}
            onClick={() => onSelect(st.index)}
          />
        );
      })}
    </div>
  );
}

function StepIcon({ node }: { node: SessionNode }) {
  const Icon = node.node_type === "llm_call" ? MessageSquareText : node.node_type === "tool_call" ? Wrench : node.node_type === "subagent_call" ? Bot : Layers;
  return (
    <span className={`node-icon ${node.node_type === "llm_call" ? "llm" : node.node_type === "tool_call" ? "tool" : ""}`}>
      <Icon size={15} aria-hidden />
    </span>
  );
}

function StepState({ status }: { status: SessionNode["status"] }) {
  if (status === "failed") return <X size={14} className="node-state bad" aria-label="Failed" />;
  if (status === "in_progress") return <LoaderCircle size={14} className="node-state spin" aria-label="Running" />;
  return <Check size={14} className="node-state ok" aria-label="Completed" />;
}

function StepRow({ step, active, onSelect }: { step: Step; active: boolean; onSelect: () => void }) {
  const { node } = step;
  const summary = stepSummary(step);
  return (
    <button type="button" className={active ? "node-row active" : "node-row"} aria-current={active ? "true" : undefined} onClick={onSelect}>
      <span className="node-index">{step.index}</span>
      <StepIcon node={node} />
      <span className="node-main">
        <span className="node-title">
          <span className={node.node_type === "llm_call" ? undefined : "mono"}>{stepTitle(node)}</span>
          {node.model ? <span className="version-chip">{node.model}</span> : null}
        </span>
        {summary ? <span className={node.error ? "node-summary bad" : "node-summary"}>{summary}</span> : null}
      </span>
      <span className="node-time">{node.started_at && node.ended_at ? formatDuration(node.started_at, node.ended_at) : ""}</span>
      <StepState status={node.status} />
    </button>
  );
}

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="detail-section">
      <div className="detail-section-head">
        <h3 className="config-label">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button type="button" className="icon-button" aria-label={done ? "Copied" : "Copy"} title={done ? "Copied" : "Copy"} onClick={copy}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

// Text is shown as text, a flat object as a list of fields, and anything
// nested as formatted JSON.
function Payload({ value }: { value: unknown }) {
  if (value == null || value === "") return <p className="muted">Nothing recorded.</p>;
  if (typeof value === "string") {
    const parsed = pretty(value);
    return parsed !== value ? <pre className="code-block">{parsed}</pre> : <div className="payload-text">{value}</div>;
  }
  if (isPlainObject(value) && Object.values(value).every((v) => v == null || typeof v !== "object")) {
    return (
      <dl className="kv">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v == null ? <span className="muted">none</span> : String(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>;
}

function Overview({ session, evaluations, evaluationsLoading }: { session: SessionDetail; evaluations: SessionEvaluation[]; evaluationsLoading: boolean }) {
  const returned = typeof session.outputs === "string" ? session.outputs : session.outputs == null ? "" : JSON.stringify(session.outputs, null, 2);
  return (
    <>
      <div className="detail-head">
        <div className="detail-heading">Whole session</div>
      </div>
      <Section label="Asked">
        <Payload value={session.inputs} />
      </Section>
      <Section label="Returned" aside={returned ? <CopyButton text={returned} /> : undefined}>
        {session.status === "in_progress" && session.outputs == null ? <p className="muted">Still running.</p> : <Payload value={session.outputs} />}
      </Section>
      <Section label="Verdicts">
        {evaluationsLoading ? (
          <span className="skeleton-bar" />
        ) : evaluations.length === 0 ? (
          <p className="muted">No evaluator has scored this session.</p>
        ) : (
          <div className="verdict-list">
            {evaluations.map((e) => (
              <div key={e.id} className="verdict-row">
                <div className="verdict-text">
                  <span className="mono">{e.name}</span>
                  {e.evaluator_name ? (
                    <span className="muted small">
                      {e.evaluator_name}
                      {e.evaluator_version != null ? `@${e.evaluator_version}` : ""}
                    </span>
                  ) : null}
                  {e.explanation ? <p className="verdict-why">{e.explanation}</p> : null}
                </div>
                <VerdictValue e={e} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function VerdictValue({ e }: { e: SessionEvaluation }) {
  if (e.passed != null) return <span className={e.passed ? "verdict verdict-pass" : "verdict verdict-fail"}>{e.passed ? "Pass" : "Fail"}</span>;
  if (typeof e.score === "number") {
    return (
      <span className="mono">
        {Number.isInteger(e.score) ? e.score : e.score.toFixed(2)}
        {e.max_score != null ? ` / ${e.max_score}` : ""}
      </span>
    );
  }
  return <span className="mono">{e.value ?? "—"}</span>;
}

function StepDetail({ step, steps, onSelect }: { step: Step; steps: Step[]; onSelect: (index: number | null) => void }) {
  const { node } = step;
  const [raw, setRaw] = useState(false);
  const isModel = node.node_type === "llm_call";
  const parent = steps.find((st) => st.node.external_id === node.parent_external_id);
  const kind = isModel ? "Model call" : node.node_type === "tool_call" ? "Tool call" : node.node_type === "subagent_call" ? "Subagent call" : "Span";

  return (
    <>
      <div className="detail-head">
        <div className="detail-eyebrow">
          Step {step.index} · {kind}
          {parent ? (
            <>
              {" · made by "}
              <button type="button" className="text-button" onClick={() => onSelect(parent.index)}>
                step {parent.index}
              </button>
            </>
          ) : null}
        </div>
        <div className="detail-heading">
          <span className={isModel ? undefined : "mono"}>{stepTitle(node)}</span>
          {node.model ? <span className="version-chip">{node.model}</span> : null}
          <StatusLabel status={statusWord(node.status)} />
        </div>
        <dl className="detail-facts">
          {node.started_at && node.ended_at ? <Fact label="Took" value={formatDuration(node.started_at, node.ended_at)} /> : null}
          {node.tokens ? <Fact label="Tokens" value={inOut(node.tokens)} /> : null}
          {node.cost != null ? <Fact label="Cost" value={formatCost(node.cost)} /> : null}
        </dl>
      </div>

      {node.error ? (
        <Alert variant="destructive" title="This step failed">
          {node.error}
        </Alert>
      ) : null}

      {isModel ? <ModelBody step={step} steps={steps} onSelect={onSelect} /> : <ToolBody node={node} />}

      <section className="detail-section">
        <button type="button" className="text-button small-link" aria-expanded={raw} onClick={() => setRaw(!raw)}>
          {raw ? "Hide the raw data" : "Show the raw data"}
        </button>
        {raw ? (
          <>
            <div className="config-label">Input</div>
            <pre className="code-block">{JSON.stringify(node.inputs ?? null, null, 2)}</pre>
            <div className="config-label">Output</div>
            <pre className="code-block">{JSON.stringify(node.outputs ?? null, null, 2)}</pre>
          </>
        ) : null}
      </section>
    </>
  );
}

function ModelBody({ step, steps, onSelect }: { step: Step; steps: Step[]; onSelect: (index: number) => void }) {
  const { node } = step;
  const [showPrompt, setShowPrompt] = useState(false);
  const reply = replyText(node);
  const tools = steps.filter((st) => st.node.parent_external_id === node.external_id && st.node.node_type === "tool_call");
  const turns = turnsOf(node.inputs);
  const prompt = systemPrompt(node);
  const params = node.model_params && Object.keys(node.model_params).length ? node.model_params : null;

  return (
    <>
      <Section label="Reply" aside={reply ? <CopyButton text={reply} /> : undefined}>
        {reply ? <div className="payload-text">{reply}</div> : <p className="muted">{tools.length ? "No text. The model asked for a tool instead." : "No text in the output."}</p>}
      </Section>

      {tools.length ? (
        <Section label={tools.length === 1 ? "Tool it called" : "Tools it called"}>
          <div className="called-tools">
            {tools.map((t) => (
              <button key={t.node.id} type="button" className="called-tool" onClick={() => onSelect(t.index)}>
                <span className="node-icon tool">
                  <Wrench size={15} aria-hidden />
                </span>
                <span className="node-main">
                  <span className="node-title mono">{stepTitle(t.node)}</span>
                  <span className="node-summary">{oneLine(t.node.inputs)}</span>
                </span>
                <ChevronRight size={14} aria-hidden />
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {turns ? (
        <Section label={`Sent to the model · ${turns.length} ${turns.length === 1 ? "message" : "messages"}`}>
          <div className="turns">
            {turns.map((t, i) => (
              <div key={i} className={`turn ${t.kind}`}>
                <span className="turn-label">{t.label}</span>
                {t.code ? <pre className="code-block">{t.text}</pre> : <div className="payload-text small-text">{t.text}</div>}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <Section label="Sent to the model">
          <Payload value={node.inputs} />
        </Section>
      )}

      {prompt ? (
        <Section label="System prompt" aside={<CopyButton text={prompt} />}>
          {showPrompt ? <pre className="code-block">{prompt}</pre> : null}
          <button type="button" className="text-button small-link" aria-expanded={showPrompt} onClick={() => setShowPrompt(!showPrompt)}>
            {showPrompt ? "Hide" : `Show the prompt (${prompt.split("\n").length} lines)`}
          </button>
        </Section>
      ) : null}

      {params ? (
        <Section label="Model settings">
          <Payload value={params} />
        </Section>
      ) : null}
    </>
  );
}

function ToolBody({ node }: { node: SessionNode }) {
  return (
    <>
      <Section label={node.node_type === "tool_call" ? "Arguments" : "Input"}>
        <Payload value={node.inputs} />
      </Section>
      <Section label={node.node_type === "tool_call" ? "Result" : "Output"}>
        <Payload value={node.outputs} />
      </Section>
    </>
  );
}
