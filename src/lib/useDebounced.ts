import { useEffect, useState } from "react";

// Returns `value` once it has stopped changing for `ms`, so search doesn't
// hit the server on every keystroke.
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
