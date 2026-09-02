/**
 * Apply one SQL migration file to the database in DATABASE_URL.
 *
 *   node scripts/apply-migration.mjs supabase/migrations/024_posts_biodata_facets.sql
 *
 * There is no psql on this machine and supabase-js cannot run DDL, so this is
 * the smallest thing that closes that gap. It runs the file as a single
 * transaction: a migration that fails half way leaves nothing behind.
 *
 * The migrations in this repo are written to be idempotent (ADD COLUMN IF NOT
 * EXISTS, CREATE INDEX IF NOT EXISTS), so re-running one is safe.
 */
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path/to/migration.sql>');
  process.exit(1);
}

function loadEnv(f) {
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL must be set (.env.local).');
  process.exit(1);
}

const sql = await readFile(path.resolve(file), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`applied ${path.basename(file)}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`FAILED, rolled back: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
