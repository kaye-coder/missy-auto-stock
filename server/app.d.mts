import type { IncomingMessage, ServerResponse } from "node:http";

export declare function apiMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>;
