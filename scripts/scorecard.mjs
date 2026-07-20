import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Constants (mirrored from scoring.ts / tiers.ts / cards) ────
const SIZE_ORDER = ['small', 'medium', 'large'];
const SIZE_LABEL = { small: 'S', medium: 'M', large: 'L' };
const PERF_EXPONENT = 0.65;
const PERF_FLOOR = 0.1;
const SCORE_WEIGHTS = { performance: 0.75, versatility: 0.25 };
const LANGUAGE_MONOGRAMS = { rust: 'RS', go: 'GO', java: 'JV', javascript: 'JS', typescript: 'TS', python: 'PY', lua: 'LJ', luajit: 'LJ', 'c++': 'C++', cpp: 'C++', cplusplus: 'C++' };
const LANG_LABEL = { cpp: 'C++', go: 'Go', java: 'Java', javascript: 'JavaScript', lua: 'LuaJIT', python: 'Python', rust: 'Rust', typescript: 'TypeScript' };

// ── Math helpers ──────────────────────────────────────
const geometricMean = (values) =>
  values.length && values.every(v => Number.isFinite(v) && v > 0)
    ? Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / values.length)
    : 0;
const average = (values) => values.reduce((s, v) => s + v, 0) / values.length;
const clampScore = (v) => Math.max(0, Math.min(100, v));
const normalizeScore = (v) => Math.round(clampScore(v) * 1e9) / 1e9;
const performanceScore = (fastest, median) =>
  Math.max(PERF_FLOOR, normalizeScore(100 * Math.pow(fastest / median, PERF_EXPONENT)));
const variantKey = (size, mutation) => (mutation ? `${size}/${mutation}` : size);
const completeResult = (r) =>
  r && r.checker.status === 'accepted' && r.execution.summary.validSamples === r.execution.measuredIterations;

// ── Tier definitions ──────────────────────────────────
const TIERS = [
  { min: 100, name: 'FLAWLESS', gem: 'Dark Matter', tag: 'DM', level: 9 },
  { min: 99,  name: 'TRANSCENDENT', gem: 'Prismatic Opal', tag: 'PO', level: 8 },
  { min: 95,  name: 'UNTOUCHABLE', gem: 'Galaxy Opal', tag: 'GO', level: 7 },
  { min: 90,  name: 'INVINCIBLE', gem: 'Pink Diamond', tag: 'PD', level: 6 },
  { min: 80,  name: 'DOMINANT', gem: 'Diamond', tag: 'DIA', level: 5 },
  { min: 70,  name: 'ELITE', gem: 'Amethyst', tag: 'AME', level: 4 },
  { min: 60,  name: 'STANDARD', gem: 'Ruby', tag: 'RUB', level: 3 },
  { min: 45,  name: 'ROOKIE', gem: 'Sapphire', tag: 'SAP', level: 2 },
  { min: 0,   name: 'COMMON', gem: 'Emerald', tag: 'EME', level: 1 },
];

const getScoreTier = (score) => {
  if (score === null) return { name: 'UNVERIFIED', gem: 'No Rank', tag: '—', level: 0 };
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
};

const getCardTierLetter = (score) => {
  if (score === null) return '—';
  if (score >= 95) return 'S+';
  if (score >= 90) return 'S';
  if (score >= 85) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
};

const monogram = (lang) => LANGUAGE_MONOGRAMS[lang.id?.toLowerCase()] || (LANG_LABEL[lang.id] || lang.name).slice(0, 2).toUpperCase();

// ── Format helpers ────────────────────────────────────
const formatNs = (ns) => {
  if (ns < 1e6) return `${(ns / 1e3).toFixed(1)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(3)} s`;
};

const bar = (value, max) => {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const filled = Math.round(pct * 20);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
};

// ── Percentile rank (from cards/util.ts) ─────────────
const percentileRank = (value, field) => {
  if (field.length <= 1) return 100;
  let betterCount = 0;
  let tiedCount = 0;
  for (const other of field) {
    if (other < value) betterCount += 1;
    else if (other === value) tiedCount += 1;
  }
  tiedCount = Math.max(0, tiedCount - 1);
  return normalizeScore((100 * (betterCount + 0.5 * tiedCount)) / (field.length - 1));
};

// ── Badge system ──────────────────────────────────────
const BADGE_TIER_ORDER = ['bronze', 'silver', 'gold', 'hall-of-fame', 'legend'];
const BADGE_TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', 'hall-of-fame': 'Hall of Fame', legend: 'Legend' };
const BADGE_OVR_BONUS = { bronze: 0.5, silver: 1.0, gold: 1.5, 'hall-of-fame': 2.0, legend: 2.5 };
const HYBRID_TIER_THRESHOLDS = [
  { tier: 'legend', minimumScore: 97, minimumPercentile: 85 },
  { tier: 'hall-of-fame', minimumScore: 94, minimumPercentile: 70 },
  { tier: 'gold', minimumScore: 90, minimumPercentile: 55 },
  { tier: 'silver', minimumScore: 85, minimumPercentile: 40 },
  { tier: 'bronze', minimumScore: 78, minimumPercentile: 25 },
];

