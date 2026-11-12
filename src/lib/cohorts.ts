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

// The version with the highest number, or null when there are none.
export function newestVersion<V extends { version: number }>(versions: V[]): V | null {
  return versions.reduce<V | null>((best, v) => (!best || v.version > best.version ? v : best), null);
}

// The cohort version for the `?version=N` value of the cohort page. No value,
// or a value that matches no version, gives the newest version.
export function pickCohortVersion<V extends { version: number }>(versions: V[], param: string | null): V | null {
  return versions.find((v) => String(v.version) === param) ?? newestVersion(versions);
}

// Cohorts newest first by their last change. `versions` maps a cohort id to
// its versions, and has no entry for a cohort whose versions did not load.
export function cohortRows(cohorts: CohortInput[], versions: Record<string, CohortVersionInput[] | undefined>): CohortRow[] {
  return [...cohorts]
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
    .map((c) => {
      const all = versions[c.id] ?? [];
      const newest = newestVersion(all);
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
