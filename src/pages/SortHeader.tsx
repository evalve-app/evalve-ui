import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Sort } from "../lib/sortRows";

// A table header cell that sorts its column on click. The arrow shows the
// direction of the sorted column; other columns show a faint double arrow.
export function SortHeader<K extends string>({
  column,
  sort,
  onSort,
  className,
  children,
}: {
  column: K;
  sort: Sort<K>;
  onSort: (column: K) => void;
  className?: string;
  children: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-button" data-active={active || undefined} onClick={() => onSort(column)}>
        {children}
        <Icon size={14} aria-hidden className="sort-icon" />
      </button>
    </th>
  );
}
