import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build: no backend, the API is answered in the browser (src/mock.js).
// Relative base so the page works under any path (GitHub Pages: /footprint/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
  server: { port: 5200 },
});
