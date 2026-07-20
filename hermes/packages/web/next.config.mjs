/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSE (/api/stream) must flush immediately; gzip buffers the event-stream and
  // stalls the live tail. The payloads are tiny JSON on a LAN — no loss.
  compress: false,
  // Lint runs as its own done-gate step (`pnpm -w lint`); don't double-run
  // Next's linter against the workspace flat config during the build.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "no-cache, no-store, must-revalidate" },
          { key: "service-worker-allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "content-type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
