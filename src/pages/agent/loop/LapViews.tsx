import { useState } from "react";
import { Link } from "react-router";
import { GitCompareArrows } from "lucide-react";
import { Button, Checkbox } from "../../../design-system/components";
import { changedFields } from "../../../lib/experiments";
import { diffLines, withContext } from "../../../lib/diff";
import { formatPercent } from "../../../lib/format";
import { useLoopMode } from "../../../lib/loopMode";
import { passRate, type Gate } from "../../../lib/loopRules";
import { CHANGE_FIELD_LABELS, experimentName, type Criteria } from "../../../lib/loops";
import { CaseCell, type CellState } from "./CaseCell";
import type { CaseInfo, Lap, LoopResults } from "./useLoopResults";

// The lap views of the Post-MVP view of the loop page (the lap grid panel, the
// stat tiles, the trend line) and of the compare page (the lap grid, the
// compare card). Only the compare page shows them in the MVP view.

export const LAP_PAGE = 20;
const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

// The number each lap is judged by, which depends on the MVP / Post-MVP switch.
// Post-MVP: mean pass^k on the lap's selection trials.
// MVP: the plain share of case runs that passed, over every run of the lap.
// Only the compare page shows this number in the MVP view. The sections of the
// loop page in the MVP view do not use it: they take the pass rate of a lap
// from its first completed run (see `src/lib/loopResults.ts`). `view` overrides
// the saved switch: a backend Loop has the MVP view only.
export function useScore(view?: "mvp" | "post") {
  const saved = useLoopMode();
  const mvp = (view ?? saved) === "mvp";
  return {
    mvp,
    of: (l: Lap | null | undefined) => (!l ? null : mvp ? passRate(l.cases) : l.meanPassK),
    show: (v: number | null | undefined) => (v == null ? "—" : mvp ? formatPercent(v) : v.toFixed(2)),
    stats: (l: Lap) => (mvp ? l.cases : l.selection),
  };
}

// The lap grid in its panel, with the compare checkboxes and the control that shows older experiments. Post-MVP view only.
export function LapPanel({ loop, selected, onToggle, onCompare, onShowOlder }: { loop: LoopResults; selected: number[]; onToggle: (lap: number) => void; onCompare: () => void; onShowOlder: () => void }) {
  return (
    <div className="panel lap-panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">Every case, every experiment</div>
          <div className="panel-sub">Each cell is one case across all of that experiment's runs. Tick two or more experiments to compare what changed between them.</div>
        </div>
        <div className="lap-panel-actions">
          <Legend />
          <Button variant="outline" size="sm" icon={GitCompareArrows} disabled={selected.length < 2} onClick={onCompare}>
            {selected.length >= 2 ? `Compare ${selected.length} experiments` : "Compare experiments"}
          </Button>
        </div>
      </div>
      {loop.totalLaps > loop.laps.length ? (
        <button type="button" className="text-button older" onClick={onShowOlder}>
          Show {Math.min(LAP_PAGE, loop.totalLaps - loop.laps.length)} older experiments
        </button>
      ) : null}
      <LapGrid laps={loop.laps} cases={loop.cases} selected={selected} onToggle={onToggle} c={loop.criteria} winnerLap={loop.winnerLap} />
    </div>
  );
}

