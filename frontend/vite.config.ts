import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy /api requests to the local Wrangler dev server
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        // WebSocket proxy support
        ws: true,
      },
    },
  },
});
