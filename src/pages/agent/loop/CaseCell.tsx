import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import type { CellTarget } from "../../../lib/cellTarget";
import { useDismiss } from "../../../lib/useDismiss";

// How a case did in a lap: every run passed, none did, some did, or no result.
export type CellState = "pass" | "fail" | "flaky" | "none";

const PHASE_WORD = { screen: "Screen", trial: "Trial", confirmation: "Confirmation" } as const;
const GAP = 4; // px between the cell and its menu
const EDGE = 8; // px the menu keeps from the viewport edge

// One case cell in the lap grid. It opens the session behind it, or a menu of
// sessions when the cell covers several runs.
export function CaseCell({ target, state, tip }: { target: CellTarget; state: CellState; tip: string }) {
  const square = <span className={`cell ${state}`} />;
  if (target.kind === "none") {
    const title = state === "none" ? tip : `${tip}. ${target.reason}`;
    return <span className={`cell ${state}`} title={title} />;
  }
  if (target.kind === "link") {
    return (
      <Link to={`/sessions/${target.sessionId}`} className="cell-hit" title={tip} aria-label={`${tip}. Open session`}>
        {square}
      </Link>
    );
  }
  return <CellMenu target={target} tip={tip} square={square} />;
}

function CellMenu({ target, tip, square }: { target: Extract<CellTarget, { kind: "menu" }>; tip: string; square: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Give focus back to the cell if it was inside the menu, so a keyboard user keeps their place.
  const close = useCallback(() => {
    if (ref.current?.contains(document.activeElement) && document.activeElement !== button.current) button.current?.focus();
    setOpen(false);
  }, []);
  useDismiss(ref, open, close);

  // The grid scrolls sideways and would clip the menu, so the menu is fixed to
  // the viewport. Place it below the cell, or above when it fits there and
  // not below. When it fits on neither side, use the side with more room and
  // let the menu scroll inside that room.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const cell = button.current.getBoundingClientRect();
    const { width, height } = menu.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - EDGE - (cell.bottom + GAP);
    const roomAbove = cell.top - GAP - EDGE;
    const placeBelow = height <= roomBelow || (height > roomAbove && roomBelow >= roomAbove);
    const maxHeight = Math.max(0, placeBelow ? roomBelow : roomAbove);
    const shown = Math.min(height, maxHeight);
    const top = placeBelow ? cell.bottom + GAP : cell.top - GAP - shown;
    const left = Math.max(EDGE, Math.min(cell.left, window.innerWidth - EDGE - width));
    setPos({ position: "fixed", top, left, right: "auto", maxHeight, overflowY: "auto" });
  }, [open]);

  // Close on a page scroll or a resize, so the menu never drifts away from its
  // cell. A scroll inside the menu itself keeps it open.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  function toggle() {
    if (open) return close();
    setPos({ position: "fixed", visibility: "hidden" }); // measured, then placed, before paint
    setOpen(true);
  }

  return (
    <div className="cell-menu" ref={ref}>
      <button ref={button} type="button" className="cell-hit" title={tip} aria-label={`${tip}. Choose a run`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {square}
      </button>
      {open ? (
        <div ref={menu} className="menu" role="menu" style={pos} aria-label={target.header}>
          <div className="menu-label cell-menu-header">{target.header}</div>
          <div className="menu-sep" />
          {target.rows.map((r) => (
            <Link key={r.run} to={`/sessions/${r.sessionId}`} role="menuitem" className="menu-item cell-menu-row">
              <span className="mono">Run {r.run}</span>
              {target.showPhase ? <span className="cell-menu-phase">{PHASE_WORD[r.phase]}</span> : null}
              <span className="cell-menu-result">
                <span className={`cell ${r.passed ? "pass" : "fail"}`} aria-hidden />
                {r.passed ? "Passed" : "Failed"}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
