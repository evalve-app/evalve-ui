// Rows for the Cohorts tab: one row for each cohort, with its newest version.

export type CohortInput = { id: string; name: string; description?: string | null; updated: string };
export type CohortVersionInput = { version: number; display_version?: string | null; session_count: number };

export type CohortRow = {
  id: string;
  name: string;
  description: string | null;
  updated: string;
  // Null until the versions of the cohort load, and when it has none.
  versionLabel: string | null;
  sessionCount: number | null;
};

// The display version when the cohort version has one, "v3" when it does not.
export function versionLabel(v: { version: number; display_version?: string | null }) {
  return v.display_version ?? `v${v.version}`;
}

// Cohorts newest first by their last change. `versions` maps a cohort id to
// its versions, and has no entry for a cohort whose versions did not load.
export function cohortRows(cohorts: CohortInput[], versions: Record<string, CohortVersionInput[] | undefined>): CohortRow[] {
  return [...cohorts]
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
    .map((c) => {
      const all = versions[c.id] ?? [];
      const newest = all.reduce<CohortVersionInput | null>((best, v) => (!best || v.version > best.version ? v : best), null);
      return {
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        updated: c.updated,
        versionLabel: newest ? versionLabel(newest) + (all.length > 1 ? ` · ${all.length} versions` : "") : null,
        sessionCount: newest ? newest.session_count : null,
      };
    });
}
