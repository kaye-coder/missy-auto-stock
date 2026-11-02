import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Separate local build: daily launch serves these files without Vite or SSR.
export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true, prerender: { outputPath: "/index.html" } },
  },
  vite: {
    define: { "import.meta.env.VITE_OFFLINE_APP": "true" },
    build: { outDir: "dist-offline", sourcemap: false, minify: true },
  },
});