const V1_BADGE_DEFINITIONS = [
  { id: 'speedster',         name: 'Speedster',         category: 'execution',    source: 'SPD', legendRequiresFirstOverall: true },
  { id: 'compute-finisher',  name: 'Compute Finisher',   category: 'execution',    source: 'CMP', benchmarkId: 'nbody', legendRequiresSizeSweep: true },
  { id: 'data-handler',      name: 'Data Wrangler',      category: 'control',      source: 'DAT', benchmarkId: 'aggregation', legendRequiresSizeSweep: true },
  { id: 'pathfinder',        name: 'Pathfinder',         category: 'control',      source: 'ALG', benchmarkId: 'shortest-path', legendRequiresSizeSweep: true },
  { id: 'steady-hands',      name: 'Steady Hands',       category: 'reliability',  source: 'CON', legendRequiresCategoryWin: true },
  { id: 'scale-master',      name: 'Scale Master',       category: 'physical',     source: 'SCL', legendRequiresCategoryWin: true },
];

// ── Load data ────────────────────────────────────────
const data = JSON.parse(readFileSync(resolve(root, 'results', 'current.json'), 'utf-8'));
const results = data.results;
const snapshotId = data.snapshotId;
const updatedAt = data.updatedAt;
const arenaVersion = data.arenaVersion;
const gitCommit = data.gitCommit;

// ── Machine info ─────────────────────────────────────
const p = results[0].provenance;
const cpu = `${p.machine.cpu.model.replace(/\s+/g, ' ').trim()} (${p.machine.cpu.logicalCores} logical cores)`;
const os = p.machine.operatingSystem.platform + ' ' + p.machine.operatingSystem.release;
const mem = (p.machine.memoryBytes / 1e9).toFixed(1) + ' GB';

// ── Index results ────────────────────────────────────
const byBenchmark = {};
for (const r of results) {
  const b = r.benchmark.id;
  if (!byBenchmark[b]) byBenchmark[b] = [];
  byBenchmark[b].push(r);
}
const benchmarkIds = Object.keys(byBenchmark).sort();
const languages = [...new Set(results.map(r => r.language.id).filter(id => !!results.find(r => r.language.id === id)))];

const languageInfo = {};
for (const r of results) {
  languageInfo[r.language.id] = r.language;
}

const total = results.length;
const accepted = results.filter(r => r.checker.status === 'accepted').length;

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
        .map(r => r.execution.summary.medianKernelTimeNanoseconds)
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
    if (!eligible) {
      scores[lang] = { eligible: false, performance: null, consistency: null, sizeScores: [] };
      continue;
    }

    const sizeScores = rankedSizes.map(size => {
      const mutScores = (mutationsBySize[size] || ['']).map(mut => {
        const r = langResults[variantKey(size, mut || undefined)];
        const med = r.execution.summary.medianKernelTimeNanoseconds;
        const fastest = fastestByVariant[variantKey(size, mut || undefined)];
        const perf = performanceScore(fastest, med);
        const dev = r.execution.summary.standardDeviationKernelTimeNanoseconds || 0;
        const mean = r.execution.summary.meanKernelTimeNanoseconds || med;
        const variation = mean > 0 ? dev / mean : 0;
        const consistency = Math.max(0, Math.min(100, 100 - variation * 400));
        return {
          mutation: mut || null, medianNs: med, fastestNs: fastest,
          relativeSpeed: med / fastest, performance: perf, consistency, result: r,
        };
      });
      return {
        size, mutations: mutScores,
        medianNs: average(mutScores.map(s => s.medianNs)),
        fastestNs: average(mutScores.map(s => s.fastestNs)),
        performance: normalizeScore(geometricMean(mutScores.map(s => s.performance))),
        consistency: average(mutScores.map(s => s.consistency)),
      };
    });

    scores[lang] = {
      eligible: true,
      performance: normalizeScore(geometricMean(sizeScores.map(s => s.performance))),
      consistency: average(sizeScores.map(s => s.consistency)),
      sizeScores,
    };
  }
  return { benchmarkId, scores, sizes: rankedSizes, expectedSizes: sizes, mutationsBySize, fastestByVariant };
}

// ── Score all benchmarks ────────────────────────────
const benchmarkData = {};
for (const b of benchmarkIds) {
  benchmarkData[b] = scoreBenchmark(b);
}

// ── Compute overall scores ──────────────────────────
const overallScores = languages.map(lang => {
  const byBench = benchmarkIds.map(b => ({ benchmarkId: b, score: benchmarkData[b].scores[lang] }));
  const eligible = byBench.filter(e => e.score?.eligible).map(e => e.score);
  if (!eligible.length) return { lang, overall: null, performance: null, versatility: null, consistency: null, eligible: false, benchScores: byBench };

  const perf = normalizeScore(geometricMean(eligible.map(e => e.performance)));
  const cons = average(eligible.map(e => e.consistency));
  const bp = eligible.map(e => e.performance);
  const versatility = normalizeScore(0.6 * Math.min(...bp) + 0.4 * average(bp));
  const overall = normalizeScore(perf * SCORE_WEIGHTS.performance + versatility * SCORE_WEIGHTS.versatility);
  return { lang, overall, performance: perf, versatility, consistency: cons, eligible: true, benchScores: byBench };
});

