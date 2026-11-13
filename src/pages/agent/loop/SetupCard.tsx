import { useId, type ReactNode } from "react";
import { Checkbox, Input } from "../../../design-system/components";
import { ABSENT, type SetupFields, type SetupValues } from "../../../lib/loopSetup";
import type { ChangeField } from "../../../lib/loops";

// An item that a person can select in the editable card.
export type SetupOption<Id extends string = string> = { id: Id; label: string; help?: string };

// The editable state of the card: the values, the items to select from, and
// the function that takes a change.
export type SetupEdit = {
  values: SetupValues;
  onChange: (change: Partial<SetupValues>) => void;
  nameTaken: boolean;
  cohortVersions: SetupOption[];
  evaluators: SetupOption[];
  evaluatorsFooter?: ReactNode; // below the list of gating evaluators
  changes: SetupOption<ChangeField>[];
};

// The setup card of a loop: two columns of sections, each with its title and
// hint above its fields.
// - `fields`: the read-only card of the loop page. The fieldset is disabled,
//   so no field takes an edit. The card shows at full opacity.
// - `edit`: the editable card of the New loop page.
export function SetupCard(props: { fields: SetupFields } | { edit: SetupEdit }) {
  const edit = "edit" in props ? props.edit : null;
  const fields = "fields" in props ? props.fields : null;
  const set = edit?.onChange;
  const toggle = <T extends string>(list: T[], id: T, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));
  return (
    <fieldset className="setup-card" disabled={!edit} aria-label="Loop setup">
      <div className="setup-col">
        <Section title="Basics" hint="A hypothesis names the failure and its suspected cause. It is stored on every experiment. The cohort version stays the same for the full loop.">
          <Field label="Name">
            {edit ? (
              <Input className="setup-input" value={edit.values.name} onChange={(e) => set?.({ name: e.target.value })} placeholder="Day-30 refunds" invalid={edit.nameTaken} />
            ) : (
              <Input className="setup-input" readOnly value={fields?.name} />
            )}
          </Field>
          {edit ? (
            <Field label="Hypothesis (optional)">
              <textarea className="ev-input textarea setup-input" rows={3} value={edit.values.hypothesis} onChange={(e) => set?.({ hypothesis: e.target.value })} placeholder="The agent reads the 30-day window as exclusive and declines damaged items delivered exactly 30 days ago. Making the boundary explicit should fix them." />
            </Field>
          ) : (
            // Text that wraps, not a textarea: a disabled textarea cannot scroll with the keyboard, so the card shows the full hypothesis.
            <div className="setup-field">
              <span className="setup-label">Hypothesis</span>
              <p className="ev-input setup-input setup-text">{fields?.hypothesis}</p>
            </div>
          )}
          <Field label="Cohort version">
            {edit ? (
              <select className="ev-select native-select setup-input" value={edit.values.cohortVersionId} onChange={(e) => set?.({ cohortVersionId: e.target.value })}>
                {edit.cohortVersions.length === 0 ? <option value="">No cohorts yet</option> : null}
                {edit.cohortVersions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input className="setup-input" readOnly value={fields?.cohort} />
            )}
          </Field>
        </Section>
        <Section title="Gating evaluators" hint="Evaluators that return pass or fail. A case passes when every gating evaluator passes it.">
          {edit ? (
            <>
              <OptionList options={edit.evaluators} selected={edit.values.evaluators} onToggle={(id, on) => set?.({ evaluators: toggle(edit.values.evaluators, id, on) })} mono />
              {edit.evaluatorsFooter}
            </>
          ) : (
            <CheckList items={fields?.gatingEvaluators ?? []} mono />
          )}
        </Section>
      </div>
      <div className="setup-col">
        <Section title="What may change" hint="Each experiment changes exactly one of these, as an override on the same agent version.">
          {edit ? (
            <OptionList options={edit.changes} selected={edit.values.changes} onToggle={(id, on) => set?.({ changes: toggle(edit.values.changes, id, on) })} />
          ) : (
            <CheckList items={fields?.changes ?? []} />
          )}
        </Section>
        <Section title="Success" hint="A run is green when its pass rate is 100%. The loop passes when one experiment has this number of green runs in a row.">
          <div className="setup-grid">
            {edit ? (
              <NumberField label="Consecutive green runs" unit="runs" value={edit.values.greenRuns} min={1} onChange={(greenRuns) => set?.({ greenRuns })} />
            ) : (
              <UnitField label="Consecutive green runs" unit="runs" value={fields?.greenRuns ?? ABSENT} />
            )}
          </div>
        </Section>
        <Section title="Stopping" hint="The cap counts runs, and it includes the runs of the control experiment and retries. The budget is for the full loop.">
          <div className="setup-grid">
            {edit ? (
              <>
                <NumberField label="Maximum total runs" unit="runs" value={edit.values.maxRuns} min={1} onChange={(maxRuns) => set?.({ maxRuns })} />
                <NumberField label="Loop budget" unit="USD" value={edit.values.budget} min={0} step={0.01} onChange={(budget) => set?.({ budget })} />
              </>
            ) : (
              <>
                <UnitField label="Maximum total runs" unit="runs" value={fields?.maxRuns ?? ABSENT} />
                <UnitField label="Loop budget" unit="USD" value={fields?.budget ?? ABSENT} />
              </>
            )}
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

// The items that a person can select. The label is a real label of its checkbox, so a disabled fieldset stops a click on the text too.
function OptionList<Id extends string>({ options, selected, onToggle, mono }: { options: SetupOption<Id>[]; selected: Id[]; onToggle: (id: Id, on: boolean) => void; mono?: boolean }) {
  const base = useId();
  return (
    <ul className="setup-checks">
      {options.map((option) => (
        <li key={option.id} className="setup-check">
          <Checkbox id={`${base}-${option.id}`} checked={selected.includes(option.id)} onCheckedChange={(on) => onToggle(option.id, on)} />
          <label className="setup-check-text" htmlFor={`${base}-${option.id}`}>
            <span className={mono ? "setup-check-label mono" : "setup-check-label"}>{option.label}</span>
            {option.help ? <span className="setup-check-help">{option.help}</span> : null}
          </label>
        </li>
      ))}
    </ul>
  );
}

// A number that stays in its limits. An empty field gives the minimum.
function NumberField({ label, unit, value, min, step, onChange }: { label: string; unit: string; value: number; min: number; step?: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <span className="setup-unit-input">
        <input className="ev-input setup-input mono" type="number" min={min} step={step ?? 1} value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))} />
        <span className="setup-unit">{unit}</span>
      </span>
    </Field>
  );
}
