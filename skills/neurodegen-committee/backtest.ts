#!/usr/bin/env -S npx tsx
/**
 * Runnable backtest entry point. Reads the fixtures file + LLM cache, replays
 * the Skill, and prints a metrics report.
 *
 * Usage:
 *   npx tsx backtest.ts
 *   npx tsx backtest.ts --fixture custom.json --cache custom-cache.json --out run.json
 */
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BACKTEST_CONFIG,
  runBacktest,
  type Fixture,
  type LlmCache,
} from './backtest/harness';
import { renderReport, summarize } from './backtest/report';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Args {
  fixture: string;
  cache: string;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  let fixture = 'backtest/fixtures/bsc-2025-q4.json';
  let cache = 'backtest/llm-cache.json';
  let out: string | null = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixture') fixture = argv[++i];
    else if (a === '--cache') cache = argv[++i];
    else if (a === '--out') out = argv[++i];
  }
  return { fixture, cache, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const fixturePath = resolve(__dirname, args.fixture);
  const cachePath = resolve(__dirname, args.cache);

  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as Fixture;
  const cacheRaw = JSON.parse(await fs.readFile(cachePath, 'utf8')) as LlmCache;
  // Strip the `_comment` key so it doesn't interfere with lookups.
  const cache: LlmCache = {};
  for (const [k, v] of Object.entries(cacheRaw)) {
    if (k.startsWith('_')) continue;
    cache[k] = v;
  }

  console.log(
    `Replaying ${fixture.bars.length} bars from ${fixture.startedAt} to ${fixture.endedAt}`,
  );

  const run = await runBacktest(fixture, cache, DEFAULT_BACKTEST_CONFIG);
  const report = summarize(run);

  console.log('\n=== NeuroDegen Committee Backtest ===');
  console.log(renderReport(report));
  console.log('\nFinal equity: $' + run.finalEquityUsd.toFixed(2));
  console.log('Peak equity:  $' + run.peakEquityUsd.toFixed(2));

  if (args.out) {
    const outPath = resolve(__dirname, args.out);
    await fs.writeFile(outPath, JSON.stringify({ report, run }, null, 2));
    console.log(`\nWrote full run to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
