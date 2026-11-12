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
  // The color of the dot beside the status.
  statusTone: InvestigationStatusTone;
  // How many sessions have a verdict, for example "3 of 12".
  reviewed: string;
  updated: string;
};

export type InvestigationStatusTone = "muted" | "warning" | "success";

// How each status shows: its words, and the color of its dot.
const STATUS: Record<InvestigationInput["status"], { label: string; tone: InvestigationStatusTone }> = {
  pending: { label: "Pending", tone: "muted" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
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
      statusLabel: STATUS[i.status].label,
      statusTone: STATUS[i.status].tone,
      reviewed: `${i.completed_sessions} of ${i.total_sessions}`,
      updated: i.updated,
    }));
}
