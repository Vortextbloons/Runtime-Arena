import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Config ───────────────────────────────────────────
const LANGUAGE_IDS = ['cpp', 'go', 'javascript', 'lua', 'python', 'rust', 'typescript'];
const LANG_LABEL = { cpp: 'C++', go: 'Go', javascript: 'JS', lua: 'LuaJIT', python: 'Python', rust: 'Rust', typescript: 'TS' };
const SIZE_ORDER = ['small', 'medium', 'large'];
const PERF_EXPONENT = 0.65;
const PERF_FLOOR = 0.1;
const SCORE_WEIGHTS = { performance: 0.75, versatility: 0.25 };

// ── Scoring helpers ──────────────────────────────────
const geometricMean = (values) =>
  values.length && values.every(v => Number.isFinite(v) && v > 0)
    ? Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / values.length)
    : 0;
const average = (values) => values.reduce((s, v) => s + v, 0) / values.length;
const medianNs = (summary) => summary.medianIterationTimeNanoseconds ?? summary.medianKernelTimeNanoseconds ?? 0;
const clampScore = (v) => Math.max(0, Math.min(100, v));
const normalizeScore = (v) => Math.round(clampScore(v) * 1e9) / 1e9;
const performanceScore = (fastest, median) =>
  Math.max(PERF_FLOOR, normalizeScore(100 * Math.pow(fastest / median, PERF_EXPONENT)));
const variantKey = (size, mutation) => (mutation ? `${size}/${mutation}` : size);
const completeResult = (r) =>
  r && r.checker.status === 'accepted' && r.execution.summary.validSamples === r.execution.measuredIterations;

// ── Load data ────────────────────────────────────────
const data = JSON.parse(readFileSync(resolve(root, 'results', 'current.json'), 'utf-8'));
const results = data.results;
const readme = readFileSync(resolve(root, 'README.md'), 'utf-8');

// ── Machine info ─────────────────────────────────────
const p = results[0].provenance;
const cpu = `${p.machine.cpu.model.replace(/\s+/g, ' ').trim()} (${p.machine.cpu.logicalCores} cores)`;
const os = p.machine.operatingSystem.platform;
const mem = (p.machine.memoryBytes / 1e9).toFixed(1) + ' GB RAM';
const date = data.updatedAt.slice(0, 10);

const total = results.length;
const accepted = results.filter(r => r.checker.status === 'accepted').length;

// ── Index results ────────────────────────────────────
const byBenchmark = {};
for (const r of results) {
  const b = r.benchmark.id;
  if (!byBenchmark[b]) byBenchmark[b] = [];
  byBenchmark[b].push(r);
}

const benchmarkIds = Object.keys(byBenchmark).sort();
const languages = [...new Set(results.map(r => r.language.id))];

// ── Score each benchmark ─────────────────────────────
function scoreBenchmark(benchmarkId) {
  const cohort = byBenchmark[benchmarkId];
  const sizes = [...new Set(cohort.map(r => r.benchmark.size))].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
  );
  const mutationsBySize = {};
  for (const r of cohort) {
    const size = r.benchmark.size;
    const mut = r.benchmark.mutation || '';
    if (!mutationsBySize[size]) mutationsBySize[size] = [];
    if (!mutationsBySize[size].includes(mut)) mutationsBySize[size].push(mut);
  }

  const fastestByVariant = {};
  for (const size of sizes) {
    for (const mut of (mutationsBySize[size] || [''])) {
      const key = variantKey(size, mut || undefined);
      const medians = cohort
        .filter(r => r.benchmark.size === size && (r.benchmark.mutation || '') === mut && completeResult(r))
        .map(r => medianNs(r.execution.summary))
        .filter(m => Number.isFinite(m) && m > 0);
      const fastest = medians.length ? Math.min(...medians) : 0;
      if (fastest > 0) fastestByVariant[key] = fastest;
    }
  }

  const rankedSizes = sizes.filter(size =>
    (mutationsBySize[size] || ['']).every(mut => fastestByVariant[variantKey(size, mut || undefined)])
  );

  const scores = {};
  for (const lang of languages) {
    const langResults = {};
    for (const r of cohort.filter(r => r.language.id === lang)) {
      langResults[variantKey(r.benchmark.size, r.benchmark.mutation)] = r;
    }

    let eligible = true;
    for (const size of sizes) {
      for (const mut of (mutationsBySize[size] || [''])) {
        const k = variantKey(size, mut || undefined);
        if (!langResults[k] || !completeResult(langResults[k])) { eligible = false; break; }
      }
      if (!eligible) break;
    }
    if (!rankedSizes.length) eligible = false;
    if (!eligible) { scores[lang] = null; continue; }

    const sizeScores = rankedSizes.map(size => {
      const mutScores = (mutationsBySize[size] || ['']).map(mut => {
        const r = langResults[variantKey(size, mut || undefined)];
        const med = medianNs(r.execution.summary);
        const perf = performanceScore(fastestByVariant[variantKey(size, mut || undefined)], med);
        const dev = r.execution.summary.standardDeviationKernelTimeNanoseconds || 0;
        const mean = r.execution.summary.meanKernelTimeNanoseconds || med;
        const variation = mean > 0 ? dev / mean : 0;
        const consistency = Math.max(0, Math.min(100, 100 - variation * 400));
        return { performance: perf, consistency };
      });
      return {
        performance: normalizeScore(geometricMean(mutScores.map(s => s.performance))),
        consistency: average(mutScores.map(s => s.consistency)),
      };
    });

    scores[lang] = {
      performance: normalizeScore(geometricMean(sizeScores.map(s => s.performance))),
      consistency: average(sizeScores.map(s => s.consistency)),
      eligible: true,
    };
  }
  return scores;
}

