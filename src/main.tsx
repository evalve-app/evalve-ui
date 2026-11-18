import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./design-system/tokens.css";
import "./design-system/components.css";
import "./app.css";
import { App } from "./App";
import { watchAccountChange } from "./lib/accountChange";
import { EmptyPreviewProvider } from "./lib/emptyPreview";

// Light by default. The dark theme is defined in tokens.css; set
// data-theme="dark" here (or add a toggle later) to use it.
document.documentElement.setAttribute("data-theme", "light");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
// A different account gets no data of the account before (see the "Sign in again" dialog).
watchAccountChange(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <EmptyPreviewProvider>
          <App />
        </EmptyPreviewProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
