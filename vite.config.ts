import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks only to Vite (http://localhost:5173).
// Vite forwards every /api request to the Kitaru server, so the browser sees
// one origin, the same way Caddy will serve the built app in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const kitaruUrl = env.KITARU_URL || "https://34-196-198-190.sslip.io";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: kitaruUrl, changeOrigin: true, secure: true },
      },
    },
  };
});