// ── Compute overall ──────────────────────────────────
const benchmarkScores = {};
let eligibleBenchmarks = [];
for (const b of benchmarkIds) {
  const sc = scoreBenchmark(b);
  benchmarkScores[b] = sc;
  if (Object.values(sc).some(s => s !== null)) eligibleBenchmarks.push(b);
}

// ── Count wins (fastest per benchmark×mutation at each size) ──
const wins = {};
for (const l of languages) wins[l] = 0;
const seen = new Set();
for (const r of results) {
  const key = `${r.benchmark.id}||${r.benchmark.size}||${r.benchmark.mutation || ''}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const cohort = results.filter(x =>
    x.benchmark.id === r.benchmark.id &&
    x.benchmark.size === r.benchmark.size &&
    (x.benchmark.mutation || '') === (r.benchmark.mutation || '')
  );
  let min = Infinity, best = null;
  for (const c of cohort) {
    if (!completeResult(c)) continue;
    const t = medianNs(c.execution.summary);
    if (t < min) { min = t; best = c.language.id; }
  }
  if (best) wins[best]++;
}

const overallScores = languages.map(lang => {
  const byBench = benchmarkIds.map(b => ({ benchmarkId: b, score: benchmarkScores[b][lang] }));
  const eligible = byBench.filter(e => e.score !== null).map(e => e.score);
  if (!eligible.length) return { lang, overall: null, performance: null, versatility: null, consistency: null, wins: 0, eligible: false };

  const performance = normalizeScore(geometricMean(eligible.map(e => e.performance)));
  const consistency = average(eligible.map(e => e.consistency));
  const bp = eligible.map(e => e.performance);
  const versatility = normalizeScore(0.6 * Math.min(...bp) + 0.4 * average(bp));
  const overall = normalizeScore(performance * SCORE_WEIGHTS.performance + versatility * SCORE_WEIGHTS.versatility);
  return { lang, overall, performance, versatility, consistency, wins: wins[lang] || 0, eligible: true };
});

const ranked = overallScores
  .filter(s => s.eligible)
  .sort((a, b) => b.overall - a.overall);

// ── Build markdown ───────────────────────────────────
const table = [
  '| # | Language | Overall | Perf | Versatility | Fastest |',
  '|---|----------|---------|------|-------------|---------|',
  ...ranked.map((r, i) =>
    `| ${i + 1} | ${LANG_LABEL[r.lang] || r.lang} | ${r.overall.toFixed(1)} | ${r.performance.toFixed(1)} | ${r.versatility.toFixed(1)} | ${r.wins} |`
  ),
].join('\n');

const section = `
## Latest Results

_${accepted}/${total} cells validated ✓ · Updated ${date}_  

${table}

_Overall = 75% performance × 25% versatility (0–100). "Fastest" = benchmark×mutation cells where language had lowest median time. Tested on ${cpu} · ${os} · ${mem}._
`;

// ── Replace in README ────────────────────────────────
const startMarker = '<!-- RESULTS START -->';
const endMarker = '<!-- RESULTS END -->';

let newReadme;
if (readme.includes(startMarker) && readme.includes(endMarker)) {
  newReadme = readme.replace(
    new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm'),
    `${startMarker}\n${section.trim()}\n${endMarker}`
  );
} else {
  newReadme = readme + `\n\n${startMarker}\n${section.trim()}\n${endMarker}\n`;
}

writeFileSync(resolve(root, 'README.md'), newReadme, 'utf-8');
console.log('README.md updated with latest results.');
