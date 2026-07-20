#!/usr/bin/env sh
# One image, three entrypoints — selected by HERMES_ROLE (DESIGN §7).
set -e

case "${HERMES_ROLE:-}" in
  collector)
    exec node --import tsx packages/collector/src/main.ts
    ;;
  processor)
    # Apply pending migrations before the only DB writer starts.
    node --import tsx scripts/migrate.ts
    exec node --import tsx packages/processor/src/main.ts
    ;;
  web)
    exec pnpm --filter @hermes/web start
    ;;
  *)
    echo "HERMES_ROLE must be one of: collector | processor | web" >&2
    exit 1
    ;;
esac
