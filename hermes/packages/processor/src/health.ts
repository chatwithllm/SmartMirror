import { createServer, type Server } from "node:http";

/** Minimal HTTP health endpoint for the processor. */
export function startHealthServer(
  port: number,
  snapshot: () => { bus: boolean; db: boolean },
): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      Promise.resolve(snapshot()).then((s) => {
        const healthy = s.bus && s.db;
        res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: healthy, role: "processor", ...s }, null, 2));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => console.log(`[health] listening on :${port}`));
  return server;
}
