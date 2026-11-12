// Rows for the Investigations tab: one row for each investigation.

export type InvestigationInput = {
  id: string;
  name: string;
  description?: string | null;
  status: "pending" | "in_progress" | "completed";
  total_sessions: number;
  completed_sessions: number;
  updated: string;
};

export type InvestigationRow = {
  id: string;
  name: string;
  description: string | null;
  status: InvestigationInput["status"];
  statusLabel: string;
  // How many sessions have a verdict, for example "3 of 12".
  reviewed: string;
  updated: string;
};

const STATUS_LABEL: Record<InvestigationInput["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

// Investigations newest first by their last change.
export function investigationRows(investigations: InvestigationInput[]): InvestigationRow[] {
  return [...investigations]
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
    .map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? null,
      status: i.status,
      statusLabel: STATUS_LABEL[i.status] ?? i.status,
      reviewed: `${i.completed_sessions} of ${i.total_sessions}`,
      updated: i.updated,
    }));
}
