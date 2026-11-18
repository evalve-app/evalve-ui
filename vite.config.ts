import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In development the browser talks only to Vite (http://localhost:5173).
// Vite forwards every /api request to the Kitaru server, and every /evalve
// request to the Evalve backend: on the same host by default, or at EVALVE_URL,
// such as a backend on http://localhost:8100. The browser sees one origin, the
// same way Caddy serves the built app in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const kitaruUrl = env.KITARU_URL || "https://34-196-198-190.sslip.io";
  const evalveUrl = env.EVALVE_URL || kitaruUrl;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: kitaruUrl, changeOrigin: true, secure: true },
        "/evalve": { target: evalveUrl, changeOrigin: true, secure: true },
      },
    },
    // Agent worktrees live in .claude/worktrees. Each one holds a copy of the
    // tests, so `npm test` in the main checkout must not collect them.
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    },
  };
});
