# notetaker-kanban Phase 1 — SmartKanban server changes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `project` column to cards, scope-based tokens (mirror vs api), `POST /api/cards/:id/activity` endpoint, API token CRUD routes, and Settings → API Tokens panel — all additive, no breaking changes.

**Architecture:** Single PR to `KanbanClaude` repo. Reuses existing patterns (Fastify routes, `requireUser` middleware, `node:test` suite, `app.inject()`). New middleware `requireApiToken` validates `Authorization: Bearer <token>` headers against `mirror_tokens` table where `scope = 'api'`. Activity endpoint reuses existing `logActivity()` helper and `card.updated` WS broadcast.

**Tech Stack:** Fastify 4, PostgreSQL 16 (`pg`), TypeScript, `node:test` via `tsx`, React 18 + Tailwind for web panel.

**Spec:** [`docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md`](../specs/2026-04-27-notetaker-kanban-design.md), Section 6.7.

**Repo to work in:** `/Users/assistant/WorkingFolder/KanbanClaude` (the SmartKanban repo).

> ⚠ Repo-discrepancy note: existing `card_status` enum uses `in_progress` (snake_case), not `in-progress`. The bridge spec used kebab in places — server stays with the existing enum. Documented here so the bridge plan aligns.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `server/schema.sql` | modify | Append `project` column on `cards`, `scope` column on `mirror_tokens`. |
| `server/migrations/2026-04-29-notetaker.sql` | create | Idempotent migration mirroring schema additions for already-deployed installs. |
| `server/src/cards.ts` | modify | Extend `Scope` queries to accept optional `project` filter; `Card` type carries `project`. |
| `server/src/auth.ts` | modify | Add `userFromApiToken()` and `requireApiToken` middleware. |
| `server/src/routes/cards.ts` | modify | Accept `project` on POST/PATCH; new `POST /api/cards/:id/activity`. |
| `server/src/routes/api_tokens.ts` | create | CRUD for `scope='api'` tokens, mirroring `routes/mirror.ts`. |
| `server/src/index.ts` | modify | Register `apiTokenRoutes`. |
| `server/src/__tests__/api_tokens.test.ts` | create | Token CRUD + scope rejection tests. |
| `server/src/__tests__/card_project.test.ts` | create | Project field round-trip + `?project=` filter. |
| `server/src/__tests__/card_activity_post.test.ts` | create | Activity POST happy path + scope/visibility rejection. |
| `web/src/components/SettingsApiTokens.tsx` | create | Settings panel: list, generate, copy, revoke API tokens. |
| `web/src/components/SettingsDialog.tsx` | modify | Wire new tab. |
| `web/src/api.ts` | modify | Typed client functions for `/api/tokens` CRUD. |

---

## Task 1: Migration + schema additions

**Files:**
- Create: `server/migrations/2026-04-29-notetaker.sql`
- Modify: `server/schema.sql`

- [ ] **Step 1: Create the migration file**

Write `server/migrations/2026-04-29-notetaker.sql`:

```sql
-- notetaker-kanban Phase 1
-- Adds project column for cross-project grouping and scope on tokens
-- to distinguish mirror (read-only) from api (write) capability.
-- Idempotent — safe to re-run.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS project TEXT;

CREATE INDEX IF NOT EXISTS cards_project_idx
  ON cards(project)
  WHERE archived = false;

ALTER TABLE mirror_tokens
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'mirror';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mirror_tokens_scope_chk'
  ) THEN
    ALTER TABLE mirror_tokens
      ADD CONSTRAINT mirror_tokens_scope_chk CHECK (scope IN ('mirror', 'api'));
  END IF;
END $$;
```

- [ ] **Step 2: Append the same statements to `server/schema.sql`** so fresh installs get them.

After the existing `mirror_tokens` table definition (around line 39-44 in current schema.sql), append:

```sql
-- ----- notetaker-kanban Phase 1 additions -----
ALTER TABLE cards ADD COLUMN IF NOT EXISTS project TEXT;
CREATE INDEX IF NOT EXISTS cards_project_idx ON cards(project) WHERE archived = false;

ALTER TABLE mirror_tokens
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'mirror';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mirror_tokens_scope_chk'
  ) THEN
    ALTER TABLE mirror_tokens
      ADD CONSTRAINT mirror_tokens_scope_chk CHECK (scope IN ('mirror', 'api'));
  END IF;
END $$;
```

