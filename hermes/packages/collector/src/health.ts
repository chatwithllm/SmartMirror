import { createServer, type Server } from "node:http";
import type { AdapterHealth } from "@hermes/shared";

/** Minimal HTTP health endpoint. GET /health → JSON snapshot. */
export function startHealthServer(
  port: number,
  snapshot: () => { role: string; bus: boolean; adapters: AdapterHealth[] },
): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const s = snapshot();
      const healthy = s.bus && s.adapters.every((a) => a.status !== "down");
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: healthy, ...s }, null, 2));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => console.log(`[health] listening on :${port}`));
  return server;
}