const ranked = overallScores
  .filter(s => s.eligible)
  .sort((a, b) => b.overall - a.overall || a.lang.localeCompare(b.lang));

const unranked = overallScores.filter(s => !s.eligible);

// ── Compute attribute ratings for badges ─────────────

// Scalability per benchmark: (min size perf / max size perf) × 100
function benchmarkScalability(benchScore) {
  if (!benchScore?.eligible || !benchScore.sizeScores.length) return null;
  const perfs = benchScore.sizeScores.map(s => s.performance).filter(v => Number.isFinite(v));
  if (perfs.length < 2) return null;
  const mn = Math.min(...perfs);
  const mx = Math.max(...perfs);
  if (mx <= 0) return null;
  return normalizeScore((mn / mx) * 100);
}

// Overall scalability: average of all benchmark scalabilities
function overallScalability(sc) {
  const values = [];
  for (const entry of sc.benchScores) {
    const scalar = benchmarkScalability(entry.score);
    if (scalar !== null) values.push(scalar);
  }
  if (!values.length) return null;
  return normalizeScore(average(values));
}

// Build attribute rating map per language
// Returns { SPD, CMP, DAT, ALG, CON, SCL }
function buildAttributeRatings(overallScore, benchScoresById) {
  const attr = {};

  // SPD = overall performance
  attr.SPD = overallScore.eligible ? overallScore.performance : null;

  // CMP = nbody benchmark performance
  const nbodyScores = benchScoresById.nbody;
  const nbodyOwn = nbodyScores?.find(s => s.lang === overallScore.lang);
  attr.CMP = nbodyOwn?.eligible ? nbodyOwn.performance : null;

  // DAT = aggregation benchmark performance
  const aggScores = benchScoresById.aggregation;
  const aggOwn = aggScores?.find(s => s.lang === overallScore.lang);
  attr.DAT = aggOwn?.eligible ? aggOwn.performance : null;

  // ALG = shortest-path benchmark performance
  const spScores = benchScoresById['shortest-path'];
  const spOwn = spScores?.find(s => s.lang === overallScore.lang);
  attr.ALG = spOwn?.eligible ? spOwn.performance : null;

  // CON = overall consistency
  attr.CON = overallScore.eligible ? overallScore.consistency : null;

  // SCL = average scalability across benchmarks
  attr.SCL = overallScalability(overallScore);

  return attr;
}

// Build benchScoresById for badge attribute calculation
const benchScoresById = {};
for (const bid of benchmarkIds) {
  benchScoresById[bid] = languages.map(lang => {
    const sc = benchmarkData[bid].scores[lang];
    return { lang, ...sc };
  });
}

// Collect all per-language attributes
const allAttributes = {}; // lang -> { SPD, CMP, DAT, ALG, CON, SCL }
for (const s of overallScores) {
  allAttributes[s.lang] = buildAttributeRatings(s, benchScoresById);
}

// Hybrid qualification score
function hybridQualificationScore(absoluteScore, fieldScores) {
  if (fieldScores.length >= 3) {
    const percentile = percentileRank(absoluteScore, fieldScores);
    return {
      qualificationScore: normalizeScore(0.55 * absoluteScore + 0.45 * percentile),
      percentile,
      usesPercentile: true
    };
  }
  return {
    qualificationScore: normalizeScore(absoluteScore),
    percentile: undefined,
    usesPercentile: false
  };
}

function nextTierAfter(tier) {
  const idx = BADGE_TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= BADGE_TIER_ORDER.length - 1) return undefined;
  return BADGE_TIER_ORDER[idx + 1];
}

function tierSatisfied(tier, absoluteScore, qualificationScore, percentile, usesPercentile) {
  const rule = HYBRID_TIER_THRESHOLDS.find(e => e.tier === tier);
  if (!rule) return false;
  if (absoluteScore < rule.minimumScore) return false;
  if (qualificationScore < rule.minimumScore) return false;
  if (usesPercentile && rule.minimumPercentile !== undefined && (percentile === undefined || percentile < rule.minimumPercentile))
    return false;
  return true;
}

function languageHasSizeSweep(lang, benchId, benchScoresById) {
  const scores = benchScoresById[benchId];
  if (!scores) return false;
  const candidate = scores.find(s => s.lang === lang);
  if (!candidate?.eligible || !candidate.sizeScores.length) return false;
  for (const size of candidate.sizeScores) {
    const best = Math.max(
      ...scores
        .filter(s => s.eligible)
        .map(s => s.sizeScores.find(e => e.size === size.size)?.performance ?? -Infinity)
    );
    if (size.performance < best) return false;
  }
  return true;
}

function isFirstOverall(lang) {
  const eligible = overallScores.filter(s => s.eligible && s.overall !== null);
  if (!eligible.length) return false;
  const best = Math.max(...eligible.map(s => s.overall));
  const own = eligible.find(s => s.lang === lang);
  return own?.overall === best;
}

function isCategoryWin(lang, source, allAttributes) {
  const own = allAttributes[lang]?.[source];
  if (own === null || own === undefined) return false;
  const all = Object.values(allAttributes)
    .map(a => a[source])
    .filter(v => v !== null && v !== undefined);
  if (!all.length) return false;
  return own >= Math.max(...all);
}

