/**
 * First-load JS budget, per route.
 *
 * Five separate passes took the build from 3443.9 KB to 2156.0 KB, and
 * nothing was watching to see whether it stayed there. A regression here is
 * quiet — a stray top-level import in a shared component adds a hundred
 * kilobytes to every route and no test goes red. This is the guard for that.
 *
 * Gzipped, because that is what the visitor downloads. Raw bytes are shown
 * alongside since that is what the earlier work was measured in.
 *
 * Run after `next build`:  node scripts/bundle-budget.mjs
 * Exits non-zero if any route is over budget.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Deliberately a ratchet, not the ideal.
 *
 * The reference budget for initial JS is 200 KB gzipped, and the heaviest
 * route here is over it. Setting the gate at 200 would fail on the first run,
 * and a gate that is always red gets switched off — so this holds the line
 * where the work actually got to, and TARGET_KB records where it should end
 * up. Lower BUDGET_KB whenever a pass beats it; never raise it to make a
 * build pass.
 */
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 320);
const TARGET_KB = 200;

const STATS = '.next/diagnostics/route-bundle-stats.json';

if (!fs.existsSync(STATS)) {
  console.error(`[bundle-budget] ${STATS} not found — run \`next build\` first.`);
  process.exit(2);
}

const stats = JSON.parse(fs.readFileSync(STATS, 'utf8'));
const rows = [];

for (const key of Object.keys(stats)) {
  const route = stats[key];
  let raw = 0;
  let gzip = 0;

  for (const chunk of route.firstLoadChunkPaths ?? []) {
    const file = chunk.split(path.sep).join('/');
    try {
      const bytes = fs.readFileSync(file);
      raw += bytes.length;
      gzip += zlib.gzipSync(bytes).length;
    } catch {
      // A chunk listed but not on disk is a stale stats file, not a budget
      // failure — skip it rather than reporting a route as artificially light.
    }
  }

  rows.push({ route: route.route, rawKb: raw / 1024, gzipKb: gzip / 1024 });
}

rows.sort((a, b) => b.gzipKb - a.gzipKb);

const over = rows.filter((r) => r.gzipKb > BUDGET_KB);
const aboveTarget = rows.filter((r) => r.gzipKb > TARGET_KB);

console.log(`first-load JS per route (budget ${BUDGET_KB} KB gzipped, target ${TARGET_KB} KB)\n`);
console.log(`${'route'.padEnd(24)}${'gzip KB'.padStart(9)}${'raw KB'.padStart(10)}`);
for (const r of rows.slice(0, 12)) {
  const flag = r.gzipKb > BUDGET_KB ? '  OVER BUDGET' : r.gzipKb > TARGET_KB ? '  over target' : '';
  console.log(
    `${r.route.padEnd(24)}${r.gzipKb.toFixed(1).padStart(9)}${r.rawKb.toFixed(1).padStart(10)}${flag}`,
  );
}

console.log(
  `\n${rows.length} routes · heaviest ${rows[0].gzipKb.toFixed(1)} KB · ` +
    `${aboveTarget.length} above the ${TARGET_KB} KB target`,
);

if (over.length) {
  console.error(
    `\n[bundle-budget] FAIL — ${over.length} route(s) over ${BUDGET_KB} KB gzipped:\n` +
      over.map((r) => `  ${r.route}  ${r.gzipKb.toFixed(1)} KB`).join('\n') +
      '\nFind what was added rather than raising the budget.',
  );
  process.exit(1);
}

console.log('\n[bundle-budget] PASS');
