// "Preview empty states": makes every list render as if it had no data, so the
// team can review what a brand-new workspace looks like without deleting
// anything. Turned on from the account menu or with ?empty=1 in the URL.
// The choice is remembered in this browser only.
import { createContext, useContext, useState, type ReactNode } from "react";

const KEY = "evalve.empty-preview";

function initial() {
  if (new URLSearchParams(window.location.search).get("empty") === "1") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const Ctx = createContext<{ on: boolean; setOn: (v: boolean) => void }>({ on: false, setOn: () => {} });

export function EmptyPreviewProvider({ children }: { children: ReactNode }) {
  const [on, setState] = useState(initial);
  const setOn = (v: boolean) => {
    setState(v);
    try {
      if (v) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked: the preview still works until the page reloads.
    }
    // Drop ?empty=1 when turning off, so a reload doesn't turn it back on.
    if (!v) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("empty")) {
        url.searchParams.delete("empty");
        window.history.replaceState(null, "", url);
      }
    }
  };
  return <Ctx.Provider value={{ on, setOn }}>{children}</Ctx.Provider>;
}

export const useEmptyPreview = () => useContext(Ctx);