function awardBadge(definition, lang, allAttributes, benchScoresById) {
  const absoluteScore = allAttributes[lang]?.[definition.source];
  if (absoluteScore === null || absoluteScore === undefined) return null;

  const fieldScores = Object.values(allAttributes)
    .map(a => a[definition.source])
    .filter(v => v !== null && v !== undefined);
  const { qualificationScore, percentile, usesPercentile } = hybridQualificationScore(absoluteScore, fieldScores);

  // Determine tier
  let awarded = null;
  for (const { tier } of HYBRID_TIER_THRESHOLDS) {
    if (tier === 'legend') {
      const legendRule = HYBRID_TIER_THRESHOLDS.find(e => e.tier === 'legend');
      const absoluteFloor = legendRule?.minimumScore ?? 97;
      if (absoluteScore < absoluteFloor) continue;
      if (!usesPercentile && !definition.independentLegendEvidence) continue;
      if (usesPercentile && legendRule?.minimumPercentile !== undefined &&
          (percentile === undefined || percentile < legendRule.minimumPercentile)) continue;

      // Legend-specific gates
      if (definition.legendRequiresSizeSweep && definition.benchmarkId) {
        if (!languageHasSizeSweep(lang, definition.benchmarkId, benchScoresById)) continue;
      }
      if (definition.legendRequiresCategoryWin) {
        if (!isCategoryWin(lang, definition.source, allAttributes)) continue;
      }
      if (definition.legendRequiresFirstOverall) {
        if (!isFirstOverall(lang)) continue;
      }
      awarded = 'legend';
      break;
    }
    if (tierSatisfied(tier, absoluteScore, qualificationScore, percentile, usesPercentile)) {
      awarded = tier;
      break;
    }
  }

  if (!awarded) return null;

  const next = nextTierAfter(awarded);
  const reasonParts = [`Rating ${Math.round(absoluteScore)}`];
  if (percentile !== undefined) reasonParts.push(`P${Math.round(percentile)}`);
  reasonParts.push(`Q${Math.round(qualificationScore)}`);

  const nextReq = [];
  if (next) {
    const rule = HYBRID_TIER_THRESHOLDS.find(e => e.tier === next);
    if (rule) {
      nextReq.push(`Abs ≥${rule.minimumScore}`, `Q ≥${rule.minimumScore}`);
      if (usesPercentile && rule.minimumPercentile) nextReq.push(`P${rule.minimumPercentile}`);
    }
    if (next === 'legend') {
      if (definition.legendRequiresSizeSweep && !languageHasSizeSweep(lang, definition.benchmarkId, benchScoresById))
        nextReq.push('Sweep all sizes');
      if (definition.legendRequiresCategoryWin && !isCategoryWin(lang, definition.source, allAttributes))
        nextReq.push('Highest in category');
      if (definition.legendRequiresFirstOverall && !isFirstOverall(lang))
        nextReq.push('Rank 1st overall');
      if (!usesPercentile && !definition.independentLegendEvidence)
        nextReq.push('Need ≥3 langs or size sweep');
    }
  }

  return {
    badgeId: definition.id,
    name: definition.name,
    tier: awarded,
    category: definition.category,
    qualificationScore,
    attributeScore: absoluteScore,
    percentile,
    reason: `${BADGE_TIER_LABEL[awarded]}: ${reasonParts.join(', ')}`,
    nextTier: next ? { tier: next, requirements: nextReq } : null,
  };
}

// Compute badges for all languages
const allBadges = {}; // lang -> EarnedBadge[]
for (const lang of languages) {
  const badges = [];
  for (const def of V1_BADGE_DEFINITIONS) {
    const badge = awardBadge(def, lang, allAttributes, benchScoresById);
    if (badge) badges.push(badge);
  }
  allBadges[lang] = badges;
}

// Select featured badges (up to 3, one per category)
function selectFeaturedBadgeIds(badges) {
  const sorted = [...badges].sort((a, b) => {
    const td = BADGE_TIER_ORDER.indexOf(b.tier) - BADGE_TIER_ORDER.indexOf(a.tier);
    if (td !== 0) return td;
    return b.qualificationScore - a.qualificationScore;
  });
  const featured = [];
  const usedCategories = new Set();
  for (const badge of sorted) {
    if (featured.length >= 3) break;
    if (usedCategories.has(badge.category) && featured.length < 2) continue;
    featured.push(badge);
    usedCategories.add(badge.category);
  }
  if (featured.length < 3) {
    for (const badge of sorted) {
      if (featured.length >= 3) break;
      if (!featured.find(f => f.badgeId === badge.badgeId)) featured.push(badge);
    }
  }
  return featured;
}

// Compute badge bonus and final overall
function computeBadgeBonus(badges, featuredBadges) {
  const featured = featuredBadges
    .map(b => b)
    .toSorted((a, b) => BADGE_TIER_ORDER.indexOf(b.tier) - BADGE_TIER_ORDER.indexOf(a.tier) || b.qualificationScore - a.qualificationScore)
    .slice(0, 3);
  return normalizeScore(clampScore(featured.reduce((s, b) => s + BADGE_OVR_BONUS[b.tier], 0)));
}

