import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { api, getAgent, listExperiments } from "../../../api/client";
import { evaluatorsQuery } from "../../../lib/queries";
import { Button, Checkbox, Input, Switch } from "../../../design-system/components";
import { versionLabel } from "../../../lib/cohorts";
import { buildEvalveLoopPrompt } from "../../../lib/evalveLoopHandoff";
import { LoopModeTabs, type LoopMode } from "../../../lib/loopMode";
import { useCohorts } from "../../../lib/useCohorts";
import { CHANGE_FIELD_LABELS, DEFAULT_CRITERIA, groupLoops, slugify, type ChangeField, type Criteria } from "../../../lib/loops";

const CHANGE_HELP: Record<ChangeField, string> = {
  system_prompt: "The instructions the agent runs with. Usually the first thing to try.",
  model: "Swap the model, only to one on the allow-list below.",
  model_params: "Temperature and other sampling settings.",
};

// Drops null values, the way the skill compares stored policies.
function stripNulls(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stripNulls);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)]));
  return x;
}

export function NewLoopPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoopMode>("mvp");
  const mvp = mode === "mvp";

  const agent = useQuery({ queryKey: ["agent", agentId], queryFn: () => getAgent(agentId) });
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const evaluators = useQuery(evaluatorsQuery());
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  const info = useQuery({
    queryKey: ["info"],
    queryFn: async () => (await api.GET("/api/v1/info")).data,
    enabled: mvp,
  });
  const serverUrl = info.data?.server_url;

  const cohortOptions = (cohorts.data ?? []).flatMap((c) =>
    (versionsByCohort[c.id] ?? []).map((v) => ({ id: v.id, label: `${c.name} · ${versionLabel(v)}`, sessions: v.session_count })),
  );
  const agentEvaluators = (evaluators.data ?? []).filter((e) => !e.agent_id || e.agent_id === agentId);
  const recent = useMemo(() => [...(experiments.data ?? [])].sort((a, b) => b.created.localeCompare(a.created))[0], [experiments.data]);

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [cohortVersionId, setCohortVersionId] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [changes, setChanges] = useState<ChangeField[]>(["system_prompt"]);
  const [models, setModels] = useState("");
  const [c, setC] = useState<Criteria>(DEFAULT_CRITERIA);
  const [requiredGreens, setRequiredGreens] = useState(2);
  const [maxAttempts, setMaxAttempts] = useState(10);
  const [budget, setBudget] = useState(5);
  const [review, setReview] = useState(false);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof Criteria>(k: K, v: Criteria[K]) => setC((cur) => ({ ...cur, [k]: v }));

  useEffect(() => {
    if (!cohortVersionId && cohortOptions[0]) setCohortVersionId(cohortOptions[0].id);
  }, [cohortOptions, cohortVersionId]);
  useEffect(() => {
    if (picked === null && experiments.data && evaluators.data) setPicked(recent ? recent.evaluators.map((e) => e.evaluator) : []);
  }, [experiments.data, evaluators.data, picked, recent]);

  const chosen = picked ?? [];
  const isBuiltIn = (n: string) => n.startsWith("kitaru/");
  const builtInCount = agentEvaluators.filter((e) => isBuiltIn(e.name) && !chosen.includes(e.name)).length;
  const slug = slugify(name);
  const taken = !!slug && groupLoops(experiments.data ?? []).has(slug);
  const cohort = cohortOptions.find((o) => o.id === cohortVersionId);
  const modelList = models.split(",").map((m) => m.trim()).filter(Boolean);
  const mvpChanges = changes.filter((field) => field !== "model_params");
  const activeChanges = mvp ? mvpChanges : changes;
  const mvpEvaluators = agentEvaluators.filter((e) => chosen.includes(e.name)).map((e) => ({ ref: `${e.name}@${e.latest_version}` }));

  const problems = [
    !slug && "Give the loop a name.",
    taken && `A loop named ${slug} already exists.`,
    !cohort && "Pick a cohort.",
    (mvp ? mvpEvaluators.length : chosen.length) === 0 && "Pick at least one evaluator.",
    activeChanges.length === 0 && "Pick at least one thing that may change.",
    mvp && (!Number.isSafeInteger(requiredGreens) || !Number.isSafeInteger(maxAttempts) || maxAttempts < requiredGreens) && "Maximum replay attempts must be a whole number at least as large as the required green streak.",
    mvp && (!Number.isFinite(budget) || budget <= 0) && "Enter a positive replay budget.",
    mvp && !serverUrl && (info.isPending ? "Reading the Kitaru server address…" : "Could not read the Kitaru server address."),
    !mvp && changes.includes("model") && modelList.length === 0 && "List the models the loop may switch to.",
    !mvp && c.k > c.trials_per_round && "k can't be more than trials per experiment.",
  ].filter(Boolean) as string[];

  // The skill's config file. Tool policy and evaluator params are copied from
  // this agent's most recent experiment; the reviewer should check them.
  const config = {
    name: name.trim(),
    hypothesis: hypothesis.trim(),
    kitaru: ".venv/bin/kitaru",
    agent_version: agent.data ? `${agent.data.name}@${agent.data.latest_version}` : "",
    cohort_version_id: cohortVersionId,
    allowed_changes: changes,
    allowed_models: modelList,
    tool_policy: stripNulls(recent?.tool_policy ?? { default: { type: "passthrough" }, tools: {} }),
    evaluators: chosen.map((n) => {
      const ev = agentEvaluators.find((e) => e.name === n);
      const prior = recent?.evaluators.find((e) => e.evaluator === n);
      return { ref: `${n}@${prior?.version ?? ev?.latest_version ?? 1}`, kind: "binary", role: "gate", ...(prior?.params && Object.keys(prior.params).length ? { params: prior.params } : {}) };
    }),
    criteria: c,
    evidence_dir: "sessions/kitaru-loop",
    case_id_field: "case_id",
    prompt_dir: "prompts",
  };
  const hostedPrompt = mvp && serverUrl
    ? buildEvalveLoopPrompt(window.location.origin, {
      name: name.trim(),
      ...(hypothesis.trim() ? { hypothesis: hypothesis.trim() } : {}),
      server_url: serverUrl,
      cohort_version_id: cohortVersionId,
      evaluators: mvpEvaluators,
      allowed_changes: mvpChanges,
      required_consecutive_greens: requiredGreens,
      max_attempts: maxAttempts,
      budget_usd: String(budget),
    })
    : "";
  const prompt = mvp ? hostedPrompt : `/kitaru-loop\nStart the loop "${name.trim()}". Save the config below to a file, run \`loop.py init --from\` on it, then \`loop.py preflight\`. Tell me the worst-case cost and wait for my approval before any run.\n\n${JSON.stringify(config, null, 2)}`;

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const summary = (
    <aside className="panel summary-card" aria-label="Loop summary">
      <div className="summary-title">Summary</div>
      <dl className="summary-list">
        <dt>Experiments</dt>
        <dd className="mono">{slug ? `${slug}-round-N` : "—"}</dd>
        <dt>Cohort</dt>
        <dd>{cohort ? `${cohort.label} (${cohort.sessions} cases)` : "—"}</dd>
        <dt>Gate evaluators</dt>
        <dd>{chosen.length ? chosen.join(", ") : "—"}</dd>
        <dt>May change</dt>
        <dd>{activeChanges.length ? activeChanges.map((f) => CHANGE_FIELD_LABELS[f]).join(", ") : "—"}</dd>
        <dt>An experiment passes when</dt>
        <dd>
          {mvp
            ? `Every case passes every selected evaluator in ${requiredGreens} consecutive ${requiredGreens === 1 ? "replay" : "replays"}`
            : `${c.per_case_floor === "strict" ? "No case misses" : "No case misses more than once"} in ${c.trials_per_round} trials, mean pass^${c.k} is at least ${c.cohort_target_mean_pass_k}${c.no_regression ? ", no case does worse than in the control experiment" : ""}${c.confirmation_round ? `, and it holds again on ${c.trials_per_round} fresh trials` : ""}`}
          .
        </dd>
        <dt>Stops otherwise after</dt>
        <dd>
          {mvp ? `${maxAttempts} replay attempts or a $${budget} replay budget` : (
            <>
              {c.max_rounds} experiments after the control{c.plateau_patience != null ? `, or ${c.plateau_patience} experiments without improvement` : ""}
              {c.budget_usd != null ? `, or $${c.budget_usd}` : ""}
            </>
          )}
        </dd>
        {mvp ? null : (
          <>
            <dt>Worst case</dt>
            <dd>{c.trials_per_round * (c.max_rounds + 1) + (c.confirmation_round ? c.trials_per_round : 0)} runs of the cohort</dd>
          </>
        )}
      </dl>
    </aside>
  );

  if (review) {
    return (
      <div className="tab-page">
        <button type="button" className="back-link" onClick={() => setReview(false)}>
          <ArrowLeft size={14} aria-hidden />
          Edit settings
        </button>
        <div className="review-layout">
          <div className="panel review-main">
            <h2 className="section-title">Start the {mvp ? "MVP" : "Post-MVP"} loop</h2>
            <ol className="steps">
              <li>Copy the prompt.</li>
              <li>{mvp ? "Paste it into your coding agent with the agent project open. The coding agent fetches the pinned runner from this deployment." : "Paste it into Claude Code in the agent's project, with the kitaru-loop skill installed."}</li>
              {mvp ? null : <li>Check the tool policy and evaluator params in the config. They were copied from this agent's latest experiment.</li>}
              <li>
                Experiments show up under <span className="mono">{slug}</span> in the Loop tab as the skill creates them.
              </li>
            </ol>
            <pre className="code-block prompt-preview">{prompt}</pre>
            <div className="form-actions">
              <Button variant="outline" onClick={() => navigate(`/agents/${agentId}/loop`)}>
                Back to loops
              </Button>
              <Button icon={copied ? Check : Copy} disabled={!prompt} onClick={copy}>
                {copied ? "Copied" : "Copy prompt"}
              </Button>
            </div>
          </div>
          {summary}
        </div>
      </div>
    );
  }

  const worstCase = c.trials_per_round * (c.max_rounds + 1) + (c.confirmation_round ? c.trials_per_round : 0);

  return (
    <div className="tab-page new-loop">
      <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop`)}>
        <ArrowLeft size={14} aria-hidden />
        Loops
      </button>
      <div className="form-header-row">
        <div className="form-header">
          <h2 className="detail-title sans">New loop</h2>
          <p className="detail-description">
            {mvp ? "Choose how many times every case must pass in a row. Your coding agent runs the loop from the prompt." : "These are the kitaru-loop skill's settings. Nothing runs until you hand the prompt to your coding agent."}
          </p>
        </div>
        <LoopModeTabs mode={mode} onChange={setMode} />
      </div>

      <div className="form-card">
        <Section title="Basics" hint="A hypothesis names the failure and its suspected cause. If you write one, it's stored on every experiment.">
          <Field label="Name">
            <Input className="w-md" value={name} onChange={(e) => setName(e.target.value)} placeholder="Day-30 refunds" invalid={taken} />
          </Field>
          <Field label="Hypothesis (optional)">
            <textarea className="ev-input textarea" rows={3} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="The agent reads the 30-day window as exclusive and declines damaged items delivered exactly 30 days ago. Making the boundary explicit should fix them." />
          </Field>
          <Field label="Cohort" help="The recorded sessions every run replays. It stays fixed for the whole loop.">
            <select className="ev-select native-select w-md" value={cohortVersionId} onChange={(e) => setCohortVersionId(e.target.value)}>
              {cohortOptions.length === 0 ? <option value="">No cohorts yet</option> : null}
              {cohortOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} ({o.sessions} sessions)
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Gate evaluators" hint="Choose evaluators that return pass or fail. A case passes when every selected evaluator passes it.">
          <div className="check-list">
            {agentEvaluators
              .filter((e) => showBuiltIn || !isBuiltIn(e.name) || chosen.includes(e.name))
              .map((e) => (
                <CheckRow key={e.id} checked={chosen.includes(e.name)} onChange={(v) => setPicked(v ? [...chosen, e.name] : chosen.filter((x) => x !== e.name))} label={<span className="mono">{e.name}{mvp ? `@${e.latest_version}` : ""}</span>} help={e.description ?? undefined} />
              ))}
          </div>
          {builtInCount > 0 || showBuiltIn ? (
            <button type="button" className="text-button small-link" onClick={() => setShowBuiltIn(!showBuiltIn)}>
              {showBuiltIn ? "Hide built-in evaluators" : `Show ${builtInCount} built-in Kitaru evaluators`}
            </button>
          ) : null}
        </Section>

        <Section title="What may change" hint="Each experiment changes exactly one of these, as an override on the same agent version.">
          <div className="check-list">
            {(Object.keys(CHANGE_FIELD_LABELS) as ChangeField[]).filter((f) => !mvp || f !== "model_params").map((f) => (
              <CheckRow key={f} checked={changes.includes(f)} onChange={(v) => setChanges(v ? [...changes, f] : changes.filter((x) => x !== f))} label={CHANGE_FIELD_LABELS[f]} help={mvp && f === "model" ? "The coding agent chooses a model the replay worker can access." : CHANGE_HELP[f]} />
            ))}
          </div>
          {!mvp && changes.includes("model") ? (
            <Field label="Allowed models" help="Comma separated. The loop refuses any model not listed.">
              <Input className="w-md" value={models} onChange={(e) => setModels(e.target.value)} placeholder="gpt-4.1-mini, gpt-4.1" />
            </Field>
          ) : null}
        </Section>

        {mvp ? (
          <Section title="Success" hint="Every case must pass in consecutive replays of the same experiment.">
            <div className="field-grid">
              <NumberField label="Consecutive green replays" suffix="replays" value={requiredGreens} min={1} onChange={setRequiredGreens} />
            </div>
          </Section>
        ) : (
        <Section title="Passing an experiment" hint="One run can't tell a case that passes 95% of the time from one that always passes, so every experiment replays each case several times.">
          <div className="field-grid">
            <NumberField label="Trials per experiment" suffix="runs" value={c.trials_per_round} min={1} max={20} onChange={(v) => set("trials_per_round", v)} />
            <NumberField label="Must work in a row (k)" suffix="times" value={c.k} min={1} max={c.trials_per_round} onChange={(v) => set("k", v)} />
            <NumberField label={`Cohort target, mean pass^${c.k}`} suffix="" value={c.cohort_target_mean_pass_k} min={0} max={1} step={0.05} onChange={(v) => set("cohort_target_mean_pass_k", v)} />
          </div>
          <Field label="Per-case floor">
            <select className="ev-select native-select w-md" value={c.per_case_floor} onChange={(e) => set("per_case_floor", e.target.value as Criteria["per_case_floor"])}>
              <option value="allow_one_miss">Allow one miss per case (recommended)</option>
              <option value="strict">Strict: no misses</option>
            </select>
          </Field>
          <div className="toggle-list">
            <ToggleRow label="No regression against the control" help="A case that does worse than in the control experiment fails the experiment, even if the average went up." checked={c.no_regression} onChange={(v) => set("no_regression", v)} />
            <ToggleRow label="Confirm on fresh trials" help="Re-run a passing experiment and require the gate again, so a lucky experiment can't win." checked={c.confirmation_round} onChange={(v) => set("confirmation_round", v)} />
            <ToggleRow label="Screen first" help="Run each new experiment once. Any failing case ends the experiment before spending the other trials." checked={c.screen_first} onChange={(v) => set("screen_first", v)} />
          </div>
        </Section>
        )}

        {mvp ? (
          <Section title="Stopping" hint="The attempt cap includes the runs of the control experiment and retries. The runner checks the budget before each replay.">
            <div className="field-grid">
              <NumberField label="Maximum replay attempts" suffix="replays" value={maxAttempts} min={1} onChange={setMaxAttempts} />
              <NumberField label="Replay budget" suffix="USD" value={budget} min={0} step={0.01} onChange={setBudget} />
            </div>
          </Section>
        ) : (
        <Section title="Stopping" hint="The loop also stops as soon as an experiment passes and confirms.">
          <div className="field-grid">
            <NumberField label="Max experiments after the control" suffix="experiments" value={c.max_rounds} min={1} max={50} onChange={(v) => set("max_rounds", v)} />
            <NumberField label="Experiments without improvement (0 = off)" suffix="experiments" value={c.plateau_patience ?? 0} min={0} max={20} onChange={(v) => set("plateau_patience", v === 0 ? null : v)} />
            <NumberField label="Budget (0 = none)" suffix="USD" value={c.budget_usd ?? 0} min={0} max={10000} step={0.5} onChange={(v) => set("budget_usd", v === 0 ? null : v)} />
          </div>
        </Section>
        )}
      </div>

      <div className="form-bar">
        <span className="form-bar-text">
          {problems.length > 0 ? (
            problems[0]
          ) : mvp ? (
            <>Up to {maxAttempts} replay attempts within a ${budget} budget.</>
          ) : (
            <>
              {c.trials_per_round} trials per experiment, up to {c.max_rounds} experiments after the control. Worst case <span className="mono">{worstCase}</span> runs of the cohort.
            </>
          )}
        </span>
        <div className="form-bar-actions">
          <Button variant="outline" onClick={() => navigate(`/agents/${agentId}/loop`)}>
            Cancel
          </Button>
          <Button disabled={problems.length > 0 || !agent.data} onClick={() => setReview(true)}>
            Review and get prompt
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="form-row">
      <div className="form-row-head">
        <h3 className="section-title">{title}</h3>
        <p className="field-hint">{hint}</p>
      </div>
      <div className="form-row-body">{children}</div>
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      {children}
      {help ? <span className="field-hint">{help}</span> : null}
    </label>
  );
}

function CheckRow({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: string }) {
  return (
    <div className={checked ? "check-row checked" : "check-row"} onClick={() => onChange(!checked)}>
      <Checkbox checked={checked} onCheckedChange={() => {}} />
      <div className="check-text">
        <span className="check-label">{label}</span>
        {help ? <span className="check-help">{help}</span> : null}
      </div>
    </div>
  );
}

function ToggleRow({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row" onClick={() => onChange(!checked)}>
      <div className="check-text">
        <span className="check-label">{label}</span>
        <span className="check-help">{help}</span>
      </div>
      <Switch checked={checked} onCheckedChange={() => {}} aria-label={label} />
    </div>
  );
}

function NumberField({ label, suffix, value, min, max, step, onChange }: { label: string; suffix: string; value: number; min: number; max?: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="number-field">
      <span className="field-label">{label}</span>
      <span className="number-input">
        <input className="ev-input" type="number" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(Math.min(max ?? Infinity, Math.max(min, Number(e.target.value) || min)))} />
        <span className="number-suffix">{suffix}</span>
      </span>
    </label>
  );
}