- [ ] **Step 3: Apply migration to dev DB**

Run:
```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
docker compose exec -T db psql -U kanban -d kanban < migrations/2026-04-29-notetaker.sql
```

Expected: no errors. Re-run same command. Expected: still no errors (idempotent).

- [ ] **Step 4: Verify schema**

Run:
```bash
docker compose exec -T db psql -U kanban -d kanban -c "\d cards" | grep project
docker compose exec -T db psql -U kanban -d kanban -c "\d mirror_tokens" | grep scope
```

Expected: `project | text` row in cards; `scope | text | not null default 'mirror'::text` in mirror_tokens.

- [ ] **Step 5: Commit**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
git add server/migrations/2026-04-29-notetaker.sql server/schema.sql
git commit -m "feat(db): add project column and token scope for notetaker-kanban"
```

---

## Task 2: Failing test for cards `project` field round-trip

**Files:**
- Create: `server/src/__tests__/card_project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/__tests__/card_project.test.ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(cardRoutes);
await app.ready();

let cookieA = '';
let userAId = '';

async function register(name: string) {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  const id = (res.json() as { id: string }).id;
  return { cookie: cookieStr.split(';')[0]!, id };
}

before(async () => {
  const a = await register('alice');
  cookieA = a.cookie;
  userAId = a.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = $1`, [userAId]);
});

test('POST /api/cards accepts project field; GET /api/cards?project=<key> filters', async () => {
  const create1 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'A in proj-x', project: 'proj-x' },
  });
  assert.equal(create1.statusCode, 201);
  assert.equal(create1.json().project, 'proj-x');

  const create2 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'B in proj-y', project: 'proj-y' },
  });
  assert.equal(create2.statusCode, 201);

  const create3 = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { cookie: cookieA },
    payload: { title: 'C no project' },
  });
  assert.equal(create3.statusCode, 201);
  assert.equal(create3.json().project, null);

  const filtered = await app.inject({
    method: 'GET',
    url: '/api/cards?scope=personal&project=proj-x',
    headers: { cookie: cookieA },
  });
  assert.equal(filtered.statusCode, 200);
  const cards = filtered.json() as Array<{ title: string; project: string | null }>;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, 'A in proj-x');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
npm test -- --test-only-files=src/__tests__/card_project.test.ts 2>&1 | tail -40
```

(Or simpler: `npx tsx --test src/__tests__/card_project.test.ts`.)

Expected: FAIL. Likely "Card has no project field" or `cards[0].title` is wrong because filter is ignored.

---

## Task 3: Implement `project` field on cards (read + write paths)

**Files:**
- Modify: `server/src/cards.ts`
- Modify: `server/src/routes/cards.ts`

- [ ] **Step 1: Add `project` to `Card` type and SELECTs**

In `server/src/cards.ts`, update the `Card` type (around line 17):

```ts
export type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  tags: string[];
  due_date: string | null;
  source: Source;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  ai_summarized: boolean;
  needs_review: boolean;
  project: string | null;
  assignees: string[];
  shares: string[];
  attachments: Attachment[];
};
```

`SELECT c.*` already returns the new column — no SQL change needed for `loadCard` / `listCards` / `listArchivedCards`.

- [ ] **Step 2: Extend `listCards` to accept optional project filter**

In `server/src/cards.ts`, change the signature and where-clause:

```ts
export async function listCards(
  userId: string,
  scope: Scope,
  project?: string,
): Promise<Card[]> {
  const baseWhere =
    scope === 'inbox'
      ? `NOT c.archived AND NOT EXISTS (
            SELECT 1 FROM card_assignees WHERE card_id = c.id
         )`
      : `NOT c.archived AND ${VISIBLE_TO_USER}`;

  const where = project
    ? `${baseWhere} AND c.project = $${scope === 'inbox' ? 1 : 2}`
    : baseWhere;

  const params: unknown[] = scope === 'inbox' ? [] : [userId];
  if (project) params.push(project);

  const { rows } = await pool.query<Card>(
    `
    SELECT
      c.*,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_assignees WHERE card_id = c.id), '{}') AS assignees,
      COALESCE((SELECT ARRAY_AGG(user_id::text) FROM card_shares WHERE card_id = c.id), '{}') AS shares,
      COALESCE((
        SELECT JSON_AGG(json_build_object(
          'id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
          'original_filename', a.original_filename, 'created_at', a.created_at
        ) ORDER BY a.created_at)
        FROM card_attachments a WHERE a.card_id = c.id
      ), '[]'::json) AS attachments
    FROM cards c
    WHERE ${where}
    ORDER BY c.status, c.position, c.created_at
    `,
    params,
  );
  return rows;
}
```

