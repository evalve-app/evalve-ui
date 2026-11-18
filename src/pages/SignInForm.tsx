import { useState, type FormEvent } from "react";
import { login } from "../api/client";
import { Alert, Button, Input } from "../design-system/components";

// The username and password form. The login page and the "Sign in again"
// dialog show it. `onSignedIn` runs after the server accepts the sign-in.
export function SignInForm({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      await onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
