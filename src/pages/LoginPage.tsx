import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { login } from "../api/client";
import { Alert, Button, Card, EvalveLogo, Input } from "../design-system/components";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only follow relative paths, so a crafted link can't send you to another site.
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/agents";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <EvalveLogo height={24} />
        <Card title="Sign in" description="Use your Kitaru server account.">
          <form className="form-stack" onSubmit={onSubmit}>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <label className="field">
              <span className="field-label">Username</span>
              <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