- [ ] **Step 3: Wire the project query param into the GET route**

In `server/src/routes/cards.ts` (around line 32):

```ts
app.get<{ Querystring: { scope?: Scope; project?: string } }>(
  '/api/cards',
  { preHandler: requireUserOrMirror },
  async (req) => {
    const scope: Scope = req.query.scope ?? 'personal';
    const project = req.query.project?.trim() || undefined;
    return listCards(req.user!.id, scope, project);
  },
);
```

- [ ] **Step 4: Accept `project` on POST `/api/cards`**

In the same file, modify the POST handler body type and INSERT to include `project`:

```ts
app.post<{
  Body: {
    title: string;
    description?: string;
    status?: Status;
    tags?: string[];
    due_date?: string | null;
    assignees?: string[];
    source?: 'manual' | 'telegram' | 'mirror';
    project?: string | null;
  };
}>('/api/cards', { preHandler: requireUser }, async (req, reply) => {
  const {
    title,
    description = '',
    status = 'backlog',
    tags = [],
    due_date = null,
    assignees = [],
    source = 'manual',
    project = null,
  } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    return reply.code(400).send({ error: 'title required' });
  }
  if (!isStatus(status)) return reply.code(400).send({ error: 'invalid status' });

  const userId = req.user!.id;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO cards (title, description, status, tags, due_date, source, created_by, project, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       COALESCE((SELECT MIN(position) - 1 FROM cards WHERE status = $3 AND NOT archived), 0))
     RETURNING id`,
    [title.trim(), description, status, tags, due_date, source, userId, project ? project.trim() : null],
  );
  // ...rest unchanged (assignee insertion, broadcast).
```

(Keep the rest of the POST handler exactly as it is. Only the destructure, signature, and INSERT change.)

- [ ] **Step 5: Accept `project` on PATCH `/api/cards/:id`**

In the PATCH handler, add `project?: string | null` to the body type, then add a `push` for it:

```ts
if (body.project !== undefined) {
  push('project', body.project ? body.project.trim() : null);
}
```

- [ ] **Step 6: Run the project test**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
npx tsx --test src/__tests__/card_project.test.ts 2>&1 | tail -20
```

Expected: PASS — all assertions green.

- [ ] **Step 7: Run full test suite to ensure no regressions**

```bash
npm test 2>&1 | tail -40
```

Expected: All tests pass. (Existing tests don't touch `project`, but they query `c.*` which now includes the new column — should be invisible.)

- [ ] **Step 8: Commit**

```bash
git add server/src/cards.ts server/src/routes/cards.ts server/src/__tests__/card_project.test.ts
git commit -m "feat(cards): support project field and ?project filter"
```

---

## Task 4: Failing test for `requireApiToken` middleware

**Files:**
- Create: `server/src/__tests__/api_tokens.test.ts`

- [ ] **Step 1: Write the failing test (token CRUD + scope enforcement)**

```ts
// server/src/__tests__/api_tokens.test.ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { mirrorRoutes } from '../routes/mirror.js';
import { cardRoutes } from '../routes/cards.js';
import { apiTokenRoutes } from '../routes/api_tokens.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(mirrorRoutes);
await app.register(apiTokenRoutes);
await app.register(cardRoutes);
await app.ready();

let cookieA = '';
let userAId = '';

async function register(name: string) {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  return { cookie: cookieStr.split(';')[0]!, id: (res.json() as { id: string }).id };
}

before(async () => {
  const a = await register('alice');
  cookieA = a.cookie;
  userAId = a.id;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM mirror_tokens WHERE user_id = $1`, [userAId]);
  await pool.query(`DELETE FROM cards WHERE created_by = $1`, [userAId]);
});

