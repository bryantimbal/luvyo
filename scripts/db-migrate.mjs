// Apply supabase/migrations/*.sql in order, once each.
//   DATABASE_URL=postgres://... node scripts/db-migrate.mjs
// Local Postgres (no Supabase): add --auth-stub to create a minimal `auth`
// schema (auth.users, auth.uid()). Never needed on Supabase, which has its own.
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

export async function migrate(databaseUrl, { authStub = false, log = console.log } = {}) {
  const client = new pg.Client({ connectionString: databaseUrl, ssl: sslFor(databaseUrl) });
  await client.connect();
  try {
    const hasAuth = (await client.query("select 1 from information_schema.schemata where schema_name = 'auth'")).rowCount > 0;
    if (!hasAuth) {
      if (!authStub) throw new Error('No `auth` schema. Use a Supabase database, or pass --auth-stub for a local Postgres.');
      await client.query(`
        create schema auth;
        create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, created_at timestamptz default now());
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
      log('created local auth stub');
    }
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, f), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
        log(`applied ${f}`);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${f}: ${e.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

/** Supabase and most hosts require TLS; local Postgres usually doesn't. */
export function sslFor(url) {
  return /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? false : { rejectUnauthorized: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Set DATABASE_URL'); process.exit(1); }
  migrate(url, { authStub: process.argv.includes('--auth-stub') }).then(() => console.log('migrations up to date')).catch((e) => { console.error(e.message); process.exit(1); });
}
