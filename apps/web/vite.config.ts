import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          radix: [
            "@radix-ui/react-accordion",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
          trpc: ["@trpc/client", "@trpc/react-query", "@tanstack/react-query", "superjson"],
        },
      },
    },
  },
});
