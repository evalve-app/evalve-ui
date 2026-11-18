// Rows and text for the API keys on the Settings page. An API key is a secret
// value with which a coding agent signs in to the Kitaru server as the person
// who created the key (see GLOSSARY.md).

export type ApiKeyInput = {
  id: string;
  name: string;
  active: boolean;
  created: string;
  last_used: string | null;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  active: boolean;
  // An inactive key cannot sign in. The dashboard does not make a key inactive,
  // but the Kitaru API can.
  status: "Active" | "Inactive";
  created: string;
  // Null when the key did not sign in yet.
  lastUsed: string | null;
};

// One row for each key, newest first. Keys with the same time keep their order.
export function apiKeyRows(keys: ApiKeyInput[]): ApiKeyRow[] {
  return keys
    .map((k) => ({ id: k.id, name: k.name, active: k.active, status: k.active ? ("Active" as const) : ("Inactive" as const), created: k.created, lastUsed: k.last_used }))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

// The name to send for a new key, or null when the box holds no name.
export function apiKeyName(input: string): string | null {
  const name = input.trim();
  return name === "" ? null : name;
}

// How a call to the server failed. `status` is null when no response came.
export type ApiKeyFailure = { status: number | null; detail: string | null };

// The sign-in to the dashboard ends after a time. The page load sends a
// signed-out person to the login page and then back to this page.
const SIGN_IN_AGAIN = "You are not signed in any more. Load this page again, and sign in.";

// The server answers 409 for a name that a key has already, and 422 for a name
// that it does not accept. A 422 detail can be a list, which arrives here as null.
export function apiKeyCreateError({ status, detail }: ApiKeyFailure): string {
  if (status === 401) return SIGN_IN_AGAIN;
  if (status === null) return "The key was not created, because the server did not answer. Try again in a moment.";
  if (status === 409) return "The key was not created, because a key with this name exists already. Give the new key a different name.";
  if (detail) return `The key was not created: ${detail}`;
  if (status === 422) return "The key was not created, because the server did not accept this name. Give the key a different name.";
  return `The key was not created. The server returned HTTP ${status}.`;
}

// The server answers 404 for a key that the account does not have, which
// includes a key that was revoked already. An id that is not a UUID gets 422.
export function apiKeyRevokeError({ status, detail }: ApiKeyFailure): string {
  if (status === 401) return SIGN_IN_AGAIN;
  if (status === null) return "The key was not revoked, because the server did not answer. Try again in a moment.";
  if (status === 404 || status === 422) return "This key does not exist any more. The list now shows your current keys.";
  if (detail) return `The key was not revoked: ${detail}`;
  return `The key was not revoked. The server returned HTTP ${status}.`;
}