test('POST /api/tokens creates an api-scope token', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: { cookie: cookieA },
    payload: { label: 'laptop' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as { token: string; label: string; scope: string };
  assert.match(body.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(body.scope, 'api');
});

test('GET /api/tokens lists user tokens, hides others', async () => {
  await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 't1' },
  });
  const res = await app.inject({
    method: 'GET', url: '/api/tokens', headers: { cookie: cookieA },
  });
  assert.equal(res.statusCode, 200);
  const tokens = res.json() as Array<{ label: string; scope: string }>;
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].label, 't1');
});

test('DELETE /api/tokens/:token revokes', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'x' },
  });
  const { token } = create.json() as { token: string };
  const del = await app.inject({
    method: 'DELETE', url: `/api/tokens/${token}`, headers: { cookie: cookieA },
  });
  assert.equal(del.statusCode, 204);
  const list = await app.inject({
    method: 'GET', url: '/api/tokens', headers: { cookie: cookieA },
  });
  assert.equal((list.json() as unknown[]).length, 0);
});

test('Mirror token rejected on api-scope endpoints', async () => {
  // mint a mirror-scope token
  const mt = await app.inject({
    method: 'POST', url: '/api/mirror/tokens', headers: { cookie: cookieA },
    payload: { label: 'm' },
  });
  const { token } = mt.json() as { token: string };
  // try to use it for an api-scope POST (activity)
  // we'll create a card first via cookie auth, then try the activity POST with mirror token
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'x' },
  });
  const cardId = (card.json() as { id: string }).id;
  const act = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'note', body: 'should fail' },
  });
  assert.equal(act.statusCode, 403);
});

test('API-scope token accepted on api-scope endpoints', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'a' },
  });
  const { token } = at.json() as { token: string };
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'y' },
  });
  const cardId = (card.json() as { id: string }).id;
  const act = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'session_summary', body: 'ok' },
  });
  assert.equal(act.statusCode, 201);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
npx tsx --test src/__tests__/api_tokens.test.ts 2>&1 | tail -30
```

Expected: FAIL — `apiTokenRoutes` import errors, `/api/tokens` not registered.

---

## Task 5: Implement API token routes + middleware

**Files:**
- Modify: `server/src/auth.ts`
- Create: `server/src/routes/api_tokens.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add `userFromApiToken` and `requireApiToken` helpers**

In `server/src/auth.ts`, add after `userFromMirrorToken`:

```ts
export async function userFromApiToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<AuthUser>(
    `SELECT u.id, u.name, COALESCE(u.short_name, u.name) AS short_name, u.email
     FROM mirror_tokens m JOIN users u ON u.id = m.user_id
     WHERE m.token = $1 AND m.scope = 'api'`,
    [token],
  );
  return rows[0] ?? null;
}

function bearerToken(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return undefined;
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : undefined;
}

export async function requireApiToken(req: FastifyRequest, reply: FastifyReply) {
  const tok = bearerToken(req);
  const user = await userFromApiToken(tok);
  if (!user) {
    reply.code(403).send({ error: 'api token required' });
    return;
  }
  req.user = user;
}
```

- [ ] **Step 2: Create `server/src/routes/api_tokens.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { newToken, requireUser } from '../auth.js';

export async function apiTokenRoutes(app: FastifyInstance) {
  app.post<{ Body?: { label?: string } }>(
    '/api/tokens',
    { preHandler: requireUser },
    async (req, reply) => {
      const token = newToken();
      const label = req.body?.label?.trim() || 'api';
      await pool.query(
        `INSERT INTO mirror_tokens (token, user_id, label, scope) VALUES ($1, $2, $3, 'api')`,
        [token, req.user!.id, label],
      );
      return reply.code(201).send({ token, label, scope: 'api' });
    },
  );

  app.get('/api/tokens', { preHandler: requireUser }, async (req) => {
    const { rows } = await pool.query<{ token: string; label: string; created_at: string; scope: string }>(
      `SELECT token, label, created_at, scope
       FROM mirror_tokens
       WHERE user_id = $1 AND scope = 'api'
       ORDER BY created_at DESC`,
      [req.user!.id],
    );
    return rows;
  });

  app.delete<{ Params: { token: string } }>(
    '/api/tokens/:token',
    { preHandler: requireUser },
    async (req, reply) => {
      await pool.query(
        `DELETE FROM mirror_tokens WHERE token = $1 AND user_id = $2 AND scope = 'api'`,
        [req.params.token, req.user!.id],
      );
      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Register the routes in `server/src/index.ts`**

Find the block where other route modules are registered (e.g., `await app.register(mirrorRoutes);`) and add:

```ts
import { apiTokenRoutes } from './routes/api_tokens.js';
// ...
await app.register(apiTokenRoutes);
```

- [ ] **Step 4: Run the api_tokens tests (will still fail on activity endpoint)**

```bash
npx tsx --test src/__tests__/api_tokens.test.ts 2>&1 | tail -30
```

Expected: 3 passes (CRUD), 2 fails (`POST /api/cards/:id/activity` not implemented yet — that's Task 6).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth.ts server/src/routes/api_tokens.ts server/src/index.ts
git commit -m "feat(auth): api-scope tokens + Bearer middleware"
```

