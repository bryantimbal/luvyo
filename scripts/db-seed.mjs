// Load a dataset JSON into PostgreSQL / Supabase (reference data + settings).
//   DATABASE_URL=postgres://... node scripts/db-seed.mjs [path/to/dataset.json]
// Defaults to data/dev/dataset.json. Safe to re-run: records are upserted by id.
// Rider data (contributions, contributors, reports) is never seeded.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PgRepository } from '../server/pgRepository.js';

export async function seed(databaseUrl, file, log = console.log) {
  const ds = JSON.parse(readFileSync(file, 'utf8'));
  const repo = new PgRepository(databaseUrl);
  await repo.ready;
  await repo.importDataset(ds, { log: (m) => log('  ' + m) });
  const counts = { stops: repo.list('stops').length, lines: repo.list('lines').length, fareSchedules: repo.list('fareSchedules').length, places: repo.list('places').length };
  await repo.close();
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Set DATABASE_URL'); process.exit(1); }
  const file = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dev', 'dataset.json');
  console.log(`Seeding from ${file}`);
  seed(url, file).then((c) => console.log('done:', c)).catch((e) => { console.error(e.message); process.exit(1); });
}
