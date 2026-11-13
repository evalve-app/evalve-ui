// Sorting for tables whose column headers sort on click.

export type SortDir = "asc" | "desc";
export type Sort<K extends string> = { key: K; dir: SortDir };
export type SortValue = string | number | null;

// Rows sorted by one value. Rows with no value go last in both directions.
// Rows with equal values keep their order. Text sorts A to Z, ignoring case,
// with numbers in text in number order ("worker-2" before "worker-10").
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
  });
}

// The sort after a click on a column header. The same column flips its
// direction. Another column starts in `firstDir`.
export function nextSort<K extends string>(current: Sort<K>, key: K, firstDir: SortDir = "asc"): Sort<K> {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}
