// The kitaru-loop skill's stop rule, ported from scripts/loop.py (gate,
// round_score, plateau_check, decide) so the dashboard reaches the same
// verdict as `loop.py next`. Keep the two in step. Not ported: metric
// thresholds and the budget stop, which need data the dashboard doesn't load.
import type { Criteria } from "./loops";

export type CaseStat = { c: number; n: number }; // passes, scored trials
export type Stats = Map<string, CaseStat>; // by case (baseline session id)

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// tau-bench estimator: the chance that k attempts all succeed, from c of n.
export function passHatK(n: number, c: number, k: number): number | null {
  return n >= k ? choose(c, k) / choose(n, k) : null;
}

export function meanPassK(stats: Stats, k: number): number | null {
  const vals = [...stats.values()].map((s) => passHatK(s.n, s.c, k));
  if (vals.length === 0 || vals.some((v) => v == null)) return null;
  return (vals as number[]).reduce((a, b) => a + b, 0) / vals.length;
}

// The MVP score: the plain share of case runs that passed, with no pass^k
// weighting. With one run per lap it equals mean pass^1.
export function passRate(stats: Stats): number | null {
  let c = 0;
  let n = 0;
  for (const s of stats.values()) {
    c += s.c;
    n += s.n;
  }
  return n ? c / n : null;
}

export type Gate = {
  met: boolean;
  incomplete: boolean;
  meanPassK: number | null;
  belowFloor: string[];
  regressed: string[];
  flaky: string[];
  improved: string[];
  belowTarget: boolean;
};

export function gate(c: Criteria, stats: Stats, baseline: Stats | null): Gate {
  const out: Gate = { met: false, incomplete: false, meanPassK: meanPassK(stats, c.k), belowFloor: [], regressed: [], flaky: [], improved: [], belowTarget: false };
  if (stats.size === 0 || [...stats.values()].some((s) => s.n < c.trials_per_round)) {
    out.incomplete = true;
    return out;
  }
  for (const [id, s] of stats) {
    const floor = c.per_case_floor === "strict" ? s.n : s.n - 1;
    if (s.c < floor) out.belowFloor.push(id);
    if (s.c > 0 && s.c < s.n) out.flaky.push(id);
    const b = baseline?.get(id);
    if (b && b.n > 0) {
      if (c.no_regression && s.c / s.n < b.c / b.n) out.regressed.push(id);
      if (s.c / s.n > b.c / b.n) out.improved.push(id);
    }
  }
  out.belowTarget = (out.meanPassK ?? 0) < c.cohort_target_mean_pass_k;
  out.met = out.belowFloor.length === 0 && out.regressed.length === 0 && !out.belowTarget;
  return out;
}

// What the rules need to know about one lap.
export type LapFacts = {
  lap: number;
  hasRuns: boolean;
  screenGreen: boolean | null; // first run: every case passed (null when not screened or not scored yet)
  firstRunPasses: number | null;
  selectionTrials: number;
  confirmationTrials: number;
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

export type Decision =
  | { action: "stop_success"; lap: number; confirmed: boolean }
  | { action: "stop_plateau"; lap: number; bestLap: number; patience: number }
  | { action: "stop_cap"; lap: number }
  | { action: "continue"; lap: number; phase: "trial" | "screen" | "confirmation" }
  | { action: "start"; lap: number };

function plateau(c: Criteria, laps: LapFacts[]) {
  const scored = laps.filter((l) => l.lap >= 1 && l.firstRunPasses != null);
  if (scored.length === 0 || c.plateau_patience == null) return null;
  const score = (l: LapFacts): [number, number] => [l.firstRunPasses!, l.selectionGate && !l.selectionGate.incomplete ? (l.selectionGate.meanPassK ?? -1) : -1];
  const better = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  let best = score(scored[0]);
  let bestLap = scored[0].lap;
  let without = 0;
  for (const l of scored.slice(1)) {
    const s = score(l);
    if (better(s, best)) {
      best = s;
      bestLap = l.lap;
      without = 0;
    } else without += 1;
  }
  return without >= c.plateau_patience ? { bestLap, patience: c.plateau_patience } : null;
}

export function decide(c: Criteria, laps: LapFacts[]): Decision {
  const n = c.trials_per_round;
  const base = laps.find((l) => l.lap === 0);
  if (!base) return { action: "start", lap: 0 };
  if (base.selectionTrials < n) return { action: "continue", lap: 0, phase: "trial" };
  const last = laps[laps.length - 1];
  if (last.lap === 0) return { action: "start", lap: 1 };

  const next = (): Decision => {
    const p = plateau(c, laps);
    if (p) return { action: "stop_plateau", lap: last.lap, ...p };
    if (last.lap + 1 > c.max_rounds) return { action: "stop_cap", lap: last.lap };
    return { action: "start", lap: last.lap + 1 };
  };

  if (!last.hasRuns) return { action: "continue", lap: last.lap, phase: c.screen_first ? "screen" : "trial" };
  if (last.screenGreen === false) return next();
  if (last.selectionTrials < n) return { action: "continue", lap: last.lap, phase: "trial" };
  if (!last.selectionGate?.met) return next();
  if (!c.confirmation_round) return { action: "stop_success", lap: last.lap, confirmed: false };
  if (last.confirmationTrials < n) return { action: "continue", lap: last.lap, phase: "confirmation" };
  if (last.confirmationGate?.met) return { action: "stop_success", lap: last.lap, confirmed: true };
  return next();
}