const featuredByLang = {};
const bonusByLang = {};
const finalOverallByLang = {};
for (const lang of languages) {
  const badges = allBadges[lang] || [];
  const featured = selectFeaturedBadgeIds(badges);
  featuredByLang[lang] = featured;
  bonusByLang[lang] = computeBadgeBonus(badges, featured);
  const base = overallScores.find(s => s.lang === lang);
  if (base?.eligible) {
    finalOverallByLang[lang] = normalizeScore(Math.min(100, base.overall + bonusByLang[lang]));
  }
}

// Re-rank with badge bonuses
const rankedWithBadges = [...ranked].sort((a, b) => {
  const ao = finalOverallByLang[a.lang] ?? a.overall;
  const bo = finalOverallByLang[b.lang] ?? b.overall;
  return (bo ?? -1) - (ao ?? -1) || a.lang.localeCompare(b.lang);
});

// ── Count wins per ranked benchmark×size×mutation ───
const rankedCellKeys = new Set();
for (const bid of benchmarkIds) {
  const bd = benchmarkData[bid];
  for (const size of bd.sizes) {
    for (const mut of (bd.mutationsBySize[size] || [''])) {
      rankedCellKeys.add(`${bid}||${size}||${mut || ''}`);
    }
  }
}

const wins = {};
const winDetails = {};
for (const l of languages) { wins[l] = 0; winDetails[l] = []; }
const seen = new Set();
for (const r of results) {
  const key = `${r.benchmark.id}||${r.benchmark.size}||${r.benchmark.mutation || ''}`;
  if (seen.has(key) || !rankedCellKeys.has(key)) continue;
  seen.add(key);
  const cohort = results.filter(x =>
    x.benchmark.id === r.benchmark.id &&
    x.benchmark.size === r.benchmark.size &&
    (x.benchmark.mutation || '') === (r.benchmark.mutation || '')
  );
  let min = Infinity, best = null;
  for (const c of cohort) {
    if (!completeResult(c)) continue;
    const t = c.execution.summary.medianKernelTimeNanoseconds;
    if (t < min) { min = t; best = c.language.id; }
  }
  if (best) { wins[best]++; winDetails[best].push({ benchmarkId: r.benchmark.id, size: r.benchmark.size, mutation: r.benchmark.mutation || null, medianNs: min }); }
}

// ── Build markdown ───────────────────────────────────
let md = '';

md += `# Runtime Arena Scorecard\n\n`;
md += `> **Snapshot**: \`${snapshotId}\`  \n`;
md += `> **Date**: ${updatedAt}  \n`;
md += `> **Arena version**: ${arenaVersion}  \n`;
if (gitCommit) md += `> **Commit**: \`${gitCommit.slice(0, 8)}\` (${data.gitDirty ? 'dirty' : 'clean'})  \n`;
md += `> **All benchmarks validated**: ${accepted}/${total} results  \n`;
md += `> **Machine**: ${cpu}  \n`;
md += `> **OS**: ${os}  \n`;
md += `> **RAM**: ${mem}  \n`;
md += `> **Benchmarks**: ${benchmarkIds.map(id => `\`${id}\``).join(', ')}  \n`;
md += `> **Languages**: ${[...languages].map(id => LANG_LABEL[id] || id).join(', ')}  \n\n`;

// ── Overall Leaderboard ─────────────────────────────
md += `## Overall Leaderboard\n\n`;
md += `Scoring: **OVR** = 75% geometric-mean **SPD** + 25% **FLEX** + badge bonus. *Base OVR* shown in parentheses.\n\n`;
md += `| # | | Lang | Monogram | Base OVR | +Bonus | Final OVR | SPD | FLEX | STABLE | Tier | Gem | Wins |\n`;
md += `|---|----|------|----------|----------|--------|-----------|-----|------|--------|------|------|------|\n`;

for (let i = 0; i < rankedWithBadges.length; i++) {
  const s = rankedWithBadges[i];
  const finalOvr = finalOverallByLang[s.lang] ?? s.overall;
  const bonus = bonusByLang[s.lang] || 0;
  const tier = getScoreTier(finalOvr);
  const ct = getCardTierLetter(finalOvr);
  md += `| **${i + 1}** | **${ct}** | ${LANG_LABEL[s.lang] || s.lang} | ${monogram({id: s.lang, name: LANG_LABEL[s.lang] || s.lang})} | ${s.overall.toFixed(1)} | +${bonus.toFixed(1)} | **${finalOvr.toFixed(1)}** | ${s.performance.toFixed(1)} | ${s.versatility.toFixed(1)} | ${s.consistency.toFixed(1)} | ${tier.gem} \`${tier.tag}\` | ${wins[s.lang]} |\n`;
}
md += '\n';

// ── Scoring methodology ──────────────────────────────
md += `### Scoring Methodology\n\n`;
md += `- **Base OVR** = 75% geometric-mean **SPD** + 25% **FLEX** (weighted composite, 0–100).\n`;
md += `- **SPD** (Performance): geometric mean of all benchmark performance scores.\n`;
md += `- **FLEX** (Versatility): 60% minimum-benchmark + 40% average — across all benchmarks.\n`;
md += `- **STABLE** (Consistency): average stability; diagnostic only, not used in OVR.\n`;
md += `- **+Bonus**: sum of up to 3 featured badge bonuses (Bronze +0.5, Silver +1.0, Gold +1.5, HoF +2.0, Legend +2.5).\n`;
md += `- **Final OVR** = Base OVR + Badge Bonus (capped at 100).\n`;
md += `- Performance formula: \`perf = 100 × (fastest / median)^${PERF_EXPONENT}\` (floor ${PERF_FLOOR}).\n`;
md += `- **Wins**: number of ranked benchmark×size×mutation cells where this language posted the lowest median time.\n\n`;

