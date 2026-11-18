// The client for the Evalve backend (/evalve/v1). The backend passes the Kitaru
// session cookie and the X-CSRF-Token header to Kitaru (sc-284), so its calls go
// through the same sign-in gate as the Kitaru calls.
import createClient from "openapi-fetch";
import { signInGate } from "./client";
import type { paths } from "./evalve-schema";

export const evalve = createClient<paths>({ baseUrl: "", credentials: "same-origin", fetch: signInGate.fetch });
