/* ============================================================
   _db.js — Neon Postgres. The one dependency this repo has.
   ------------------------------------------------------------
   WHY POSTGRES AND NOT A KV STORE. The first cut of this used
   Upstash Redis, copied from Nicotia's catalogue cache. That was
   a copy of the wrong sister: Herbal Leaf already runs Neon, the
   owner already has it, and a second datastore for one table is a
   second thing to pay for, monitor and forget the credentials of.

   It is also, on the merits, the better fit for what this site
   actually stores. Captures are not cache entries. They are
   evidence — the thing you go back to in six months to answer
   "why does this merchant have these four product types in its
   include list". A store whose whole design is "this will expire"
   is the wrong shape for that.

   ------------------------------------------------------------
   WHY ONE ROW PER PRODUCT, NOT ONE BLOB PER MERCHANT
   ------------------------------------------------------------
   The KV version stored each merchant's whole capture as one JSON
   value, which forced a read-modify-write on every page captured:
   read the merchant's blob, merge the new page in, write it back.
   Two tabs capturing two pages of the same shop at once would race,
   and the loser's page would vanish silently — which on this site
   means a room quietly missing a third of a catalogue.

   A row per product makes the merge an UPSERT. It is atomic, it
   cannot lose a concurrent write, and it removes the read half
   entirely.

   It also sidesteps a size ceiling. Neon's SQL-over-HTTP caps a
   response, and "capture everything, filter never" means we keep
   raw per-card HTML — a 1,200-product shop is megabytes. As one
   blob that eventually stops fitting, and the failure arrives as a
   truncated read rather than an error. As rows it is a LIMIT.

   And it buys the thing Postgres is actually for: the product_type
   histogram you write an `include` list from is now a GROUP BY over
   indexed rows instead of a full download parsed in JavaScript.

   ------------------------------------------------------------
   THE SCHEMA IS CREATED ON DEMAND
   ------------------------------------------------------------
   Three small tables, `CREATE TABLE IF NOT EXISTS` on first use,
   memoised per instance. Herbal Leaf runs Drizzle migrations and
   that is right for Herbal Leaf, which has a build step and a
   dozen tables. Adding a migration toolchain here to manage three
   would be the heavier half of the trade.

   `kv` is deliberately the SAME SHAPE as Herbal Leaf's kv table
   (k text primary key, v text, expires_at bigint) so the two sites
   can share a database later without a reconciliation.
   ============================================================ */

import { neon } from '@neondatabase/serverless'

const URL_ = process.env.DATABASE_URL || ''

/** Null when unset, so every caller degrades instead of throwing at import. */
const sql = URL_ ? neon(URL_) : null

export function dbConfigured() {
  return !!sql
}

let ready = null
async function ensureSchema() {
  if (!sql) return false
  if (ready) return ready
  ready = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS kv (
        k          text PRIMARY KEY,
        v          text NOT NULL,
        expires_at bigint
      )`
    /* One row per product. `identity` is the URL where there is one
       and the lowercased title otherwise; see identity() in
       _capture.js. The pair is the primary key, so re-capturing a
       page updates prices in place rather than duplicating rows. */
    await sql`
      CREATE TABLE IF NOT EXISTS capture_products (
        merchant_key text        NOT NULL,
        identity     text        NOT NULL,
        captured_at  timestamptz NOT NULL DEFAULT now(),
        product_type text,
        vendor       text,
        title        text,
        price        numeric,
        data         jsonb       NOT NULL,
        PRIMARY KEY (merchant_key, identity)
      )`
    /* product_type is lifted out of `data` into its own column
       precisely because the histogram is the thing you read before
       writing an include list. Left inside the jsonb it would be a
       sequential scan of every row on every report. */
    await sql`
      CREATE INDEX IF NOT EXISTS capture_products_type
        ON capture_products (merchant_key, product_type)`
    /* What was captured, and — the half that matters more — what it
       admits it did not see. A capture holding 24 of 1,180 products
       looks exactly like a small catalogue unless the coverage is
       recorded alongside it. */
    await sql`
      CREATE TABLE IF NOT EXISTS capture_pages (
        merchant_key text        NOT NULL,
        url          text        NOT NULL,
        captured_at  timestamptz NOT NULL DEFAULT now(),
        found        integer,
        build        text,
        coverage     jsonb,
        PRIMARY KEY (merchant_key, url)
      )`
    return true
  })().catch(e => {
    /* Reset so a transient failure is retried rather than cached as
       a permanent "no database". A cold Neon branch can refuse the
       first connection while it wakes. */
    ready = null
    throw e
  })
  return ready
}

/**
 * Did a query actually work? NOT the same question as "is
 * DATABASE_URL set", and conflating the two is the exact bug this
 * codebase keeps writing up.
 *
 * `dbConfigured()` reads an environment variable. It says nothing
 * about whether the connection string is valid, the branch is
 * awake, the role can create tables, or the schema exists. Every
 * caller here catches its own errors and degrades to empty — which
 * is right, a report should not 500 because Neon is cold — but it
 * means a misconfigured database and an empty one produce byte-
 * identical output. "0 captured" would read as "you have not
 * started yet" when it actually meant "nothing you capture will
 * ever be saved".
 *
 * So this one does a real round trip and returns the error text.
 * It is the difference between the worklist saying "Neon,
 * configured" and it saying what is actually wrong.
 */
export async function dbHealth() {
  if (!sql) return { ok: false, error: 'DATABASE_URL is not set' }
  try {
    await ensureSchema()
    const rows = await sql`SELECT 1 AS ok`
    if (!rows || !rows[0]) return { ok: false, error: 'query returned nothing' }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: (e && e.message ? e.message : String(e)).slice(0, 300) }
  }
}

export async function q(fn) {
  if (!sql) return null
  await ensureSchema()
  return fn(sql)
}

/* ------------------------------------------------------------------
   kv — the catalogue cache. Same shape as Herbal Leaf's.
   TTL is an absolute expiry in epoch ms; a read treats an expired
   row as absent and deletes it lazily, which is Herbal Leaf's
   behaviour too. No cron, no vacuum job.
   ------------------------------------------------------------------ */

export async function kvGet(key) {
  try {
    const rows = await q(s => s`SELECT v, expires_at FROM kv WHERE k = ${key} LIMIT 1`)
    const row = rows && rows[0]
    if (!row) return null
    if (row.expires_at != null && Number(row.expires_at) < Date.now()) {
      kvDel(key).catch(() => {})
      return null
    }
    return row.v
  } catch { return null }
}

export async function kvPut(key, val, ttlSeconds) {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
  try {
    await q(s => s`
      INSERT INTO kv (k, v, expires_at) VALUES (${key}, ${val}, ${expiresAt})
      ON CONFLICT (k) DO UPDATE SET v = excluded.v, expires_at = excluded.expires_at`)
    return true
  } catch {
    /* Never fail a request because a cache write failed. */
    return false
  }
}

export async function kvDel(key) {
  try { await q(s => s`DELETE FROM kv WHERE k = ${key}`) } catch { /* best effort */ }
}
