import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Separate local build: daily launch serves these files without Vite or SSR.
export default defineConfig({
  plugins: [
    tanstackStart({ server: { entry: "server" }, spa: { enabled: true } }),
    react(), tailwindcss(), tsConfigPaths(),
  ],
  define: { "import.meta.env.VITE_OFFLINE_APP": "true" },
  build: { outDir: "dist-offline", sourcemap: false, minify: true },
});