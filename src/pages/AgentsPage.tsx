import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plus, RefreshCw, Search } from "lucide-react";
import { listAgents, type Agent } from "../api/client";
import { Alert, Button } from "../design-system/components";
import { NewAgentDialog } from "./NewAgentDialog";
import { formatRelative } from "../lib/format";
import { useEmptyPreview } from "../lib/emptyPreview";

// Layout follows Kitaru's agents page: title and count, then search,
// Refresh and New agent, then a grid of agent cards.
// API: GET /api/v1/agents?size=50 (see docs/kitaru-ui-route-map.md).
export function AgentsPage() {
  const agents = useQuery({ queryKey: ["agents"], queryFn: listAgents });
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const preview = useEmptyPreview().on;
  const all = preview ? [] : (agents.data ?? []);
  const term = search.trim().toLowerCase();
  const shown = term ? all.filter((a) => a.name.toLowerCase().includes(term) || (a.description ?? "").toLowerCase().includes(term)) : all;

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title">Agents</h1>
          {agents.isSuccess ? <span className="count-chip">{all.length}</span> : null}
        </div>
        <div className="page-actions">
          <label className="search-field">
            <Search size={16} aria-hidden className="search-icon" />
            <input
              className="ev-input search-input"
              type="search"
              placeholder="Search agents"
              aria-label="Search agents"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button variant="outline" icon={RefreshCw} onClick={() => agents.refetch()} disabled={agents.isFetching}>
            Refresh
          </Button>
          <Button icon={Plus} onClick={() => setNewOpen(true)}>
            New agent
          </Button>
        </div>
      </div>

      {agents.isError ? (
        <Alert variant="destructive" title="Could not load agents">
          {agents.error.message}
        </Alert>
      ) : null}

      {agents.isPending ? (
        <div className="card-grid" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="agent-card skeleton" />
          ))}
        </div>
      ) : null}

      {agents.isSuccess && all.length === 0 ? (
        <div className="empty-state">
          <Bot size={24} aria-hidden />
          <p className="empty-title">No agents yet</p>
          <p className="empty-text">Connect an agent from its repo and its sessions will show up here.</p>
          <Button variant="outline" icon={Plus} onClick={() => setNewOpen(true)}>
            New agent
          </Button>
        </div>
      ) : null}

      {agents.isSuccess && all.length > 0 && shown.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No agents match "{search}"</p>
        </div>
      ) : null}

      {shown.length > 0 ? (
        <div className="card-grid">
          {shown.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      ) : null}

      <NewAgentDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </section>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link to={`/agents/${agent.id}/sessions`} className="agent-card">
      <div className="agent-card-top">
        <span className="agent-icon" aria-hidden>
          <Bot size={18} />
        </span>
        <span className="version-chip">v{agent.latest_version}</span>
      </div>
      <h2 className="agent-card-name">{agent.name}</h2>
      <p className={agent.description ? "agent-card-description" : "agent-card-description is-empty"}>
        {agent.description || "No description"}
      </p>
      <p className="agent-card-meta">Updated {formatRelative(agent.updated)}</p>
    </Link>
  );
}
