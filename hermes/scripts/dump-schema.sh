#!/usr/bin/env bash
# Regenerate db/schema.sql from the live database (reference only; migrations
# are the source of truth). Requires DATABASE_URL to point at a migrated DB.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?set DATABASE_URL}"

{
  echo "-- schema.sql — regenerated reference dump of the current Hermes schema."
  echo "-- Source of truth is db/migrations/*.sql. Do not hand-edit; regenerate with:"
  echo "--   pnpm migrate && scripts/dump-schema.sh"
  echo ""
  pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges \
    | grep -vE '^(SET |SELECT pg_catalog|\\restrict|\\unrestrict|-- Dumped|--$|$)' \
    | grep -vE 'default_tablespace|default_table_access_method'
} > db/schema.sql

echo "Wrote db/schema.sql"
