declare module "./server/app.mjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  export function apiMiddleware(): (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void | Promise<void>;
}