// ── Badge Methodology ────────────────────────────────
md += `### Badge Methodology\n\n`;
md += `Badges use *hybrid qualification*: \`Q = 55% absolute rating + 45% percentile rank\` (when ≥3 languages have data).\n`;
md += `Each badge tier has minimum thresholds for absolute score, Q-score, and percentile.\n\n`;
md += `| Tier | Abs Min | Q Min | P Min | OVR Bonus |\n`;
md += `|------|---------|-------|-------|-----------|\n`;
md += `| Legend | 97 | 97 | P85 | +2.5 |\n`;
md += `| Hall of Fame | 94 | 94 | P70 | +2.0 |\n`;
md += `| Gold | 90 | 90 | P55 | +1.5 |\n`;
md += `| Silver | 85 | 85 | P40 | +1.0 |\n`;
md += `| Bronze | 78 | 78 | P25 | +0.5 |\n\n`;

// ── Tier Reference ──────────────────────────────────
md += `## Tier & Rarity Reference\n\n`;
md += `| Score | Band | Gem (Rarity) | Tag | Tier Level |\n`;
md += `|-------|------|--------------|-----|------------|\n`;
md += `| 100 | FLAWLESS | Dark Matter | DM | 9 |\n`;
md += `| ≥ 99 | TRANSCENDENT | Prismatic Opal | PO | 8 |\n`;
md += `| ≥ 95 | UNTOUCHABLE | Galaxy Opal | GO | 7 |\n`;
md += `| ≥ 90 | INVINCIBLE | Pink Diamond | PD | 6 |\n`;
md += `| ≥ 80 | DOMINANT | Diamond | DIA | 5 |\n`;
md += `| ≥ 70 | ELITE | Amethyst | AME | 4 |\n`;
md += `| ≥ 60 | STANDARD | Ruby | RUB | 3 |\n`;
md += `| ≥ 45 | ROOKIE | Sapphire | SAP | 2 |\n`;
md += `| &lt; 45 | COMMON | Emerald | EME | 1 |\n\n`;

// ── Badge Matrix ──────────────────────────────────────
md += `## Badge Summary Matrix\n\n`;
md += `| Lang | Speedster | Compute Finisher | Data Wrangler | Pathfinder | Steady Hands | Scale Master |\n`;
md += `|------|-----------|------------------|---------------|------------|--------------|--------------|\n`;
for (const s of rankedWithBadges) {
  const badges = allBadges[s.lang] || [];
  const byId = {};
  for (const b of badges) byId[b.badgeId] = b;
  const cells = V1_BADGE_DEFINITIONS.map(def => {
    const b = byId[def.id];
    if (!b) return '—';
    const emoji = { legend: '🏆', 'hall-of-fame': '🌟', gold: '🥇', silver: '🥈', bronze: '🥉' };
    return `${emoji[b.tier] || ''} ${BADGE_TIER_LABEL[b.tier]}`;
  });
  md += `| ${LANG_LABEL[s.lang] || s.lang} | ${cells.join(' | ')} |\n`;
}
md += '\n';

// ── Per-Language Card Profiles ─────────────────────
md += `## Language Card Profiles\n\n`;

