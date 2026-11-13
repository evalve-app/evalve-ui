import { Fragment, useState, type SyntheticEvent } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { Badge } from "../../../design-system/components";
import { experimentName } from "../../../lib/loops";
import { resultsTable, type ResultsCell, type ResultsRow } from "../../../lib/loopResults";
import { LAP_PAGE } from "./LapViews";
import type { LoopData } from "./useLoop";

// The Results section of the loop page (MVP view): what occurred in each lap.
// A table with one row for each lap and one column for each gating evaluator.
// An open row shows one row for each completed run of the lap, in the same columns.
// The view model (`resultsTable`) makes the rows. This component only lays them out.
export function ResultsSection({ loop, onShowOlder }: { loop: LoopData; onShowOlder: () => void }) {
  const [open, setOpen] = useState<number[]>([]); // the laps whose rows are open; all closed at first
  const table = resultsTable({ laps: loop.laps, cases: loop.cases, criteria: loop.settings?.criteria ?? null, winnerLap: loop.winnerLap, cohortCaseCount: loop.cohortCaseCount, outcome: loop.outcome });
  const toggle = (lap: number) => setOpen((cur) => (cur.includes(lap) ? cur.filter((x) => x !== lap) : [...cur, lap]));
  // With no results in any lap, one column holds the text of each lap.
  const resultColumns = table.evaluators.length || 1;
  const evaluatorCells = (list: (ResultsCell | null)[]) => list.map((cell, i) => <td key={table.evaluators[i]}>{cell ? <EvaluatorCell cell={cell} /> : <span className="muted">—</span>}</td>);

  return (
    <section className="panel" aria-label="Results">
      <div className="panel-head">
        <div>
          <div className="panel-title">Results</div>
          <div className="panel-sub">One row for each experiment, and one column for each gating evaluator. A square in a run row opens the result session of its replay in a new tab.</div>
        </div>
        <span className="rs-state">{table.state}</span>
      </div>
      <div className="rs-legend">
        {table.legend.map((entry) => (
          <span key={entry.state}>
            <span className={`rs-square ${entry.state}`} aria-hidden /> {entry.label}
          </span>
        ))}
        <span>One square is one case.</span>
      </div>
      {loop.totalLaps > loop.laps.length ? (
        <button type="button" className="text-button older" onClick={onShowOlder}>
          Show {Math.min(LAP_PAGE, loop.totalLaps - loop.laps.length)} older experiments
        </button>
      ) : null}
      <div className="results-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th>Experiment</th>
              {table.evaluators.length ? (
                table.evaluators.map((name) => (
                  <th key={name} className="mono" title="Gating evaluator">
                    {name}
                  </th>
                ))
              ) : (
                <th>Replays</th>
              )}
              <th>Pass rate</th>
              <th>Status</th>
              <th>Experiment result</th>
              <th aria-label="Runs of the experiment" />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const hasResults = row.noResults == null;
              const isOpen = hasResults && open.includes(row.lap);
              const runIds = row.runs.map((r) => `results-lap-${row.lap}-run-${r.run}`);
              return (
                <Fragment key={row.lap}>
                  <tr>
                    <td className="rs-experiment">
                      <ExperimentName id={`results-lap-${row.lap}-summary`} name={row.name} summary={row.summary} />
                      {row.winning ? (
                        <span className="winner-mark" role="img" aria-label="Winning experiment" title="Winning experiment">
                          ★
                        </span>
                      ) : null}
                    </td>
                    {hasResults ? (
                      evaluatorCells(row.cells)
                    ) : (
                      <td colSpan={resultColumns} className="muted">
                        {row.noResults}
                      </td>
                    )}
                    <td className="rs-rate">{row.passRate ?? <span className="muted" title={row.incomplete ? `The pass rate needs each completed run: ${row.incomplete}` : undefined}>—</span>}</td>
                    <td>
                      <Badge variant="neutral">{row.status}</Badge>
                    </td>
                    <td>{row.result ? <LapResultBadge result={row.result} /> : hasResults ? <span className="muted">—</span> : null}</td>
                    <td>
                      {hasResults ? (
                        <button type="button" className="text-button rs-toggle" aria-expanded={isOpen} aria-controls={runIds.join(" ")} aria-label={`${isOpen ? "Hide" : "Show"} runs of ${experimentName(row.lap, "inline")}`} onClick={() => toggle(row.lap)}>
                          {isOpen ? "Hide runs" : "Show runs"}
                          <ChevronDown size={14} aria-hidden className={isOpen ? "chev open" : "chev"} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen
                    ? row.runs.map((run, i) => (
                        <tr key={run.run} id={runIds[i]} className="rs-run">
                          <td className="rs-run-name">{run.name}</td>
                          {evaluatorCells(run.cells)}
                          <td className="rs-rate">{run.passRate ?? <span className="muted">—</span>}</td>
                          <td>
                            <Badge variant="neutral">{run.status}</Badge>
                          </td>
                          <td>
                            <LapResultBadge result={run.result} />
                          </td>
                          <td />
                        </tr>
                      ))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rs-footer">
        {table.runsNote} {table.statusNote}
      </p>
    </section>
  );
}

// The name of the experiment, with its summary in a tooltip. The name takes
// focus, so the tooltip opens on hover, on keyboard focus and on a tap. The
// tooltip has a fixed position, so the scroll area of the table does not cut it.
function ExperimentName({ id, name, summary }: { id: string; name: string; summary: string }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  if (!summary) return <span>{name}</span>;
  const show = (e: SyntheticEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setAt({ left: box.left, top: box.bottom + 4 });
  };
  const hide = () => setAt(null);
  return (
    <span className="rs-experiment-name" tabIndex={0} aria-describedby={id} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={(e) => (e.key === "Escape" ? hide() : undefined)}>
      {name}
      <span id={id} role="tooltip" className="ev-tooltip rs-tip" hidden={!at} style={at ?? undefined}>
        {summary}
      </span>
    </span>
  );
}

// One square for each case, then the count. A square with a result session is a link to it.
function EvaluatorCell({ cell }: { cell: ResultsCell }) {
  return (
    <>
      <div className="rs-squares">
        {cell.squares.map((sq) => {
          const cls = `rs-square ${sq.state}`;
          return sq.sessionId ? (
            <Link key={sq.caseId} to={`/sessions/${sq.sessionId}`} target="_blank" rel="noreferrer" className={cls} title={sq.label} aria-label={sq.name} />
          ) : (
            <span key={sq.caseId} className={cls} role="img" title={sq.name} aria-label={sq.name} />
          );
        })}
      </div>
      <div className={`rs-count ${cell.tone}`}>{cell.count}</div>
    </>
  );
}

function LapResultBadge({ result }: { result: NonNullable<ResultsRow["result"]> }) {
  return (
    <span title={result.title || undefined}>
      <Badge variant={result.tone} dot={result.tone !== "neutral"}>
        {result.label}
      </Badge>
    </span>
  );
}
