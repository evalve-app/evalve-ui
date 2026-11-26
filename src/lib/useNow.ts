import { useEffect, useState } from "react";

// The current time in ms, updated every `ms`, so a "waited N min" text stays
// current between polls. It makes no API call.
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