---

## Task 6: Implement `POST /api/cards/:id/activity`

**Files:**
- Modify: `server/src/routes/cards.ts`
- Create: `server/src/__tests__/card_activity_post.test.ts`

- [ ] **Step 1: Add the activity endpoint to `server/src/routes/cards.ts`**

In `routes/cards.ts`, add new imports at top:

```ts
import { requireApiToken } from '../auth.js';
```

Then, after the existing `GET /api/cards/:id/activity` handler, add:

```ts
// POST /api/cards/:id/activity — append an activity entry from an api-scope token.
app.post<{
  Params: { id: string };
  Body: { type: string; body: string; details?: Record<string, unknown> };
}>(
  '/api/cards/:id/activity',
  { preHandler: requireApiToken },
  async (req, reply) => {
    const { id } = req.params;
    const { type, body: text, details = {} } = req.body ?? ({} as any);
    if (typeof type !== 'string' || !type.trim()) {
      return reply.code(400).send({ error: 'type required' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    const card = await loadCard(id);
    if (!card) return reply.code(404).send({ error: 'not found' });
    if (!(await canUserSeeCard(req.user!.id, id))) {
      return reply.code(404).send({ error: 'not found' });
    }
    await logActivity(req.user!.id, id, type.trim(), { ...details, body: text.trim() });
    const updated = (await loadCard(id))!;
    broadcast({ type: 'card.updated', card: updated });
    return reply.code(201).send({ ok: true });
  },
);
```

- [ ] **Step 2: Create activity-specific test file**

Write `server/src/__tests__/card_activity_post.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { pool } from '../db.js';
import { authRoutes } from '../routes/auth.js';
import { cardRoutes } from '../routes/cards.js';
import { apiTokenRoutes } from '../routes/api_tokens.js';

const app = Fastify();
await app.register(cookie, { secret: 'test-secret' });
await app.register(authRoutes);
await app.register(apiTokenRoutes);
await app.register(cardRoutes);
await app.ready();

let cookieA = '', cookieB = '';
let userAId = '', userBId = '';
let apiTokenA = '';

async function register(name: string) {
  const email = `${name}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name, short_name: name, email, password: 'password123' },
  });
  const setCookie = res.headers['set-cookie'];
  const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string;
  return { cookie: cookieStr.split(';')[0]!, id: (res.json() as { id: string }).id };
}

before(async () => {
  const a = await register('alice');
  const b = await register('bob');
  cookieA = a.cookie; userAId = a.id;
  cookieB = b.cookie; userBId = b.id;
  const tk = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'a' },
  });
  apiTokenA = (tk.json() as { token: string }).token;
});

after(async () => {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userAId, userBId]]);
  await app.close();
  try { if (!(pool as { ended?: boolean }).ended) await pool.end(); } catch {}
});

beforeEach(async () => {
  await pool.query(`DELETE FROM cards WHERE created_by = ANY($1::uuid[])`, [[userAId, userBId]]);
});

