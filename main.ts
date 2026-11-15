// Lucid Horizon radar-3: the entrypoint.
//
// Reads the sealed snapshot, ranks the protocols that record no token by
// their implied launch value, writes the board, the dashboard's data, and
// the dossier. Node 22, standard library only, no network. Two runs write
// the same bytes: the input is fixed, the sort has a total order, and no
// timestamp or random value is ever written.
//
//   node main.ts [--input /input/snapshot.json]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  ageDays,
  farmSteps,
  impliedValue,
  isBoardEligible,
  recordsNoToken,
  type Snapshot,
  type SnapshotProtocol,
} from './lib/model.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string, fallback: string): string {
  const at = process.argv.indexOf(flag);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  return fallback;
}

function fail(message: string): never {
  throw new Error(`radar-3: ${message}`);
}

interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  tvl_usd: number;
  change_7d: number | null;
  category: string | null;
  chains: string[];
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  token_status: string;
  model: {
    base: number;
    growth: number;
    maturity: number;
    chain: number;
    category: number;
  };
}

function main(): void {
  const inputPath = argValue('--input', '/input/snapshot.json');
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const snapshot = JSON.parse(
    readFileSync(inputPath, 'utf8'),
  ) as Snapshot;
  const asOf = new Date(`${snapshot.as_of}T00:00:00Z`);
  const watchlist = new Set(snapshot.watchlist);

  // The board: protocols that record no token and are not a wrapped,
  // staked or bridged product of one that trades. Ranked by implied
  // launch value; ties break on TVL, then slug, so the order is total.
  const eligible = snapshot.protocols.filter(isBoardEligible);
  const ranked = eligible
    .map((p) => ({ protocol: p, scored: impliedValue(p, asOf) }))
    .sort((a, b) => {
      if (b.scored.value !== a.scored.value) return b.scored.value - a.scored.value;
      if (b.protocol.tvl_usd !== a.protocol.tvl_usd) {
        return b.protocol.tvl_usd - a.protocol.tvl_usd;
      }
      return a.protocol.slug < b.protocol.slug ? -1 : 1;
    });

  const rows: BoardRow[] = ranked.map(({ protocol: p, scored }, index) => ({
    slug: p.slug,
    name: p.name,
    rank: index + 1,
    implied_value_usd: scored.value,
    farm_steps: farmSteps(p),
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    category: p.category,
    chains: p.chains,
    listed_at: p.listed_at,
    age_days: ageDays(p, asOf),
    watchlist: watchlist.has(p.slug),
    token_status: 'records-no-token',
    model: {
      base: scored.parts.base,
      growth: round4(scored.parts.growth),
      maturity: round4(scored.parts.maturity),
      chain: round4(scored.parts.chain),
      category: round4(scored.parts.category),
    },
  }));

  // The gate's own checks, run here first so a bad board fails loudly.
  if (rows.length < 100 || rows.length > 4000) {
    fail(`board holds ${rows.length} rows, outside 100..4000`);
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.rank !== i + 1) fail(`row ${row.slug} has rank ${row.rank}, expected ${i + 1}`);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      fail(`row ${row.slug} has implied value ${row.implied_value_usd}`);
    }
    if (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      fail(`implied value rises at rank ${row.rank}`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      fail(`row ${row.slug} has ${row.farm_steps.length} farm steps`);
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        fail(`row ${row.slug} has a farm step of ${trimmed.length} chars`);
      }
    }
  }
  const covered = snapshot.watchlist.filter((slug) =>
    rows.some((row) => row.slug === slug),
  ).length;
  if (covered !== snapshot.watchlist.length) {
    fail(`watchlist coverage ${covered}/${snapshot.watchlist.length}`);
  }

  // The other side of the radar: protocols whose token already trades,
  // shown apart from the board so a reader never confuses the two.
  const launched = snapshot.protocols
    .filter((p) => !recordsNoToken(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 25)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(0, 4),
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
    }));

  const board = {
    title: 'Lucid Horizon — Token Launch Radar',
    model: 'radar-3',
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    protocols_scanned: snapshot.protocols.length,
    records_no_token: snapshot.protocols.filter(recordsNoToken).length,
    watchlist_size: snapshot.watchlist.length,
    rows,
  };

  const dashboardData = {
    title: 'Lucid Horizon — Token Launch Radar',
    model: 'radar-3',
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocols_scanned: snapshot.protocols.length,
    records_no_token: snapshot.protocols.filter(recordsNoToken).length,
    watchlist_size: snapshot.watchlist.length,
    rows,
    launched,
  };

  mkdirSync(outDir, { recursive: true });
  for (const name of ['board.json', 'data.js', 'dossier.json']) {
    const path = join(outDir, name);
    if (existsSync(path)) rmSync(path);
  }
  for (const name of ['dashboard', 'screenshots']) {
    const path = join(outDir, name);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }

  writeFileSync(
    join(outDir, 'board.json'),
    `${JSON.stringify(board, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(outDir, 'data.js'),
    `window.RADAR_DATA = ${JSON.stringify(dashboardData)};\n`,
    'utf8',
  );
  cpSync(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'), {
    recursive: true,
  });
  cpSync(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'), {
    recursive: true,
  });

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  console.log(
    `radar-3: ${rows.length} rows, watchlist ${covered}/${snapshot.watchlist.length}, ` +
      `rank 1 ${first.slug} $${first.implied_value_usd.toLocaleString('en-US')}, ` +
      `last ${last.slug} $${last.implied_value_usd.toLocaleString('en-US')}, ` +
      `dossier ${dossier.length} bytes`,
  );
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

main();
