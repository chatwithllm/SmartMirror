/**
 * Issue / list / revoke per-device tokens (PLAN P3.1). The plaintext token is
 * printed ONCE at issue time and never stored — only its sha256 hash lands in
 * the `devices` table (RULE 10). Run inside the repo with DATABASE_URL set.
 *
 *   tsx scripts/device-token.ts issue "kitchen ipad" [--write]
 *   tsx scripts/device-token.ts list
 *   tsx scripts/device-token.ts revoke <device-id>
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Client } from "pg";

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const [, , action, ...rest] = process.argv;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (action === "issue") {
      const label = rest.find((a) => !a.startsWith("--")) ?? "device";
      const scopes = rest.includes("--write") ? ["read", "write"] : ["read"];
      const token = randomBytes(24).toString("base64url");
      const id = randomUUID();
      await client.query(
        `INSERT INTO devices (id, label, token_hash, scopes) VALUES ($1,$2,$3,$4::jsonb)`,
        [id, label, hashToken(token), JSON.stringify(scopes)],
      );
      console.log(`Device issued.\n  id:     ${id}\n  label:  ${label}\n  scopes: ${scopes.join(",")}`);
      console.log(`\n  TOKEN (shown once): ${token}\n`);
    } else if (action === "list") {
      const { rows } = await client.query(
        `SELECT id, label, scopes, created_at, revoked_at FROM devices ORDER BY created_at`,
      );
      for (const r of rows) {
        console.log(
          `${r.revoked_at ? "✗" : "✓"} ${r.id}  ${r.label}  [${(r.scopes as string[]).join(",")}]` +
            (r.revoked_at ? `  revoked ${r.revoked_at.toISOString?.() ?? r.revoked_at}` : ""),
        );
      }
    } else if (action === "revoke") {
      const id = rest[0];
      if (!id) {
        console.error("usage: revoke <device-id>");
        process.exit(1);
      }
      const { rowCount } = await client.query(
        `UPDATE devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
        [id],
      );
      console.log(rowCount ? `Revoked ${id}` : `No active device ${id}`);
    } else {
      console.log("usage: device-token.ts issue <label> [--write] | list | revoke <id>");
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