test('POST /api/cards/:id/activity 201 with api token, appears in GET activity', async () => {
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 't' },
  });
  const cardId = (card.json() as { id: string }).id;

  const post = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${apiTokenA}` },
    payload: { type: 'session_summary', body: 'edited 3 files', details: { files: 3 } },
  });
  assert.equal(post.statusCode, 201);

  const get = await app.inject({
    method: 'GET', url: `/api/cards/${cardId}/activity`, headers: { cookie: cookieA },
  });
  assert.equal(get.statusCode, 200);
  const log = get.json() as Array<{ action: string; details: { body?: string; files?: number } }>;
  const entry = log.find(e => e.action === 'session_summary');
  assert.ok(entry, 'expected session_summary entry');
  assert.equal(entry!.details.body, 'edited 3 files');
  assert.equal(entry!.details.files, 3);
});

test('POST /api/cards/:id/activity 400 when body missing', async () => {
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 't2' },
  });
  const cardId = (card.json() as { id: string }).id;
  const r = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${apiTokenA}` },
    payload: { type: 'note' },
  });
  assert.equal(r.statusCode, 400);
});

test('POST /api/cards/:id/activity 404 when card invisible', async () => {
  const card = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieB },
    payload: { title: 'bob private' },
  });
  const cardId = (card.json() as { id: string }).id;
  const r = await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/activity`,
    headers: { authorization: `Bearer ${apiTokenA}` },
    payload: { type: 'note', body: 'x' },
  });
  assert.equal(r.statusCode, 404);
});
```

- [ ] **Step 3: Run the activity test**

```bash
npx tsx --test src/__tests__/card_activity_post.test.ts 2>&1 | tail -30
```

Expected: All 3 tests PASS.

- [ ] **Step 4: Re-run api_tokens tests; all should pass now**

```bash
npx tsx --test src/__tests__/api_tokens.test.ts 2>&1 | tail -30
```

Expected: 5 PASS.

- [ ] **Step 5: Run full suite**

```bash
npm test 2>&1 | tail -40
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/cards.ts server/src/__tests__/card_activity_post.test.ts
git commit -m "feat(cards): POST /api/cards/:id/activity for api-scope tokens"
```

---

## Task 7: Settings → API Tokens panel (web)

**Files:**
- Create: `web/src/components/SettingsApiTokens.tsx`
- Modify: `web/src/components/SettingsDialog.tsx`
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add typed client functions to `web/src/api.ts`**

Append (or place near existing mirror token functions):

```ts
export type ApiToken = {
  token: string;
  label: string;
  created_at: string;
  scope: 'api';
};

export async function listApiTokens(): Promise<ApiToken[]> {
  const r = await fetch('/api/tokens', { credentials: 'include' });
  if (!r.ok) throw new Error(`listApiTokens ${r.status}`);
  return r.json();
}

export async function createApiToken(label: string): Promise<{ token: string; label: string; scope: 'api' }> {
  const r = await fetch('/api/tokens', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  if (!r.ok) throw new Error(`createApiToken ${r.status}`);
  return r.json();
}

export async function deleteApiToken(token: string): Promise<void> {
  const r = await fetch(`/api/tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`deleteApiToken ${r.status}`);
}
```

- [ ] **Step 2: Create `web/src/components/SettingsApiTokens.tsx`**

Match the existing visual style by reading [SettingsDialog.tsx](../../../KanbanClaude/web/src/components/SettingsDialog.tsx) before writing. Pattern: list at top, form to create at bottom, copy + revoke buttons per row.

```tsx
import { useEffect, useState } from 'react';
import { type ApiToken, createApiToken, deleteApiToken, listApiTokens } from '../api';

