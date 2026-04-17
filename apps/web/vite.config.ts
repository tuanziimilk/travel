import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/trpc": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/gg-cleaning/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/gg-cleaning/jobs": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/category-calibration/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          radix: [
            "@radix-ui/react-accordion",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
          trpc: ["@trpc/client", "@trpc/react-query", "@tanstack/react-query"],
        },
      },
    },
  },
});
