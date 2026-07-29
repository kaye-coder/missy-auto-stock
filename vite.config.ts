// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Mounts the offline SQLite API (server/app.mjs) inside the same process that
 * serves the app, so one command starts everything — no Docker, no database
 * service to launch by hand.
 */
function offlineApiPlugin(): Plugin {
  return {
    name: "missy-offline-api",
    async configureServer(server) {
      const { apiMiddleware } = await import("./server/app.mjs");
      server.middlewares.use(apiMiddleware());
    },
    async configurePreviewServer(server) {
      const { apiMiddleware } = await import("./server/app.mjs");
      server.middlewares.use(apiMiddleware());
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [offlineApiPlugin()],
    server: { host: "0.0.0.0" },
  },
});