for (const s of rankedWithBadges) {
  const info = languageInfo[s.lang];
  const finalOvr = finalOverallByLang[s.lang] ?? s.overall;
  const bonus = bonusByLang[s.lang] || 0;
  const tier = getScoreTier(finalOvr);
  const ver = info.version?.split(' ')[0] || info.version || '—';
  const compilerVer = info.compilerVersion?.split(' ')[0] || info.compilerVersion || '—';
  const featured = featuredByLang[s.lang] || [];
  const badges = allBadges[s.lang] || [];

  md += `### ${monogram({id: s.lang, name: LANG_LABEL[s.lang] || s.lang})} — ${LANG_LABEL[s.lang] || s.lang}\n\n`;

  // Card face
  md += `<table><tr><td>\n\n`;
  md += `**OVR**  \n# **${finalOvr.toFixed(1)}**\n\n`;
  if (bonus > 0) md += `_(base ${s.overall.toFixed(1)} + ${bonus.toFixed(1)} badge bonus)_\n\n`;
  md += `**Tier**  \n${tier.gem} · \`${tier.tag}\`  \n**${tier.name}**\n\n`;
  md += `**Letter Grade**  \n${getCardTierLetter(finalOvr)}  \n\n`;
  md += `**Runtime**  \n${ver}  \n${compilerVer !== ver ? compilerVer : ''}\n\n`;
  md += `</td><td>\n\n`;
  md += `| Meter | Score | Bar |\n`;
  md += `|-------|-------|-----|\n`;
  md += `| SPD | **${s.performance.toFixed(1)}** | ${bar(s.performance, 100)} |\n`;
  md += `| STABLE | **${s.consistency.toFixed(1)}** | ${bar(s.consistency, 100)} |\n`;
  md += `| FLEX | **${s.versatility.toFixed(1)}** | ${bar(s.versatility, 100)} |\n`;
  md += `\n</td></tr></table>\n\n`;

  // Badges
  if (badges.length) {
    md += `#### Badges\n\n`;
    md += `| Badge | Tier | Rating | Percentile | Q-Score | Next Tier |\n`;
    md += `|-------|------|--------|------------|---------|-----------|\n`;
    const sortedBadges = [...badges].sort((a, b) => BADGE_TIER_ORDER.indexOf(b.tier) - BADGE_TIER_ORDER.indexOf(a.tier));
    for (const b of sortedBadges) {
      const isFeat = featured.some(f => f.badgeId === b.badgeId);
      const marker = isFeat ? '★ ' : '';
      const pct = b.percentile !== undefined ? `P${Math.round(b.percentile)}` : '—';
      const nextStr = b.nextTier ? `${BADGE_TIER_LABEL[b.nextTier.tier]} (${b.nextTier.requirements.join('; ')})` : '—';
      md += `| ${marker}${b.name} | **${BADGE_TIER_LABEL[b.tier]}** | ${Math.round(b.attributeScore)} | ${pct} | ${Math.round(b.qualificationScore)} | ${nextStr} |\n`;
    }
    md += `\n> ★ = featured badge (contributes to OVR bonus). Up to 3 featured, one per category.\n\n`;

    if (bonus > 0) {
      const featList = featured.map(b => `${b.name} (${BADGE_TIER_LABEL[b.tier]} +${BADGE_OVR_BONUS[b.tier]})`).join(', ');
      md += `> **OVR Bonus: +${bonus.toFixed(1)}** from ${featList}\n\n`;
    }
  } else {
    md += `#### Badges\n\n_No badges earned._\n\n`;
  }

  // Benchmark breakdown
  md += `#### Benchmark Breakdown\n\n`;
  md += `| Benchmark | Perf | Ranking | vs. Fastest |\n`;
  md += `|-----------|------|---------|-------------|\n`;

  for (const benchEntry of s.benchScores) {
    const bScore = benchEntry.score;
    if (!bScore || !bScore.eligible) {
      md += `| \`${benchEntry.benchmarkId}\` | — | — | Not eligible |\n`;
      continue;
    }
    const otherScores = benchmarkData[benchEntry.benchmarkId].scores;
    const allEligible = languages
      .map(l => otherScores[l])
      .filter(sc => sc && sc.eligible)
      .sort((a, b) => b.performance - a.performance);
    const rank = allEligible.findIndex(sc => sc.performance === bScore.performance) + 1;
    const relSpeeds = bScore.sizeScores.map(ss => ss.medianNs / ss.fastestNs);
    const geoRel = geometricMean(relSpeeds);
    md += `| \`${benchEntry.benchmarkId}\` | **${bScore.performance.toFixed(1)}** | #${rank} of ${allEligible.length} | ${geoRel.toFixed(2)}× |\n`;
  }
  md += `\n`;

  // Attribute ratings (badge sources)
  const attrs = allAttributes[s.lang];
  md += `#### Attribute Ratings\n\n`;
  md += `| Attribute | Abbrev | Rating | Used By |\n`;
  md += `|-----------|--------|--------|---------|\n`;
  const attrMeta = [
    { id: 'SPD', label: 'Runtime Speed', badges: 'Speedster' },
    { id: 'CMP', label: 'Compute', badges: 'Compute Finisher' },
    { id: 'DAT', label: 'Data Processing', badges: 'Data Wrangler' },
    { id: 'ALG', label: 'Algorithms', badges: 'Pathfinder' },
    { id: 'CON', label: 'Consistency', badges: 'Steady Hands' },
    { id: 'SCL', label: 'Scalability', badges: 'Scale Master' },
  ];
  for (const am of attrMeta) {
    const val = attrs[am.id];
    const valStr = val !== null && val !== undefined ? val.toFixed(1) : '—';
    md += `| ${am.label} | ${am.id} | **${valStr}** | ${am.badges} |\n`;
  }
  md += `\n`;

  // Win details
  const langWins = winDetails[s.lang];
  if (langWins.length) {
    md += `#### Fastest Cells (${langWins.length})\n\n`;
    md += `| Benchmark | Size | Median |\n`;
    md += `|-----------|------|--------|\n`;
    for (const w of langWins) {
      md += `| \`${w.benchmarkId}\` | ${SIZE_LABEL[w.size] || w.size}${w.mutation ? ` (${w.mutation})` : ''} | ${formatNs(w.medianNs)} |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
}

// ── Per-Benchmark Detailed Leaderboard ──────────────
md += `## Per-Benchmark Leaderboards\n\n`;

for (const bid of benchmarkIds) {
  const bd = benchmarkData[bid];
  md += `### \`${bid}\`\n\n`;
  md += `**Sizes**: ${bd.expectedSizes.join(', ')}  \n`;
  md += `**Ranked sizes**: ${bd.sizes.length ? bd.sizes.join(', ') : 'none'}  \n\n`;

  const benchRanked = languages
    .map(l => ({ lang: l, ...bd.scores[l] }))
    .filter(s => s.eligible)
    .sort((a, b) => b.performance - a.performance);

  if (benchRanked.length) {
    md += `| # | Lang | Perf | Stable | vs. Fastest |\n`;
    md += `|---|------|------|--------|-------------|\n`;
    for (let i = 0; i < benchRanked.length; i++) {
      const s = benchRanked[i];
      const relSpeeds = s.sizeScores.map(ss => ss.medianNs / ss.fastestNs);
      const geoRel = geometricMean(relSpeeds);
      md += `| ${i + 1} | ${LANG_LABEL[s.lang] || s.lang} | **${s.performance.toFixed(1)}** | ${s.consistency.toFixed(1)} | ${geoRel.toFixed(2)}× |\n`;
    }
    md += '\n';
  }

  for (const size of bd.expectedSizes) {
    const mutations = (bd.mutationsBySize[size] || ['']);
    for (const mut of mutations) {
      const label = mut ? `${size}/${mut}` : size;
      md += `#### ${label}\n\n`;

      const medians = [];
      for (const l of languages) {
        const r = bd.scores[l];
        const m = r.sizeScores?.find(s => s.size === size);
        if (m) {
          const mutScore = m.mutations.find(ms => ms.mutation === (mut || null));
          if (mutScore) {
            medians.push({ lang: l, medianNs: mutScore.medianNs, relative: mutScore.relativeSpeed, valid: true });
          }
        }
      }
      if (medians.every(m => m.valid)) {
        medians.sort((a, b) => a.medianNs - b.medianNs);
        md += `| # | Lang | Median | vs. Fastest |\n`;
        md += `|---|---|--------|-------------|\n`;
        for (let i = 0; i < medians.length; i++) {
          const m = medians[i];
          md += `| ${i + 1} | ${LANG_LABEL[m.lang] || m.lang} | ${formatNs(m.medianNs)} | ${m.relative.toFixed(2)}× |\n`;
        }
        md += `\n`;
      }
    }
  }
  md += `---\n\n`;
}

// ── Win Distribution ───────────────────────────────
md += `## Win Distribution\n\n`;
md += `| Lang | Wins | Share |\n`;
md += `|------|------|-------|\n`;
const totalWins = Object.values(wins).reduce((sum, count) => sum + count, 0);
for (const l of languages) {
  const share = totalWins > 0 ? (wins[l] / totalWins * 100).toFixed(1) : '0.0';
  const wbar = bar(wins[l], totalWins);
  md += `| ${LANG_LABEL[l] || l} | ${wins[l]} | ${wbar} ${share}% |\n`;
}
md += `\n`;

// ── Machine Detail ──────────────────────────────────
md += `## Machine Detail\n\n`;
md += `| Property | Value |\n`;
md += `|----------|-------|\n`;
md += `| CPU | ${p.machine.cpu.model.replace(/\s+/g, ' ').trim()} |\n`;
md += `| Architecture | ${p.machine.cpu.architecture} |\n`;
md += `| Logical Cores | ${p.machine.cpu.logicalCores} |\n`;
md += `| Memory | ${mem} |\n`;
md += `| OS Platform | ${p.machine.operatingSystem.platform} |\n`;
md += `| OS Release | ${p.machine.operatingSystem.release} |\n`;
md += `| Snapshot ID | \`${snapshotId}\` |\n`;
md += `| Updated | ${updatedAt} |\n`;

// ── Benchmark Metadata ──────────────────────────────
md += `\n## Benchmark Metadata\n\n`;
md += `| Benchmark | Languages | Sizes | Total Results |\n`;
md += `|-----------|-----------|-------|---------------|\n`;
for (const bid of benchmarkIds) {
  const cohort = byBenchmark[bid];
  const benchLangs = [...new Set(cohort.map(r => r.language.id))];
  const benchSizes = [...new Set(cohort.map(r => r.benchmark.size))];
  md += `| \`${bid}\` | ${benchLangs.length} | ${benchSizes.map(s => SIZE_LABEL[s] || s).join(', ')} | ${cohort.length} |\n`;
}

// ── Write output ─────────────────────────────────────
const outPath = resolve(root, 'docs', 'scorecard.md');
writeFileSync(outPath, md, 'utf-8');
console.log(`Scorecard written to: ${outPath}`);
console.log(`  Total results: ${total}`);
console.log(`  Benchmarks: ${benchmarkIds.length}`);
console.log(`  Languages: ${languages.length} (${ranked.length} eligible)`);

// Summary
for (const s of rankedWithBadges) {
  const bonus = bonusByLang[s.lang] || 0;
  const finalOvr = finalOverallByLang[s.lang] ?? s.overall;
  const tier = getScoreTier(finalOvr);
  const nBadges = allBadges[s.lang]?.length || 0;
  const featCount = featuredByLang[s.lang]?.length || 0;
  console.log(`  ${LANG_LABEL[s.lang]}: ${s.overall.toFixed(1)} +${bonus.toFixed(1)} = ${finalOvr.toFixed(1)} OVR (${tier.gem}) — ${nBadges} badges, ${featCount} featured`);
}
