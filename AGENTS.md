<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the local Node HTTP server and Mac launcher outside the hosted SSR import graph; operating-system and SQLite APIs require a real local Node runtime.
- Build the offline SPA with vite.offline.config.ts into dist-offline/client and serve precompressed assets with server/index.mjs; daily Mac launch must not compile the application.
- Store launcher-only preferences in the existing data directory and configure backups separately; updates must not move or replace the live SQLite file or product uploads.
- Keep read optimizations request-local and preserve mutation and SSE semantics; cached results or changed invalidation policies would risk stale shop data.
