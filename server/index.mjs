// Local Node runtime only: never imported into the hosted server graph.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { apiMiddleware } from "./app.mjs";
import { ROOT } from "./db.mjs";
import { staticHandler } from "./static.mjs";

const serve = staticHandler(resolve(ROOT, "dist-offline/client"));
const api = apiMiddleware();
const server = createServer((req, res) => api(req, res, () => serve(req, res)));
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0", () => console.log("Missy ready on http://localhost:" + (process.env.PORT ?? 8080)));