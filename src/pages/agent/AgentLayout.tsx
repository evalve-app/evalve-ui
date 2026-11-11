import { Link, Outlet, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight } from "lucide-react";
import { getAgent } from "../../api/client";
import { Alert } from "../../design-system/components";

// Shared frame for every page of one agent: breadcrumb, identity, tabs.
const TABS = [
  { path: "sessions", label: "Sessions" },
  { path: "investigations", label: "Investigations" },
  { path: "cohorts", label: "Cohorts" },
  { path: "experiments", label: "Experiments" },
  { path: "loop", label: "Loop" },
];

export function AgentLayout() {
  const { agentId = "" } = useParams();
  const location = useLocation();
  const agent = useQuery({ queryKey: ["agent", agentId], queryFn: () => getAgent(agentId) });

  return (
    <div className="agent-page">
      <div className="agent-header">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/agents">Agents</Link>
          <ChevronRight size={14} aria-hidden />
          <span aria-current="page">{agent.data?.name ?? "…"}</span>
        </nav>
        <div className="agent-identity">
          <span className="agent-icon agent-icon-lg" aria-hidden>
            <Bot size={20} />
          </span>
          <div>
            <h1 className="agent-name">{agent.data?.name ?? " "}</h1>
            <p className="agent-sub">
              {agent.data ? (
                <>
                  <span className="mono">v{agent.data.latest_version}</span> latest
                  {agent.data.description ? <> · {agent.data.description}</> : null}
                </>
              ) : (
                " "
              )}
            </p>
          </div>
        </div>
        <div className="subnav" role="tablist" aria-label="Agent sections">
          {TABS.map((t) => {
            const to = `/agents/${agentId}/${t.path}`;
            const active = location.pathname.startsWith(to);
            return (
              <Link key={t.path} to={to} role="tab" aria-selected={active} className="subnav-link">
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      {agent.isError ? (
        <div className="agent-body">
          <Alert variant="destructive" title="Could not load this agent">
            {agent.error.message}
          </Alert>
        </div>
      ) : (
        <div className="agent-body">
          <Outlet context={agent.data} />
        </div>
      )}
    </div>
  );
}
