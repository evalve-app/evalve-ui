# Can a separate service check a Teammate's Kitaru API key?

Research for [#57](https://github.com/evalve-app/evalve-ui/issues/57), part of the Evalve MCP v1 map ([#55](https://github.com/evalve-app/evalve-ui/issues/55)).

Sources: the Kitaru source at tag `python/kitaru/v0.27.6` (commit `96dfb8236f09720a3d31a9c3a67cf4ac7e19ca91`), read from the local clone. Paths below are relative to that tag unless they name another repo. The live server was not called. Nothing here was tested against a running server.

## Answer

Yes. The Evalve service can send the Teammate's `KITKEY_` key to `GET /api/v1/accounts/me` as `Authorization: Bearer KITKEY_…`. A valid key returns HTTP 200 and the account. Any bad key returns HTTP 401. The call needs nothing else: no CSRF header, no cookie, and no token exchange first. The account response says if the account is a service account (`is_service_account`) and if it is an admin (`is_admin`).

## Findings

### 1. The key works directly as a bearer token

- The server reads `Authorization: Bearer <credential>` first. Only when there is no header does it read the auth cookie (`src/kitaru/server/adapters/rest/dependencies/auth.py:164-204`).
- A credential that starts with `KITKEY_` is checked as an API key on every request (`src/kitaru/server/adapters/auth/auth_service.py:136-137`).
- Kitaru's own Python client does the same. It sends a `KITKEY_` key as a static bearer token and does not exchange it (`src/kitaru/client/api_client.py:170-177`). Only control plane keys (`ZENPROKEY_`) are exchanged (`api_client.py:171-175`).
- `GET /api/v1/accounts/me` returns the calling account (`src/kitaru/server/adapters/rest/routers/accounts.py:69-83`). It is in this repo's `openapi.json` (line 375) with responses 200, 401, 403, 422 and 503.

### 2. No CSRF header and no cookie

- The CSRF check runs only when the credential came from the cookie and the session carries a CSRF token (`auth_service.py:140-148`). A header credential never needs `X-CSRF-Token`.
- API keys never carry a CSRF token, because the API key path builds a context without one (`auth_service.py:415-434`).
- This repo's dashboard is different. It signs in with a password, gets an HttpOnly cookie, and sends `X-CSRF-Token` on each request (`src/api/client.ts:1-10, 27-68`). A service with a key does not need any of that.

### 3. What the server checks for a key

`_authenticate_api_key` (`auth_service.py:415-434`) does these steps. Each failure gives HTTP 401 with the same text, `Invalid API key.` (`dependencies/auth.py:310-320`):

1. The key decodes. A key is `KITKEY_` plus base64 of `{"id": <key id>, "key": <secret>}` (`src/kitaru/server/domain/api_key.py:124-166`).
2. A key with that id exists (`auth_service.py:420-423`).
3. The secret matches the current hash, or the previous hash inside the grace window (`auth_service.py:424-429`).
4. The key is active (`auth_service.py:430-431`).
5. The owner account exists and is active (`auth_service.py:432`, `488-497`).

The service cannot tell from the 401 which step failed.

### 4. Revoked, deleted, rotated and expired keys

| Key state | Result on `/accounts/me` | Source |
|---|---|---|
| Deactivated (`active=False`) | 401 | `auth_service.py:430-431` |
| Deleted | 401 (key not found) | `auth_service.py:420-423` |
| Owner account deactivated | 401 | `auth_service.py:432, 495-496` |
| Rotated, old key, inside grace window | 200, same account | `api_key.py:108-121`, `auth_service.py:424-429` |
| Rotated, old key, after grace window | 401 | `api_key.py:121` |
| Rotated with `retain_period_minutes=0` (default) | Old key fails at once | `api_key.py:70, 119-120` |
| Rotated twice | The first key fails at once. Only one previous hash is kept. | `api_key.py:103` |
| "Expired" | Not possible. A key has no expiry field. It works until someone deactivates, deletes or rotates it. | `api_key.py:62-75` |

The grace window is counted from `last_rotated` (`api_key.py:121`). The docs describe rotation and deactivation the same way (`docs/book/deploy/authentication.md:51`).

### 5. The exchange for a short-lived token exists, but the service should not use it

- `POST /api/v1/login` with form field `grant_type=api-key` and the key in `Authorization: Bearer` returns a session token (`src/kitaru/server/adapters/rest/routers/auth.py:243-328`, `src/kitaru/api_models/v1/auth.py:27-33`). Any caller can do it. The Python client has `exchange_api_key` (`src/kitaru/client/resources/auth.py:132-186`).
- The grant is only accepted under the `local` auth scheme (`routers/auth.py:129-131`). It never sets a cookie (`routers/auth.py:308-313`).
- The token lives `JWT_LIFETIME_SECONDS`, 3600 s by default (`src/kitaru/server/api/config.py:75`, `auth_service.py:282-284`).
- **Risk:** the session token has no link to the key. If the key is deactivated or deleted, tokens made from it stay valid until they expire (`auth_service.py:210-212`). A service that exchanges keys would accept a revoked key for up to one hour. Calling `/accounts/me` with the key itself avoids this.

### 6. The account response

`AccountResponse` (`src/kitaru/api_models/v1/account.py:79-88`) has:

- `id`, `name`, `email`
- `is_service_account`: true for a service account, false for a user (a person)
- `is_admin`: true for an admin
- `active`, `metadata`, and timestamps

Service accounts cannot be admins (`docs/book/deploy/authentication.md:78`). So there are three kinds: admin user, plain user, service account. The response does not say which key was used. The service can read the key id from the key itself (finding 3, step 1). After a 200, that id is proven, because the server matched it with the secret.

A key belongs to the account that created it (`src/kitaru/server/application/services/api_key_service.py:43-60`). A Teammate who creates a key in the dashboard gets a key for their own user account.

### 7. Other credentials also pass `/accounts/me`

- A session token from password, device or API key login also returns 200 (`auth_service.py:138-139, 443-453`). If the service must accept only API keys, it must check the `KITKEY_` prefix itself.
- Worker and task tokens get 403 on this route. `/accounts/me` uses `authorize`, which accepts only an account principal (`dependencies/auth.py:323-367`).
- Under `AUTH_SCHEME=none`, every request runs as the default account, with or without a credential (`dependencies/auth.py:292-302`). The check then proves nothing. The Evalve deployment sets `KITARU_SERVER_AUTH_SCHEME=local` (`kitaru-deployment-test/infra/refresh.py:42`), so this does not apply there.
- Under the `control-plane` scheme, `KITKEY_` keys are rejected (`auth_service.py:357-363`).

### 8. Rate limits and caching

- No rate limit was found. A search of `src/kitaru/server` for `429`, `rate_limit` and `too many` found nothing. The Caddy config in the deployment has only `reverse_proxy` rules (`kitaru-deployment-test/infra/bootstrap.sh.tftpl:36-72`).
- Each check is cheap: one key read, one SHA-256 compare (`src/kitaru/server/domain/keys.py:51-73`), and one account read.
- The server writes `last_used` on the key at most once every 60 s per key (`auth_service.py:67-69, 436-441`). The write commits even on read-only routes (`dependencies/auth.py:119-139, 253-257`). So the check updates `last_used`, which the docs suggest for finding unused keys (`authentication.md:51`).
- If the service caches a result, a revoked key keeps working on the service for the cache time. A short cache (for example 60 s) keyed by a hash of the key is a fair trade. Do not store the plaintext key.

## For other tickets

- **#60 (approval):** the key cannot tell a person from a coding agent. Both use the same key and get the same account. One way to tell: a person in the dashboard has the `evalve_session` cookie (`refresh.py:47`). If the Evalve service sits on the same host behind Caddy, the browser could send that cookie to it, and the service could forward the cookie plus `X-CSRF-Token` to `/accounts/me`. Not tested; it depends on the cookie path and the Caddy routes.
- **#63 (service API):** the auth rule can be "send the Kitaru API key as a bearer token; the service checks it with `GET /api/v1/accounts/me`". The service also gets a key it could forward to Kitaru, so Kitaru records the Teammate, not a shared account, as the creator. Whether the service should act as the Teammate or as its own service account is a new open question.
- **Admin rights:** a Teammate whose account is an admin gives the service an admin key. The service can refuse `is_admin=true` keys, or ignore the flag. This is a decision for the service design.

## Not verified

- Behavior against a running server. All findings come from reading source.
- Whether the dashboard session cookie reaches a service on another path of the same host (#60 note).
