import { describe, expect, it } from "vitest";
import { apiKeyCreateError, apiKeyName, apiKeyRevokeError, apiKeyRows, type ApiKeyInput } from "./apiKeys";

const SIGN_IN_AGAIN = "You are not signed in any more. Load this page again, and sign in.";

const key = (name: string, over: Partial<ApiKeyInput> = {}): ApiKeyInput => ({
  id: name,
  name,
  active: true,
  created: "2026-11-12T10:00:00Z",
  last_used: null,
  ...over,
});

describe("apiKeyRows", () => {
  it("says Active for a key that can sign in and Inactive for the rest", () => {
    const [active, inactive] = apiKeyRows([key("a"), key("b", { active: false })]);
    expect(active.status).toBe("Active");
    expect(inactive.status).toBe("Inactive");
  });

  it("puts the newest key first", () => {
    const rows = apiKeyRows([key("old", { created: "2026-11-01T10:00:00Z" }), key("new", { created: "2026-11-15T10:00:00Z" }), key("middle")]);
    expect(rows.map((r) => r.name)).toEqual(["new", "middle", "old"]);
  });

  it("keeps the order of keys with the same time", () => {
    expect(apiKeyRows([key("a"), key("b")]).map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("has no last use for a key that did not sign in yet", () => {
    const [unused, used] = apiKeyRows([key("a"), key("b", { last_used: "2026-11-12T11:00:00Z" })]);
    expect(unused.lastUsed).toBeNull();
    expect(used.lastUsed).toBe("2026-11-12T11:00:00Z");
  });
});

describe("apiKeyName", () => {
  it("removes the spaces around the name", () => {
    expect(apiKeyName("  laptop  ")).toBe("laptop");
  });

  it("gives no name for an empty box or a box of spaces", () => {
    expect(apiKeyName("")).toBeNull();
    expect(apiKeyName("   ")).toBeNull();
  });
});

describe("apiKeyCreateError", () => {
  it("tells a person whose sign-in ended to sign in again", () => {
    expect(apiKeyCreateError({ status: 401, detail: "Not authenticated" })).toBe(SIGN_IN_AGAIN);
  });

  it("says the server did not answer when there is no response", () => {
    expect(apiKeyCreateError({ status: null, detail: null })).toBe("The key was not created, because the server did not answer. Try again in a moment.");
  });

  it("asks for a different name when a key has the name already", () => {
    expect(apiKeyCreateError({ status: 409, detail: "API key name already registered" })).toBe(
      "The key was not created, because a key with this name exists already. Give the new key a different name.",
    );
  });

  it("asks for a different name when the server does not accept the name and gives no reason", () => {
    expect(apiKeyCreateError({ status: 422, detail: null })).toBe("The key was not created, because the server did not accept this name. Give the key a different name.");
  });

  it("gives the reason from the server for any other answer", () => {
    expect(apiKeyCreateError({ status: 422, detail: "Name is too long" })).toBe("The key was not created: Name is too long");
    expect(apiKeyCreateError({ status: 503, detail: "Database is not available" })).toBe("The key was not created: Database is not available");
    expect(apiKeyCreateError({ status: 500, detail: null })).toBe("The key was not created. The server returned HTTP 500.");
  });
});

describe("apiKeyRevokeError", () => {
  it("tells a person whose sign-in ended to sign in again", () => {
    expect(apiKeyRevokeError({ status: 401, detail: "Not authenticated" })).toBe(SIGN_IN_AGAIN);
  });

  it("says the server did not answer when there is no response", () => {
    expect(apiKeyRevokeError({ status: null, detail: null })).toBe("The key was not revoked, because the server did not answer. Try again in a moment.");
  });

  it("says the key is gone when the account does not have it", () => {
    const text = "This key does not exist any more. The list now shows your current keys.";
    expect(apiKeyRevokeError({ status: 404, detail: "API key not found" })).toBe(text);
    expect(apiKeyRevokeError({ status: 422, detail: null })).toBe(text);
  });

  it("gives the reason from the server for any other answer", () => {
    expect(apiKeyRevokeError({ status: 503, detail: "Database is not available" })).toBe("The key was not revoked: Database is not available");
    expect(apiKeyRevokeError({ status: 500, detail: null })).toBe("The key was not revoked. The server returned HTTP 500.");
  });
});
