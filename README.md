# evalve-ui

The evalve dashboard: a React app that talks to a Kitaru server's API and replaces Kitaru's bundled UI.

**Taking this over? Read [HANDOFF.md](HANDOFF.md) first.** Open work is in [docs/todo.md](docs/todo.md).

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173 and sign in with your Kitaru account.

The dev server forwards every `/api` request to the Kitaru server, so the browser sees one site. The server address defaults to the team demo deploy. To use another one, copy `.env.example` to `.env` and change `KITARU_URL`.

## What's where

| Path | What |
| --- | --- |
| `src/App.tsx` | Routes, the top bar, and the signed-in check |
| `src/api/client.ts` | The typed API client: login, the CSRF header on every call, and one function per Kitaru call the app makes |
| `src/api/schema.d.ts` | TypeScript types for every Kitaru API route, generated from `openapi.json` |
| `src/design-system/` | The Evalve Design System: `tokens.json` (copied from the design system), `tokens.css` (generated), `components.css` and `components.tsx` |
| `src/app.css` | Page layout styles. Uses design tokens only, no raw colors |
| `src/pages/` | One file per page. `agent/` holds the tabs of one agent, `agent/loop/` holds the Loop tab |
| `src/lib/` | Shared logic with no UI: loop rules, formatting, diffing, reading session steps |
| `scripts/deploy-dashboard.sh` | Builds the app and installs it on the Evalve EC2 server |
| `docs/kitaru-ui-route-map.md` | Which API calls each page of Kitaru's own UI makes |
| `docs/loop-contract.md` | How the Loop tab reads a loop from what the kitaru-loop skill leaves on the server |

## Updating generated files

- **New Kitaru version:** replace `openapi.json` with the server's `/openapi.json`, then run `npm run gen:api`.
- **New design tokens:** replace `src/design-system/tokens.json`, then run `npm run gen:tokens`.

## Deploy

```
./scripts/deploy-dashboard.sh
```

This needs the `evalve` AWS profile (`aws login --profile evalve`). It builds the app, uploads the build to the private Evalve state bucket, and uses AWS Systems Manager to install it on the server. Caddy then serves it at `https://dashboard.<kitaru hostname>` and forwards `/api` to Kitaru. The Kitaru UI keeps its own URL.

Do not set `KITARU_SERVER_EXTERNAL_UI=true` on the server yet. It sends CLI logins to this app's `/devices/verify` page, which is not built, so `kitaru login` would break.
