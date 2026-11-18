import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound } from "lucide-react";
import { ApiError, createApiKey, deleteApiKey, listApiKeys, type IssuedApiKey } from "../api/client";
import { Alert, Button, Input, StatusLabel } from "../design-system/components";
import { apiKeyCreateError, apiKeyName, apiKeyRevokeError, apiKeyRows, type ApiKeyFailure, type ApiKeyRow } from "../lib/apiKeys";
import { createCopyFeedback, type CopyState } from "../lib/copyFeedback";
import { useEmptyPreview } from "../lib/emptyPreview";
import { formatDateTime, formatRelative } from "../lib/format";

const API_KEYS_KEY = ["api-keys"];
const COLUMNS = 5;

// A call that threw something other than an ApiError got no response.
function apiKeyFailure(error: unknown): ApiKeyFailure {
  return error instanceof ApiError ? { status: error.status, detail: error.detail } : { status: null, detail: null };
}

// The settings of the signed-in person. Today it holds one section: their API
// keys. A person creates a key, copies its value one time, and revokes a key
// that is not necessary any more.
// API: GET and POST /api/v1/api-keys, DELETE /api/v1/api-keys/{id}
export function SettingsPage() {
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: API_KEYS_KEY, queryFn: listApiKeys });
  const preview = useEmptyPreview().on;
  const rows = apiKeyRows(preview ? [] : (keys.data ?? []));

  const [name, setName] = useState("");
  // True after "Done", so that the focus goes back to the name box.
  const [focusName, setFocusName] = useState(false);
  // The row that asks "Revoke this key?".
  const [confirming, setConfirming] = useState<string | null>(null);

  // The answer holds the key value. gcTime 0 and the reset on "Done" remove it
  // from memory, so the value shows only at creation.
  const creation = useMutation({
    mutationFn: createApiKey,
    gcTime: 0,
    onSuccess: () => {
      setName("");
      // Not returned: the value must show at once, not after the list loads again.
      void queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
  const revocation = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: (_, id) => {
      setConfirming(null);
      // A revoked key is of no use, so its value goes off the page.
      if (creation.data?.id === id) creation.reset();
    },
    // After a failure too: a 404 means that the list is old.
    onSettled: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });

  const newName = apiKeyName(name);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newName !== null) creation.mutate(newName);
  }

  return (
    <section className="page settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="settings-section" aria-labelledby="api-keys-title">
        <div>
          <div className="page-heading">
            <h2 id="api-keys-title" className="settings-title">
              API keys
            </h2>
            {keys.isSuccess ? <span className="count-chip">{rows.length}</span> : null}
          </div>
          <p className="settings-text">
            With an API key, a coding agent signs in to the Kitaru server as you. The Kitaru MCP and the Evalve MCP need one. Revoke a key that you do not use any more.
          </p>
        </div>

        {creation.data ? (
          <IssuedKey
            issued={creation.data}
            onDone={() => {
              creation.reset();
              setFocusName(true);
            }}
          />
        ) : (
          <form className="key-form" onSubmit={onSubmit}>
            <label className="field">
              <span className="field-label">Name of the new key</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: claude-code-laptop" spellCheck={false} autoComplete="off" autoFocus={focusName} />
            </label>
            <Button type="submit" disabled={newName === null || creation.isPending}>
              {creation.isPending ? "Creating key" : "Create key"}
            </Button>
          </form>
        )}
        {creation.isError ? <Alert variant="destructive">{apiKeyCreateError(apiKeyFailure(creation.error))}</Alert> : null}

        {keys.isError ? (
          <Alert variant="destructive" title="Could not load API keys">
            {keys.error.message}
          </Alert>
        ) : null}
        {revocation.isError ? <Alert variant="destructive">{apiKeyRevokeError(apiKeyFailure(revocation.error))}</Alert> : null}

        {keys.isSuccess && rows.length === 0 ? (
          <div className="empty-state">
            <KeyRound size={24} aria-hidden />
            <p className="empty-title">No API keys yet</p>
            <p className="empty-text">Create a key, and give its value to your coding agent.</p>
          </div>
        ) : null}

        {keys.isPending || rows.length > 0 ? (
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="fill">Last used</th>
                  <th aria-label="Revoke" />
                </tr>
              </thead>
              <tbody>
                {keys.isPending
                  ? Array.from({ length: 3 }, (_, i) => (
                      <tr key={i} className="row-skeleton">
                        <td colSpan={COLUMNS}>
                          <span className="skeleton-bar" />
                        </td>
                      </tr>
                    ))
                  : rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>
                          <StatusLabel status={r.status} tone={r.active ? "success" : "muted"} />
                        </td>
                        <td className="muted" title={formatDateTime(r.created)}>
                          {formatRelative(r.created)}
                        </td>
                        <td className="fill muted" title={formatDateTime(r.lastUsed)}>
                          {r.lastUsed ? formatRelative(r.lastUsed) : "Never"}
                        </td>
                        <td className="key-actions">
                          <RevokeCell
                            row={r}
                            confirming={confirming === r.id}
                            busy={revocation.isPending}
                            onAsk={() => {
                              revocation.reset();
                              setConfirming(r.id);
                            }}
                            onCancel={() => setConfirming(null)}
                            onRevoke={() => revocation.mutate(r.id)}
                          />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

// The value of a new key. It shows until the person selects "Done" or leaves
// the page. No call gives the value again.
function IssuedKey({ issued, onDone }: { issued: IssuedApiKey; onDone: () => void }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [feedback] = useState(() => createCopyFeedback({ write: (text) => navigator.clipboard.writeText(text), onChange: setCopyState }));

  return (
    <div className="issued-key" role="status">
      <div>
        <p className="issued-key-title">Key “{issued.name}” created</p>
        <p className="issued-key-text">Copy the key now and keep it in a safe place. The dashboard does not show it again.</p>
      </div>
      <code className="issued-key-value">{issued.key}</code>
      <div className="issued-key-actions">
        {/* The form is gone, so the focus moves here. */}
        <Button icon={copyState === "done" ? Check : Copy} onClick={() => feedback.copy(issued.key)} autoFocus>
          <span aria-live="polite">{copyState === "done" ? "Copied" : copyState === "failed" ? "Could not copy" : "Copy key"}</span>
        </Button>
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

// "Revoke", which first asks one time. A revoked key cannot come back.
function RevokeCell({
  row,
  confirming,
  busy,
  onAsk,
  onCancel,
  onRevoke,
}: {
  row: ApiKeyRow;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}) {
  if (!confirming) {
    return (
      <Button variant="outline" size="sm" aria-label={`Revoke key ${row.name}`} onClick={onAsk} disabled={busy}>
        Revoke
      </Button>
    );
  }
  return (
    <span className="revoke-confirm" role="group" aria-label={`Revoke key ${row.name}`}>
      <span>Revoke this key?</span>
      <Button variant="destructive" size="sm" onClick={onRevoke} disabled={busy}>
        {busy ? "Revoking" : "Revoke"}
      </Button>
      {/* "Revoke" is gone from the row, so the focus moves to the safe answer. */}
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} autoFocus>
        Cancel
      </Button>
    </span>
  );
}
