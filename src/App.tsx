import { useCallback, useRef, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, LogOut } from "lucide-react";
import { getCurrentAccount, logout, UnauthorizedError } from "./api/client";
import { Alert, Avatar, EvalveLogo, Switch } from "./design-system/components";
import { useEmptyPreview } from "./lib/emptyPreview";
import { useDismiss } from "./lib/useDismiss";
import { LoginPage } from "./pages/LoginPage";
import { AgentsPage } from "./pages/AgentsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SessionPage } from "./pages/SessionPage";
import { AgentLayout } from "./pages/agent/AgentLayout";
import { SessionsTab } from "./pages/agent/SessionsTab";
import { ExperimentsTab } from "./pages/agent/ExperimentsTab";
import { ExperimentPage } from "./pages/agent/ExperimentPage";
import { LoopListTab } from "./pages/agent/loop/LoopListTab";
import { NewLoopPage } from "./pages/agent/loop/NewLoopPage";
import { LoopPage } from "./pages/agent/loop/LoopPage";
import { LoopComparePage } from "./pages/agent/loop/LoopComparePage";

const NAV = [
  { to: "/agents", label: "Agents" },
  { to: "/evaluators", label: "Evaluators" },
  { to: "/workers", label: "Workers" },
  { to: "/jobs", label: "Jobs" },
];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SignedInLayout />}>
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:agentId" element={<AgentLayout />}>
          <Route index element={<Navigate to="sessions" replace />} />
          <Route path="sessions" element={<SessionsTab />} />
          <Route path="investigations" element={<PlaceholderPage title="Investigations" embedded />} />
          <Route path="cohorts" element={<PlaceholderPage title="Cohorts" embedded />} />
          <Route path="experiments" element={<ExperimentsTab />} />
          <Route path="experiments/:experimentId" element={<ExperimentPage />} />
          <Route path="loop" element={<LoopListTab />} />
          <Route path="loop/new" element={<NewLoopPage />} />
          <Route path="loop/:slug" element={<LoopPage />} />
          <Route path="loop/:slug/compare" element={<LoopComparePage />} />
        </Route>
        <Route path="/sessions/:sessionId" element={<SessionPage />} />
        <Route path="/evaluators" element={<PlaceholderPage title="Evaluators" />} />
        <Route path="/workers" element={<PlaceholderPage title="Workers" />} />
        <Route path="/jobs" element={<PlaceholderPage title="Jobs" />} />
      </Route>
      <Route path="*" element={<Navigate to="/agents" replace />} />
    </Routes>
  );
}

// Every page behind login goes through here: it checks who is signed in
// (GET /accounts/me) and sends anyone who isn't to /login.
function SignedInLayout() {
  const location = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: getCurrentAccount });

  if (me.isPending) return <div className="page-message">Loading</div>;
  if (me.error instanceof UnauthorizedError) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (me.isError) {
    return (
      <div className="page-message">
        <Alert variant="destructive" title="Could not reach the Kitaru server">
          {me.error.message}
        </Alert>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* One bar: logo, main nav, account. */}
      <header className="topbar">
        <Link to="/agents" className="topbar-home" aria-label="evalve home">
          <EvalveLogo height={20} />
        </Link>
        <nav className="topbar-nav" aria-label="Main">
          {NAV.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link key={item.to} to={item.to} className="topbar-link" aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-right">
          <EmptyPreviewPill />
          <AccountMenu name={me.data.name} />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useDismiss(ref, open, useCallback(() => setOpen(false), []));

  async function signOut() {
    await logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-trigger" aria-label="Account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar initials={name.slice(0, 2).toUpperCase()} size="sm" />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-label">Signed in as</div>
          <div className="menu-name">{name}</div>
          <div className="menu-sep" />
          <EmptyPreviewItem />
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={signOut}>
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Shown in the top bar while the empty-state preview is on, so it can't be
// left on by accident during a demo.
function EmptyPreviewPill() {
  const { on, setOn } = useEmptyPreview();
  if (!on) return null;
  return (
    <span className="preview-pill" role="status">
      <EyeOff size={14} aria-hidden />
      Previewing empty states
      <button type="button" className="preview-pill-off" onClick={() => setOn(false)}>
        Turn off
      </button>
    </span>
  );
}

function EmptyPreviewItem() {
  const { on, setOn } = useEmptyPreview();
  return (
    <div className="menu-item menu-toggle" onClick={() => setOn(!on)}>
      <span className="menu-toggle-text">
        <span id="empty-preview-label">Preview empty states</span>
        <span className="menu-toggle-help">How lists look with no data</span>
      </span>
      <Switch checked={on} onCheckedChange={setOn} aria-labelledby="empty-preview-label" />
    </div>
  );
}
