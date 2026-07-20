/**
 * Migration runner. Applies db/migrations/*.sql in numeric order, once each,
 * tracked in a _migrations table. Each migration runs inside a transaction so a
 * failure rolls back cleanly (RULE 7 — additive & idempotent forward-only).
 *
 * Usage: tsx scripts/migrate.ts            # apply pending migrations
 *        tsx scripts/migrate.ts --status   # list applied/pending, apply nothing
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Refusing to guess a database.");
    process.exit(1);
  }
  return url;
}

function listMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes("--status");
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      );
    `);
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
        (r) => r.name,
      ),
    );

    const all = listMigrations();
    const pending = all.filter((m) => !applied.has(m.name));

    if (statusOnly) {
      for (const m of all) {
        console.log(`${applied.has(m.name) ? "✓ applied " : "· pending "} ${m.name}`);
      }
      return;
    }

    if (pending.length === 0) {
      console.log("No pending migrations. Database is up to date.");
      return;
    }

    for (const m of pending) {
      console.log(`Applying ${m.name} …`);
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [m.name]);
        await client.query("COMMIT");
        console.log(`  ✓ ${m.name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ ${m.name} failed, rolled back:`, err);
        throw err;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
