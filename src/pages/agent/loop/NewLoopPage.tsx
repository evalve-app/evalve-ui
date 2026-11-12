import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { getAgent, listEvaluators, listExperiments } from "../../../api/client";
import { Button, Checkbox, Input, Switch } from "../../../design-system/components";
import { versionLabel } from "../../../lib/cohorts";
import { LoopModeToggle, useLoopMode } from "../../../lib/loopMode";
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

// The inputs the kitaru-loop skill asks for. Review produces the skill's
// kitaru-loop.json and a short prompt; the coding agent runs the loop.
export function NewLoopPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();

  const agent = useQuery({ queryKey: ["agent", agentId], queryFn: () => getAgent(agentId) });
  const { cohorts, versionLists } = useCohorts(agentId);
  const evaluators = useQuery({ queryKey: ["evaluators"], queryFn: listEvaluators });
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });

  const cohortOptions = useMemo(
    () =>
      (cohorts.data ?? []).flatMap((c, i) =>
        (versionLists[i]?.data ?? []).map((v) => ({ id: v.id, label: `${c.name} · ${versionLabel(v)}`, sessions: v.session_count })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohorts.data, versionLists.map((v) => v.dataUpdatedAt).join(",")],
  );
  const agentEvaluators = (evaluators.data ?? []).filter((e) => !e.agent_id || e.agent_id === agentId);
  const recent = useMemo(() => [...(experiments.data ?? [])].sort((a, b) => b.created.localeCompare(a.created))[0], [experiments.data]);

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [cohortVersionId, setCohortVersionId] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [changes, setChanges] = useState<ChangeField[]>(["system_prompt"]);
  const [models, setModels] = useState("");
  const [raw, setC] = useState<Criteria>(DEFAULT_CRITERIA);
  // MVP is the same skill with the statistics turned off: one run per lap, so
  // mean pass^1 is the plain share of cases that passed.
  const mvp = useLoopMode() === "mvp";
  const c: Criteria = mvp ? { ...raw, trials_per_round: 1, k: 1, screen_first: false, confirmation_round: false, per_case_floor: "allow_one_miss" } : raw;
  const targetPct = Math.round(c.cohort_target_mean_pass_k * 100);
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

  const problems = [
    !slug && "Give the loop a name.",
    taken && `A loop named ${slug} already exists.`,
    !cohortVersionId && "Pick a cohort.",
    chosen.length === 0 && "Pick at least one evaluator.",
    changes.length === 0 && "Pick at least one thing that may change.",
    changes.includes("model") && modelList.length === 0 && "List the models the loop may switch to.",
    c.k > c.trials_per_round && "k can't be more than trials per lap.",
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
  const json = JSON.stringify(config, null, 2);
  const prompt = `/kitaru-loop\nStart the loop "${name.trim()}". Save the config below to a file, run \`loop.py init --from\` on it, then \`loop.py preflight\`. Tell me the worst-case cost and wait for my approval before any run.\n\n${json}`;

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
        <dd>{changes.length ? changes.map((f) => CHANGE_FIELD_LABELS[f]).join(", ") : "—"}</dd>
        <dt>A lap passes when</dt>
        <dd>
          {mvp
            ? `At least ${targetPct}% of cases pass every gate evaluator in one run${c.no_regression ? ", and no case does worse than lap 0" : ""}`
            : `${c.per_case_floor === "strict" ? "No case misses" : "No case misses more than once"} in ${c.trials_per_round} trials, mean pass^${c.k} is at least ${c.cohort_target_mean_pass_k}${c.no_regression ? ", no case does worse than lap 0" : ""}${c.confirmation_round ? `, and it holds again on ${c.trials_per_round} fresh trials` : ""}`}
          .
        </dd>
        <dt>Stops otherwise after</dt>
        <dd>
          {c.max_rounds} laps{c.plateau_patience != null ? `, or ${c.plateau_patience} laps without improvement` : ""}
          {c.budget_usd != null ? `, or $${c.budget_usd}` : ""}
        </dd>
        <dt>Worst case</dt>
        <dd>
          {c.trials_per_round * (c.max_rounds + 1) + (c.confirmation_round ? c.trials_per_round : 0)} runs of the cohort
        </dd>
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
            <h2 className="section-title">Start the loop</h2>
            <ol className="steps">
              <li>Copy the prompt.</li>
              <li>Paste it into Claude Code in the agent's project, with the kitaru-loop skill installed.</li>
              <li>Check the tool policy and evaluator params in the config. They were copied from this agent's latest experiment.</li>
              <li>
                Laps show up under <span className="mono">{slug}</span> in the Loop tab as the skill creates them.
              </li>
            </ol>
            <pre className="code-block prompt-preview">{prompt}</pre>
            <div className="form-actions">
              <Button variant="outline" onClick={() => navigate(`/agents/${agentId}/loop`)}>
                Back to loops
              </Button>
              <Button icon={copied ? Check : Copy} onClick={copy}>
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
            {mvp ? "The simple version: one run per lap, and the loop stops at a pass rate you pick." : "These are the kitaru-loop skill's settings."} Nothing runs until you hand the prompt to your coding agent.
          </p>
        </div>
        <LoopModeToggle />
      </div>

      <div className="form-card">
        <Section title="Basics" hint="A hypothesis names the failure and its suspected cause. If you write one, it's stored on every lap.">
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

        <Section title="Gate evaluators" hint="A case passes only if every evaluator picked here passes.">
          <div className="check-list">
            {agentEvaluators
              .filter((e) => showBuiltIn || !isBuiltIn(e.name) || chosen.includes(e.name))
              .map((e) => (
                <CheckRow key={e.id} checked={chosen.includes(e.name)} onChange={(v) => setPicked(v ? [...chosen, e.name] : chosen.filter((x) => x !== e.name))} label={<span className="mono">{e.name}</span>} help={e.description ?? undefined} />
              ))}
          </div>
          {builtInCount > 0 || showBuiltIn ? (
            <button type="button" className="text-button small-link" onClick={() => setShowBuiltIn(!showBuiltIn)}>
              {showBuiltIn ? "Hide built-in evaluators" : `Show ${builtInCount} built-in Kitaru evaluators`}
            </button>
          ) : null}
        </Section>

        <Section title="What may change" hint="Each lap changes exactly one of these, as an override on the same agent version.">
          <div className="check-list">
            {(Object.keys(CHANGE_FIELD_LABELS) as ChangeField[]).map((f) => (
              <CheckRow key={f} checked={changes.includes(f)} onChange={(v) => setChanges(v ? [...changes, f] : changes.filter((x) => x !== f))} label={CHANGE_FIELD_LABELS[f]} help={CHANGE_HELP[f]} />
            ))}
          </div>
          {changes.includes("model") ? (
            <Field label="Allowed models" help="Comma separated. The loop refuses any model not listed.">
              <Input className="w-md" value={models} onChange={(e) => setModels(e.target.value)} placeholder="gpt-4.1-mini, gpt-4.1" />
            </Field>
          ) : null}
        </Section>

        {mvp ? (
          <Section title="Success" hint="Each lap replays the cohort once. A case passes when every gate evaluator passes.">
            <div className="field-grid">
              <NumberField label="Pass rate target" suffix="% of cases" value={targetPct} min={1} max={100} onChange={(v) => set("cohort_target_mean_pass_k", v / 100)} />
            </div>
            <div className="toggle-list">
              <ToggleRow label="No case may get worse" help="A case that passed in lap 0 and fails now fails the lap, even if the pass rate went up." checked={c.no_regression} onChange={(v) => set("no_regression", v)} />
            </div>
          </Section>
        ) : (
        <Section title="Passing a lap" hint="One run can't tell a case that passes 95% of the time from one that always passes, so every lap replays each case several times.">
          <div className="field-grid">
            <NumberField label="Trials per lap" suffix="runs" value={c.trials_per_round} min={1} max={20} onChange={(v) => set("trials_per_round", v)} />
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
            <ToggleRow label="No regression against lap 0" help="A case that does worse than its baseline fails the lap, even if the average went up." checked={c.no_regression} onChange={(v) => set("no_regression", v)} />
            <ToggleRow label="Confirm on fresh trials" help="Re-run a passing lap and require the gate again, so a lucky lap can't win." checked={c.confirmation_round} onChange={(v) => set("confirmation_round", v)} />
            <ToggleRow label="Screen first" help="Run each new lap once. Any failing case ends the lap before spending the other trials." checked={c.screen_first} onChange={(v) => set("screen_first", v)} />
          </div>
        </Section>
        )}

        <Section title="Stopping" hint={mvp ? "The loop also stops as soon as a lap reaches the target." : "The loop also stops as soon as a lap passes and confirms."}>
          <div className="field-grid">
            <NumberField label="Max laps" suffix="laps" value={c.max_rounds} min={1} max={50} onChange={(v) => set("max_rounds", v)} />
            <NumberField label="Laps without improvement (0 = off)" suffix="laps" value={c.plateau_patience ?? 0} min={0} max={20} onChange={(v) => set("plateau_patience", v === 0 ? null : v)} />
            <NumberField label="Budget (0 = none)" suffix="USD" value={c.budget_usd ?? 0} min={0} max={10000} step={0.5} onChange={(v) => set("budget_usd", v === 0 ? null : v)} />
          </div>
        </Section>
      </div>

      <div className="form-bar">
        <span className="form-bar-text">
          {problems.length > 0 ? (
            problems[0]
          ) : (
            <>
              {mvp ? "1 run" : `${c.trials_per_round} trials`} per lap, up to {c.max_rounds} laps. Worst case <span className="mono">{worstCase}</span> runs of the cohort.
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

function NumberField({ label, suffix, value, min, max, step, onChange }: { label: string; suffix: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="number-field">
      <span className="field-label">{label}</span>
      <span className="number-input">
        <input className="ev-input" type="number" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
        <span className="number-suffix">{suffix}</span>
      </span>
    </label>
  );
}
