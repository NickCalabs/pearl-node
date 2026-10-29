import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the app works behind a path prefix (e.g. a reverse proxy).
// The build goes straight into the Go server, which embeds it.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../server/web", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8083" } },
});
