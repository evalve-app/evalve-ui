// Small display helpers shared by every page.

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Fixed decimals per range so a column of costs lines up: $0.00029, $0.012, $1.40.
export function formatCost(cost: string | null | undefined) {
  if (cost == null) return "—";
  const n = Number(cost);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.00001) return "<$0.00001";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// A long duration in whole minutes, for the time that a loop took: "12 min", "1 h 12 min".
export function formatLongDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "less than 1 min";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

export function shortId(id: string) {
  return id.slice(-8);
}

// Today: "2:58 PM". Other days: "Nov 9, 2:58 PM".
export function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : formatDateTime(iso);
}

// 0.96 → "96%", 0.995 → "99.5%". Whole numbers drop the decimal.
export function formatPercent(v: number) {
  const p = v * 100;
  return `${Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p) : p.toFixed(1)}%`;
}