// The four stat tiles and the trend line, on mean pass^k. Post-MVP view only.
export function LoopStats({ loop }: { loop: LoopResults }) {
  const c = loop.criteria;
  const base = loop.laps.find((l) => l.lap === 0) ?? null;
  const rated = loop.laps.filter((l) => l.meanPassK != null);
  const best = rated.reduce<Lap | null>((m, l) => (m == null || l.meanPassK! > m.meanPassK! ? l : m), null);
  const latest = loop.laps[loop.laps.length - 1];
  const baseStats = base ? [...base.selection.values()] : [];
  const flaky = baseStats.filter((x) => x.c > 0 && x.c < x.n).length;
  const failing = baseStats.filter((x) => x.n > 0 && x.c === 0).length;
  return (
    <>
      <div className="stat-row">
        <Stat label={`Control mean pass^${c?.k ?? "k"}`} value={fmt(base?.meanPassK)} sub={base ? `${flaky} flaky, ${failing} failing` : ""} />
        <Stat label="Highest" value={fmt(best?.meanPassK)} sub={best ? experimentName(best.lap) : ""} />
        <Stat label="Latest" value={fmt(latest?.meanPassK)} sub={latest ? `${experimentName(latest.lap)}${latest.running ? ", running" : ""}` : ""} />
        <Stat label="Experiments run" value={String(Math.max(loop.totalLaps - 1, 0))} sub={c ? `after the control, of ${c.max_rounds} max` : "after the control"} />
      </div>
      {c ? <Trend laps={loop.laps} k={c.k} target={c.cohort_target_mean_pass_k} winnerLap={loop.winnerLap} /> : null}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value-row">
        <span className="stat-value mono">{value}</span>
      </span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}

// Mean pass^k per lap as a line. The axis starts just below the lowest value so
// small moves are visible; the dashed line is the cohort target.
function Trend({ laps, k, target, winnerLap }: { laps: Lap[]; k: number; target: number; winnerLap: number | null }) {
  const values = laps.map((l) => l.meanPassK).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const lowest = Math.min(...values, target);
  const lo = Math.max(0, Math.floor((lowest - 0.05) * 10) / 10);
  const span = 1 - lo || 1;
  const y = (v: number) => ((v - lo) / span) * 100;
  const x = (i: number) => (laps.length === 1 ? 50 : (i / (laps.length - 1)) * 100);
  const pts = laps.map((l, i) => {
    const v = l.meanPassK;
    return v == null ? null : { x: x(i), y: y(v), v, l };
  });
  const line = pts.filter(Boolean).map((p) => `${p!.x},${100 - p!.y}`).join(" ");
  const ticks = [lo, lo + span / 2, 1];

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">{`Mean pass^${k} by experiment`}</div>
          <div className="panel-sub">{`On each experiment's selection trials. Dashed line: the ${target} cohort target.`}</div>
        </div>
      </div>
      <div className="trend" role="img" aria-label={`Mean pass^${k} by experiment: ${laps.map((l) => `${experimentName(l.lap, "inline")} ${fmt(l.meanPassK)}`).join(", ")}`}>
        <div className="trend-axis" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${y(t)}%` }}>
              {t.toFixed(2)}
            </span>
          ))}
        </div>
        <div className="trend-plot">
          {ticks.map((t) => (
            <div key={t} className="trend-grid" style={{ bottom: `${y(t)}%` }} />
          ))}
          <div className="trend-target" style={{ bottom: `${y(target)}%` }} />
          <svg className="trend-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={line} vectorEffect="non-scaling-stroke" />
          </svg>
          {pts.map((p, i) =>
            p ? (
              <div key={laps[i].lap} className={p.l.lap === winnerLap ? "trend-point passed" : p.l.running ? "trend-point running" : "trend-point"} style={{ left: `${p.x}%`, bottom: `${p.y}%` }} title={`${experimentName(p.l.lap)}: ${fmt(p.v)}`}>
                <span className="trend-value mono">{fmt(p.v)}</span>
              </div>
            ) : null,
          )}
          {laps.map((l, i) => (
            <span key={l.lap} className="trend-label" style={{ left: `${x(i)}%` }}>
              {experimentName(l.lap, "short")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// `single`: every lap has one run, so a case either passed or failed.
export function Legend({ single = false }: { single?: boolean }) {
  return (
    <span className="legend">
      <span>
        <span className="cell pass" /> {single ? "Passed" : "Passed every run"}
      </span>
      {single ? null : (
        <span>
          <span className="cell flaky" /> Mixed
        </span>
      )}
      <span>
        <span className="cell fail" /> {single ? "Failed" : "Failed every run"}
      </span>
    </span>
  );
}

function cellState(s: { c: number; n: number } | undefined): CellState {
  if (!s || s.n === 0) return "none";
  if (s.c === s.n) return "pass";
  if (s.c === 0) return "fail";
  return "flaky";
}

const names = (ids: string[], cases: CaseInfo[]) => ids.map((id) => cases.find((c) => c.id === id)?.name ?? id).join(", ");

function gateText(g: Gate | null, cases: CaseInfo[], target: number | undefined): { label: string; tone: string; title: string } {
  if (!g) return { label: "—", tone: "", title: "" };
  if (g.incomplete) return { label: "In progress", tone: "", title: "Not every case has its trials yet" };
  if (g.met) return { label: "Met", tone: "ok", title: "Floor, cohort target and no-regression all hold" };
  const why = [
    g.belowFloor.length ? `below the floor: ${names(g.belowFloor, cases)}` : "",
    g.regressed.length ? `regressed vs the control: ${names(g.regressed, cases)}` : "",
    g.belowTarget ? `mean pass^k ${fmt(g.meanPassK)} is under ${target}` : "",
  ].filter(Boolean);
  return { label: "Not met", tone: "bad", title: why.join("; ") };
}

// The MVP view folds the gate and the confirmation into one plain result.
function simpleResult(l: Lap, c: Criteria | null, cases: CaseInfo[]): { label: string; tone: string; title: string } {
  if (l.lap === 0) return { label: experimentName(0, "short"), tone: "", title: "The control experiment is the starting point. Nothing was changed." };
  if (l.running) return { label: "Running", tone: "", title: "" };
  if (l.screenGreen === false) return { label: "Not passed", tone: "bad", title: "A case failed on the first run, so the experiment ended there" };
  const g = l.selectionGate;
  if (!g || !c) return { label: "—", tone: "", title: "" };
  if (g.incomplete) return { label: "In progress", tone: "", title: "Not every case has a result yet" };
  if (!g.met) {
    const why = [
      g.regressed.length ? `got worse than ${experimentName(0, "inline")}: ${names(g.regressed, cases)}` : "",
      g.belowFloor.length ? `failed too often: ${names(g.belowFloor, cases)}` : "",
      g.belowTarget ? (c.k === 1 ? `pass rate ${formatPercent(g.meanPassK ?? 0)} is under the ${formatPercent(c.cohort_target_mean_pass_k)} target` : "the score is under the target") : "",
    ].filter(Boolean);
    return { label: "Not passed", tone: "bad", title: why.join("; ") };
  }
  if (c.confirmation_round) {
    const cg = l.confirmationGate;
    if (!cg || cg.incomplete) return { label: "In progress", tone: "", title: "Being run again to confirm the result" };
    if (!cg.met) return { label: "Not passed", tone: "bad", title: "It passed once but did not hold up when run again" };
  }
  return { label: "Passed", tone: "ok", title: "This experiment met the target" };
}

export function LapGrid({ laps, cases, selected, onToggle, c, winnerLap, view }: { laps: Lap[]; cases: CaseInfo[]; selected?: number[]; onToggle?: (lap: number) => void; c: Criteria | null; winnerLap: number | null; view?: "mvp" | "post" }) {
  const n = c?.trials_per_round;
  const s = useScore(view);
  return (
    <div className="lap-grid-wrap">
      <table className="lap-grid">
        <thead>
          <tr>
            {onToggle ? <th className="lg-check" aria-label="Compare" /> : null}
            <th className="lg-lap" title="Experiment">Exp</th>
            <th className="lg-change">Change</th>
            <th className="lg-col">{s.mvp ? "Runs" : "Trials"}</th>
            <th className="lg-col num">{s.mvp ? "Pass rate" : `Mean pass^${c?.k ?? "k"}`}</th>
            <th className="lg-col">{s.mvp ? "Result" : "Gate"}</th>
            {s.mvp ? null : <th className="lg-col">Confirmation</th>}
            {cases.map((cs) => (
              <th key={cs.id} className="lg-case" title={cs.name}>
                <span>{cs.name.replace(/^\D+-?/, "") || cs.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...laps].reverse().map((l) => {
            const on = !!selected?.includes(l.lap);
            const g = s.mvp ? simpleResult(l, c, cases) : l.lap === 0 ? { label: experimentName(0, "short"), tone: "", title: "The control experiment is not gated; its misses are the audit" } : l.screenGreen === false ? { label: "Screen red", tone: "bad", title: "The first run had a failing case, so the experiment ended there" } : gateText(l.selectionGate, cases, c?.cohort_target_mean_pass_k);
            const cg = l.confirmationGate;
            const conf = l.lap === 0 || !c?.confirmation_round ? "—" : cg ? (cg.incomplete ? `${l.confirmationTrials}/${n} runs` : cg.met ? "Met" : "Not met") : l.selectionGate?.met ? `0/${n} runs` : "—";
            return (
              <tr key={l.lap} className={on ? "selected" : undefined}>
                {onToggle ? (
                  <td className="lg-check">
                    <Checkbox checked={on} onCheckedChange={() => onToggle(l.lap)} aria-label={`Select ${experimentName(l.lap, "inline")} to compare`} />
                  </td>
                ) : null}
                <td className="lg-lap mono" title={experimentName(l.lap)}>
                  {experimentName(l.lap, "short")}
                  {l.lap === winnerLap ? <span className="winner-mark" title={s.mvp ? "This experiment passed" : "This experiment met the gate and confirmed"}>★</span> : null}
                </td>
                <td className="lg-change" title={l.summary}>
                  <span className="lap-change">{l.summary || <span className="muted">—</span>}</span>
                </td>
                <td className="lg-col mono">{l.running ? <span className="muted">running</span> : s.mvp ? l.runs.length : n ? `${l.selectionTrials}/${n}` : l.runs.length}</td>
                <td className="lg-col num mono">{s.show(s.of(l))}</td>
                <td className={`lg-col gate-${g.tone}`} title={g.title}>
                  {g.label}
                </td>
                {s.mvp ? null : (
                  <td className={`lg-col gate-${conf === "Met" ? "ok" : conf === "Not met" ? "bad" : ""}`} title={cg && !cg.incomplete ? gateText(cg, cases, c?.cohort_target_mean_pass_k).title : ""}>
                    {conf}
                  </td>
                )}
                {cases.map((cs) => {
                  // A case with no scored run has no result.
                  const all = l.cases.get(cs.id)?.n ? l.cases.get(cs.id) : undefined;
                  const sel = l.selection.get(cs.id);
                  const cf = l.confirmation?.get(cs.id);
                  const plain = all ? `${cs.name}, ${experimentName(l.lap, "inline")}: ${all.n === 1 ? (all.c ? "passed" : "failed") : `passed ${all.c} of ${all.n} runs`}` : "";
                  const tip = all && s.mvp ? plain : all ? `${cs.name}, ${experimentName(l.lap, "inline")}: ${sel ? `${sel.c}/${sel.n} ${l.lap === 0 ? "control" : "selection"}` : ""}${cf ? `, ${cf.c}/${cf.n} confirmation` : ""}` : `${cs.name}, ${experimentName(l.lap, "inline")}: no result`;
                  return (
                    <td key={cs.id} className="lg-case">
                      <CaseCell target={l.targets.get(cs.id) ?? { kind: "none", reason: "No result" }} state={cellState(all)} tip={tip} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// One run: "passed" or "failed". Several runs: "4/5".
const word = (x: { c: number; n: number }) => (x.n === 1 ? (x.c ? "passed" : "failed") : `${x.c}/${x.n}`);

export function CompareCard({ a, b, cases, agentId, view }: { a: Lap; b: Lap; cases: CaseInfo[]; agentId: string; view?: "mvp" | "post" }) {
  const s = useScore(view);
  const rows = cases
    .map((cs) => ({ id: cs.id, name: cs.name, before: s.stats(a).get(cs.id), after: s.stats(b).get(cs.id), conf: s.mvp ? undefined : b.confirmation?.get(cs.id) }))
    .filter((r) => r.before?.n && r.after?.n && r.before.c / r.before.n !== r.after.c / r.after.n);
  const improved = rows.filter((r) => r.after!.c / r.after!.n > r.before!.c / r.before!.n);
  const worse = rows.filter((r) => r.after!.c / r.after!.n < r.before!.c / r.before!.n);
  const fa = new Map(changedFields(a.experiment.override).map((f) => [f.key, f.value]));
  const fb = new Map(changedFields(b.experiment.override).map((f) => [f.key, f.value]));
  const keys = [...new Set([...fa.keys(), ...fb.keys()])].filter((k) => JSON.stringify(fa.get(k)) !== JSON.stringify(fb.get(k)));
  const chip = (r: (typeof rows)[number]) => (
    <span key={r.id} className="case-chip mono" title={r.conf ? `Confirmation: ${r.conf.c}/${r.conf.n}` : undefined}>
      {r.name} {word(r.before!)} → {word(r.after!)}
    </span>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">
            {experimentName(a.lap)} → {experimentName(b.lap, "inline")}
          </div>
          <div className="panel-sub">
            <Link to={`/agents/${agentId}/experiments/${a.experiment.id}`} className="inline-link mono">
              {a.experiment.name}
            </Link>{" "}
            vs{" "}
            <Link to={`/agents/${agentId}/experiments/${b.experiment.id}`} className="inline-link mono">
              {b.experiment.name}
            </Link>
            . {s.mvp ? "Each case shows how it did in the first experiment, then the second." : "Counts are passes on each experiment's selection trials."}
          </div>
        </div>
        <span className="rate-pair big">
          <span className="mono">{s.show(s.of(a))}</span>
          <span className="muted">→</span>
          <span className="mono">{s.show(s.of(b))}</span>
        </span>
      </div>

      <div className="change-summary flush">
        <div className="change-group success">
          <span className="change-group-label">
            <span className="ev-dot ev-dot-success" aria-hidden /> Improved <span className="mono">{improved.length}</span>
          </span>
          <span className="change-group-items">{improved.length ? improved.map(chip) : <span className="muted">None</span>}</span>
        </div>
        <div className="change-group destructive">
          <span className="change-group-label">
            <span className="ev-dot ev-dot-destructive" aria-hidden /> Got worse <span className="mono">{worse.length}</span>
          </span>
          <span className="change-group-items">{worse.length ? worse.map(chip) : <span className="muted">None</span>}</span>
        </div>
      </div>

      <div className="config-body">
        {keys.length === 0 ? <p className="muted">Both experiments run with the same settings.</p> : null}
        {keys.map((k) => (
          <div key={k} className="config-block">
            <div className="config-label">{CHANGE_FIELD_LABELS[k as keyof typeof CHANGE_FIELD_LABELS] ?? k}</div>
            {fa.has(k) && fb.has(k) ? (
              <Diff before={toText(fa.get(k))} after={toText(fb.get(k))} />
            ) : (
              <OneSided lap={fa.has(k) ? a.lap : b.lap} other={fa.has(k) ? b.lap : a.lap} text={toText(fa.get(k) ?? fb.get(k))} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// One lap overrides this field and the other runs as recorded. Kitaru doesn't
// store the agent's original prompt, so there's nothing to diff against.
function OneSided({ lap, other, text }: { lap: number; other: number; text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").length;
  return (
    <div className="one-sided">
      <p className="field-hint">
        {experimentName(other)} uses the agent's own setting, which Kitaru doesn't store, so there's no line-by-line diff. {experimentName(lap)} sets it to:
      </p>
      {open || lines <= 6 ? <pre className="code-block">{text}</pre> : null}
      {lines > 6 ? (
        <button type="button" className="text-button" onClick={() => setOpen(!open)}>
          {open ? "Hide" : `Show the value of ${experimentName(lap, "inline")} (${lines} lines)`}
        </button>
      ) : null}
    </div>
  );
}

const toText = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

function Diff({ before, after }: { before: string; after: string }) {
  const lines = withContext(diffLines(before, after));
  return (
    <pre className="code-block diff">
      {lines.map((l, i) =>
        l.kind === "gap" ? (
          <span key={i} className="diff-line gap">
            {`  ⋯ ${l.count} unchanged ${l.count === 1 ? "line" : "lines"}\n`}
          </span>
        ) : (
          <span key={i} className={`diff-line ${l.kind}`}>
            {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
            {l.text}
            {"\n"}
          </span>
        ),
      )}
    </pre>
  );
}