export function SettingsApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [label, setLabel] = useState('');
  const [justCreated, setJustCreated] = useState<{ label: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try { setTokens(await listApiTokens()); } catch (e) { setError(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) { setError('label required'); return; }
    try {
      const created = await createApiToken(label.trim());
      setJustCreated({ label: created.label, token: created.token });
      setLabel('');
      await refresh();
    } catch (e) { setError(String(e)); }
  }

  async function onRevoke(token: string) {
    if (!confirm('Revoke this token? Devices using it will stop working.')) return;
    try { await deleteApiToken(token); await refresh(); } catch (e) { setError(String(e)); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">API tokens</h3>
        <p className="text-sm opacity-70">
          Used by notetaker-kanban and other agent integrations. Tokens have write access to your cards.
        </p>
      </div>

      {justCreated && (
        <div className="rounded border border-amber-500 bg-amber-50 p-3 text-sm">
          <div className="font-medium">Token created — copy it now. It won't be shown again.</div>
          <code className="mt-1 block break-all rounded bg-white p-2 font-mono">{justCreated.token}</code>
          <button
            type="button"
            className="mt-2 rounded bg-blue-600 px-3 py-1 text-white"
            onClick={() => navigator.clipboard.writeText(justCreated.token)}
          >Copy</button>
          <button
            type="button"
            className="ml-2 rounded border px-3 py-1"
            onClick={() => setJustCreated(null)}
          >Dismiss</button>
        </div>
      )}

      <ul className="divide-y rounded border">
        {tokens.length === 0 && <li className="p-3 text-sm opacity-60">No tokens yet.</li>}
        {tokens.map(t => (
          <li key={t.token} className="flex items-center justify-between p-3 text-sm">
            <div>
              <div className="font-medium">{t.label}</div>
              <div className="opacity-60">{new Date(t.created_at).toLocaleString()}</div>
              <code className="opacity-50">…{t.token.slice(-8)}</code>
            </div>
            <button
              type="button"
              className="rounded border border-red-500 px-3 py-1 text-red-600"
              onClick={() => onRevoke(t.token)}
            >Revoke</button>
          </li>
        ))}
      </ul>

      <form onSubmit={onCreate} className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1"
          placeholder="Label (e.g. laptop, desktop)"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">Generate</button>
      </form>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Wire the panel into `SettingsDialog.tsx`**

Open `web/src/components/SettingsDialog.tsx`. Find the existing tab structure (it has Mirror tokens, Telegram, Templates etc. tabs — locate the tab list state).

Add an "API tokens" tab next to "Mirror tokens." Add `SettingsApiTokens` import and render the panel when the tab is active. Match the existing tab pattern exactly — do not invent a new pattern. (Read the surrounding 50 lines first.)

If the tab key is e.g. `type Tab = 'mirror' | 'telegram' | 'templates'`, change to `... | 'apiTokens'` and add the corresponding render branch.

- [ ] **Step 4: Smoke test in browser**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude
docker compose up -d
cd server && npm run dev &
cd ../web && npm run dev
```

Open http://localhost:5173. Log in. Open Settings → API tokens tab. Generate a token. Copy. Revoke. Generate another.

Expected: token appears in list, copy works, revoke removes from list, banner showing the secret only appears immediately after creation.

- [ ] **Step 5: Stop dev servers and commit**

```bash
git add web/src/api.ts web/src/components/SettingsApiTokens.tsx web/src/components/SettingsDialog.tsx
git commit -m "feat(web): Settings panel for api tokens"
```

---

## Task 8: Cross-cut sanity — full test pass + dev smoke

**Files:** none (verification only).

- [ ] **Step 1: Run all server tests**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
npm test 2>&1 | tail -50
```

Expected: All green.

- [ ] **Step 2: End-to-end manual smoke**

With dev server still running, in a separate terminal:

```bash
TOKEN="<paste token from web UI>"

# create card with project
curl -sX POST http://localhost:3001/api/cards \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -d '{"title":"smoke test","project":"smoke"}'
```

Wait — POST `/api/cards` is currently `requireUser`, not `requireApiToken`. **Important:** the bridge's slash commands need to POST cards too. Decision: add `requireApiToken` *or* `requireUser` to the cards POST so both paths work.

Update `server/src/routes/cards.ts` POST handler preHandler:

```ts
async function requireUserOrApiToken(req: any, reply: any) {
  // try cookie first
  if (req.cookies?.[/* SESSION_COOKIE */ 'kanban_session']) {
    return requireUser(req, reply);
  }
  return requireApiToken(req, reply);
}
```

Better: define helper `requireUserOrApiToken` in `auth.ts`:

```ts
export async function requireUserOrApiToken(req: FastifyRequest, reply: FastifyReply) {
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (sessionToken) {
    const user = await userFromSession(sessionToken);
    if (user) { req.user = user; return; }
  }
  const tok = bearerToken(req);
  const user = await userFromApiToken(tok);
  if (!user) {
    reply.code(401).send({ error: 'auth required' });
    return;
  }
  req.user = user;
}
```

Apply `requireUserOrApiToken` to:

- `POST /api/cards`
- `PATCH /api/cards/:id`
- `POST /api/cards/:id/activity` (already has it via requireApiToken — but switching to OrApiToken lets web users post too)

Leave `DELETE`, archive/restore, and the read endpoints as-is (cookie-only or cookie+mirror).

- [ ] **Step 3: Add tests for cards POST/PATCH via api token**

Append two tests to `server/src/__tests__/api_tokens.test.ts`:

```ts
test('POST /api/cards with Bearer token works', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'b' },
  });
  const { token } = at.json() as { token: string };

  const r = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { title: 'via api', project: 'p1' },
  });
  assert.equal(r.statusCode, 201);
  const card = r.json() as { project: string; title: string };
  assert.equal(card.project, 'p1');
  assert.equal(card.title, 'via api');
});

test('PATCH /api/cards/:id with Bearer token replaces tags', async () => {
  const at = await app.inject({
    method: 'POST', url: '/api/tokens', headers: { cookie: cookieA },
    payload: { label: 'c' },
  });
  const { token } = at.json() as { token: string };
  const c = await app.inject({
    method: 'POST', url: '/api/cards', headers: { cookie: cookieA },
    payload: { title: 'tagging', tags: ['a', 'b'] },
  });
  const cardId = (c.json() as { id: string }).id;

  const p = await app.inject({
    method: 'PATCH',
    url: `/api/cards/${cardId}`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { tags: ['a', 'b', 'deployed-local'] },
  });
  assert.equal(p.statusCode, 200);
  const updated = p.json() as { tags: string[] };
  assert.deepEqual(updated.tags.sort(), ['a', 'b', 'deployed-local'].sort());
});
```

- [ ] **Step 4: Run tests, then commit**

```bash
cd /Users/assistant/WorkingFolder/KanbanClaude/server
npm test 2>&1 | tail -50
```

Expected: all green.

```bash
git add server/src/auth.ts server/src/routes/cards.ts server/src/__tests__/api_tokens.test.ts
git commit -m "feat(auth): allow api token on POST/PATCH cards endpoints"
```

---

## Task 9: Update README + docs

**Files:**
- Modify: `README.md` (root of KanbanClaude)

- [ ] **Step 1: Add a short section under "API"** documenting the new endpoint and token type:

Add under existing "Mirror, review, telegram, attachments" table:

```md
### API tokens (for agent integrations)

| Method | Path                              | Notes                                    |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/tokens`                     | Create api-scope token (cookie auth)     |
| GET    | `/api/tokens`                     | List own api tokens                      |
| DELETE | `/api/tokens/:token`              | Revoke                                   |

Endpoints accepting `Authorization: Bearer <api-token>`:
- `POST /api/cards`
- `PATCH /api/cards/:id`
- `POST /api/cards/:id/activity` (api-scope only)

`POST /api/cards/:id/activity` body:
```json
{ "type": "session_summary", "body": "edited 3 files", "details": { "files": 3 } }
```

Cards now carry an optional `project: string` field; list endpoint accepts `?project=<key>` for filtering.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: api tokens + project field"
```

---

## Task 10: Open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin <branch>
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: project column + api-scope tokens for notetaker-kanban" --body "$(cat <<'EOF'
## Summary
- Adds `project` column to `cards` for cross-project grouping; list filter `?project=<key>`.
- Adds `scope` column to `mirror_tokens`; introduces api-scope tokens used via `Authorization: Bearer ...`.
- New `POST /api/cards/:id/activity` endpoint for agent integrations to append activity entries.
- New Settings → API tokens panel.
- Phase 1 of the notetaker-kanban design (see SmartMirror docs/superpowers/specs/2026-04-27-notetaker-kanban-design.md).

## Test plan
- [ ] `npm test` in server passes (api_tokens, card_project, card_activity_post + existing).
- [ ] Manual: log in to web UI, generate api token, copy it.
- [ ] Manual: `curl -X POST` a card with Bearer token, see it in board.
- [ ] Manual: revoke token, confirm subsequent calls 403.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- All status enum values are existing snake_case (`backlog`, `today`, `in_progress`, `done`). Tag values stay kebab-case.
- Bridge plan must convert kebab `in-progress` → snake `in_progress` when sending to server; mismatch will 400.
- PATCH replaces tags array — confirmed by reading the handler. Bridge must read-then-merge.
- `requireApiToken` gates the activity POST. `requireUserOrApiToken` gates POST/PATCH cards. `requireUser` (cookie only) remains for delete/archive/etc.
- Migration is idempotent; tested by running it twice.
