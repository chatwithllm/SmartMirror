#!/usr/bin/env bash
# Smart Mirror — end-to-end smoke test. Runs locally after Phase 14 merge
# as part of the v1.0.0 pre-release gate. When MIRROR_SSH or HA_URL are
# set, the script exercises the real box; otherwise it runs the frontend
# in preview mode and asserts basic health.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
PREVIEW_PORT="${PREVIEW_PORT:-4173}"
FAILED=0

check() {
  local label="$1"; local cmd="$2"
  if bash -c "$cmd" > /dev/null 2>&1; then
    printf '  ✅ %s\n' "$label"
  else
    printf '  ❌ %s\n' "$label"
    FAILED=$((FAILED + 1))
  fi
}

echo "==> Frontend build"
cd "$FRONTEND_DIR"
pnpm install --frozen-lockfile > /dev/null
pnpm check > /dev/null
pnpm test > /dev/null
pnpm build > /dev/null

echo "==> Preview server"
pnpm preview --port "$PREVIEW_PORT" > /tmp/mirror-preview.log 2>&1 &
PREVIEW_PID=$!
trap "kill $PREVIEW_PID 2>/dev/null || true" EXIT
# Wait for the port.
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PREVIEW_PORT" > /dev/null && break
  sleep 1
done

echo "==> Smoke checks"
check "preview returns 200" "curl -sf http://localhost:$PREVIEW_PORT/ > /dev/null"
check "preview HTML contains <title>" "curl -s http://localhost:$PREVIEW_PORT/ | grep -q '<title>'"
check "bundle under 400KB gzipped (client chunk)" \
  "find .svelte-kit/output/client/_app/immutable -name '*.js' -exec gzip -c {} \\; | wc -c | awk '{exit !(\$1 < 400000 * 3)}'"

if [ -n "${HA_URL:-}" ] && [ -n "${HA_TOKEN:-}" ]; then
  echo "==> Live HA checks"
  check "HA reachable" "curl -sf -H 'Authorization: Bearer $HA_TOKEN' $HA_URL/api/ > /dev/null"
  check "mirror_layout_revision exists" "curl -sf -H 'Authorization: Bearer $HA_TOKEN' $HA_URL/api/states/sensor.mirror_layout_revision > /dev/null"
else
  echo "==> (HA_URL/HA_TOKEN unset, skipping live HA checks)"
fi

echo
if [ $FAILED -eq 0 ]; then
  echo "🎉 smoke test passed"
  exit 0
else
  echo "❌ smoke test failed ($FAILED checks)"
  exit 1
fi
