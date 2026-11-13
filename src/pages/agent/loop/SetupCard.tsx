import type { ReactNode } from "react";
import { Checkbox, Input } from "../../../design-system/components";
import { ABSENT, type SetupFields } from "../../../lib/loopSetup";

// The setup card of a loop: two columns of sections, each with its title and
// hint above its fields. This is the locked state of the card. The fieldset is
// disabled, so no field takes an edit. The loop page shows it at full opacity.
export function SetupCard({ fields }: { fields: SetupFields }) {
  return (
    <fieldset className="setup-card" disabled aria-label="Loop setup">
      <div className="setup-col">
        <Section title="Basics" hint="A hypothesis names the failure and its suspected cause. It is stored on every experiment. The cohort version stays the same for the full loop.">
          <Field label="Name">
            <Input className="setup-input" readOnly value={fields.name} />
          </Field>
          <Field label="Hypothesis">
            <textarea className="ev-input setup-input setup-textarea" readOnly rows={3} value={fields.hypothesis} />
          </Field>
          <Field label="Cohort version">
            <Input className="setup-input" readOnly value={fields.cohort} />
          </Field>
        </Section>
        <Section title="Gating evaluators" hint="Evaluators that return pass or fail. A case passes when every gating evaluator passes it.">
          <CheckList items={fields.gatingEvaluators} mono />
        </Section>
      </div>
      <div className="setup-col">
        <Section title="What may change" hint="Each experiment changes exactly one of these, as an override on the same agent version.">
          <CheckList items={fields.changes} />
        </Section>
        <Section title="Success" hint="A run is green when its pass rate is 100%. The loop passes when one experiment has this number of green runs in a row.">
          <div className="setup-grid">
            <UnitField label="Consecutive green runs" unit="runs" value={fields.greenRuns} />
          </div>
        </Section>
        <Section title="Stopping" hint="The cap counts runs, and it includes the runs of the control experiment and retries. The budget is for the full loop.">
          <div className="setup-grid">
            <UnitField label="Maximum total runs" unit="runs" value={fields.maxRuns} />
            <UnitField label="Loop budget" unit="USD" value={fields.budget} />
          </div>
        </Section>
      </div>
    </fieldset>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="setup-section">
      <div className="setup-section-head">
        <h3 className="setup-section-title">{title}</h3>
        <p className="setup-hint">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="setup-field">
      <span className="setup-label">{label}</span>
      {children}
    </label>
  );
}

// The items that the loop names. An absent list is one dash, with no checkbox.
function CheckList({ items, mono }: { items: string[]; mono?: boolean }) {
  return (
    <ul className="setup-checks">
      {items.map((item) => (
        <li key={item} className="setup-check">
          {item === ABSENT ? null : <Checkbox checked disabled onCheckedChange={() => {}} aria-label={item} />}
          <span className={mono ? "setup-check-label mono" : "setup-check-label"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function UnitField({ label, unit, value }: { label: string; unit: string; value: string }) {
  return (
    <Field label={label}>
      <span className="setup-unit-input">
        <Input className="setup-input mono" readOnly value={value} />
        <span className="setup-unit">{unit}</span>
      </span>
    </Field>
  );
}
