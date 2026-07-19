import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreBenchmark, scoreOverall } from './scoring.ts';
import type { ArenaResult } from './types.ts';
import { calculateAttributes, scalabilityFromSizes } from './cards/attributes/calculateAttributes.ts';
import { generateBuildName } from './cards/archetypes/buildNames.ts';
import { awardHybridBadge, hybridQualificationScore } from './cards/badges/calculateBadgeTier.ts';
import { selectFeaturedBadgeIds } from './cards/badges/awardBadges.ts';
import { buildAllCardData } from './cards/buildCardData.ts';
import { getLanguageClassification } from './cards/classifications.ts';
import {
	calculateDivisionRanks,
	selectFeaturedDivisionRank
} from './cards/divisions/calculateDivisionRanks.ts';
import { calculatePrimaryTakeover } from './cards/takeovers/calculateTakeover.ts';
import { cardTierFromOverall, cardTierLabel, percentileRank } from './cards/util.ts';
import type { CardAttribute } from './cards/types.ts';

function result(
	language: string,
	benchmark: string,
	size: string,
	median: number,
	options: { deviation?: number; status?: string; valid?: number; measured?: number } = {}
): ArenaResult {
	const measured = options.measured ?? 5;
	return {
		benchmark: { id: benchmark, version: 1, size },
		language: { id: language, name: language, version: '1' },
		execution: {
			mode: 'persistent-worker',
			measuredIterations: measured,
			samples: [],
			summary: {
				validSamples: options.valid ?? measured,
				medianKernelTimeNanoseconds: median,
				meanKernelTimeNanoseconds: median,
				standardDeviationKernelTimeNanoseconds: options.deviation ?? 0,
				p95KernelTimeNanoseconds: median
			}
		},
		checker: { status: options.status ?? 'accepted', diagnostics: [] },
		provenance: {
			fingerprint: 'test',
			measuredAt: '2026-01-01T00:00:00.000Z',
			machine: {
				cpu: { model: 'test', architecture: 'x64', logicalCores: 8 },
				memoryBytes: 1,
				operatingSystem: { platform: 'test', release: '1' }
			}
		}
	};
}

function sizes(language: string, benchmark: string, small: number, medium: number, large: number): ArenaResult[] {
	return [
		result(language, benchmark, 'small', small),
		result(language, benchmark, 'medium', medium),
		result(language, benchmark, 'large', large)
	];
}

function attr(abbreviation: string, rating: number | null, id?: string): CardAttribute {
	return {
		id: id ?? abbreviation.toLowerCase(),
		label: abbreviation,
		abbreviation,
		rating,
		category: 'execution',
		available: rating !== null,
		evidence: []
	};
}

test('card tier boundaries follow Section 4', () => {
	assert.equal(cardTierFromOverall(95), 's-plus');
	assert.equal(cardTierFromOverall(94.4), 's');
	assert.equal(cardTierFromOverall(85), 'a-plus');
	assert.equal(cardTierFromOverall(80), 'a');
	assert.equal(cardTierFromOverall(70), 'b');
	assert.equal(cardTierFromOverall(60), 'c');
	assert.equal(cardTierFromOverall(59.9), 'd');
	assert.equal(cardTierFromOverall(null), null);
	assert.equal(cardTierLabel('s-plus'), 'S+');
});

test('scalability uses min/max size performance ratio', () => {
	const scores = scoreBenchmark(
		[
			...sizes('stable', 'nbody', 1_000_000, 1_000_000, 1_000_000),
			...sizes('drop', 'nbody', 1_000_000, 2_000_000, 4_000_000)
		],
		'nbody'
	);
	const stable = scores.find((score) => score.language.id === 'stable');
	const drop = scores.find((score) => score.language.id === 'drop');
	assert.equal(scalabilityFromSizes(stable), 100);
	assert.ok(scalabilityFromSizes(drop)! < 100);
});

test('percentile and hybrid qualification match the spec formula', () => {
	const field = [60, 80, 100];
	assert.equal(percentileRank(100, field), 100);
	assert.equal(percentileRank(60, field), 0);
	assert.equal(percentileRank(80, field), 50);
	const hybrid = hybridQualificationScore(90, [70, 80, 90, 95]);
	assert.equal(hybrid.usesPercentile, true);
	assert.ok(hybrid.qualificationScore > 70);
	const smallField = hybridQualificationScore(96, [96, 90]);
	assert.equal(smallField.usesPercentile, false);
	assert.equal(smallField.qualificationScore, 96);
});

test('hybrid Legend requires absolute floor plus evidence; small fields block Legend without sweep', () => {
	const legend = awardHybridBadge({
		badgeId: 'speedster',
		name: 'Speedster',
		category: 'execution',
		evidence: {
			absoluteScore: 98,
			fieldScores: [98, 90],
			hasFirstOverall: true
		}
	});
	assert.notEqual(legend?.tier, 'legend');

	const swept = awardHybridBadge({
		badgeId: 'compute-finisher',
		name: 'Compute Finisher',
		category: 'execution',
		evidence: {
			absoluteScore: 98,
			fieldScores: [98, 90],
			hasSizeSweep: true,
			independentLegendEvidence: true
		}
	});
	assert.equal(swept?.tier, 'legend');
});

test('mid-pack scores no longer earn bronze on absolute alone', () => {
	const badge = awardHybridBadge({
		badgeId: 'speedster',
		name: 'Speedster',
		category: 'execution',
		evidence: {
			absoluteScore: 72,
			fieldScores: [95, 88, 72, 60]
		}
	});
	assert.equal(badge, null);
});

test('partial coverage does not invent Complete Package or Clean Output badges', () => {
	const rows = [
		...sizes('lonely', 'nbody', 1_000_000, 1_000_000, 1_000_000),
		...sizes('other', 'nbody', 2_000_000, 2_000_000, 2_000_000),
		...sizes('third', 'nbody', 3_000_000, 3_000_000, 3_000_000)
	];
	const partial = buildAllCardData({ snapshotId: 'partial', results: rows }).find(
		(card) => card.languageId === 'lonely'
	);
	assert.equal(partial?.badges.some((badge) => badge.badgeId === 'complete-package'), false);
	assert.equal(partial?.badges.some((badge) => badge.badgeId === 'clean-output'), false);
	assert.equal(partial?.attributes.find((attribute) => attribute.id === 'algorithms')?.available, false);
});

test('build names are deterministic and balance to All-Around', () => {
	const balanced = [
		attr('SPD', 90, 'runtime-speed'),
		attr('CON', 88, 'consistency'),
		attr('SCL', 89, 'scalability'),
		attr('CMP', 91, 'compute'),
		attr('ALG', 90, 'algorithms'),
		attr('DAT', 87, 'data-processing')
	];
	assert.equal(generateBuildName(getLanguageClassification('rust'), balanced), 'Native All-Around Performer');

	const specialist = [
		attr('SPD', 70, 'runtime-speed'),
		attr('CON', 70, 'consistency'),
		attr('SCL', 70, 'scalability'),
		attr('CMP', 98, 'compute'),
		attr('ALG', 60, 'algorithms'),
		attr('DAT', 55, 'data-processing')
	];
	assert.equal(generateBuildName(getLanguageClassification('rust'), specialist), 'Native Compute Specialist');
	assert.equal(calculatePrimaryTakeover(specialist), 'Compute Dominance');
	assert.equal(calculatePrimaryTakeover(balanced), 'All-Around');
});

test('division ranks hide fields smaller than three and prefer best featured rank', () => {
	const ranks = calculateDivisionRanks([
		{ languageId: 'rust', overall: 94, classification: getLanguageClassification('rust') },
		{ languageId: 'cpp', overall: 90, classification: getLanguageClassification('cpp') },
		{ languageId: 'go', overall: 88, classification: getLanguageClassification('go') },
		{ languageId: 'python', overall: 70, classification: getLanguageClassification('python') }
	]);
	assert.ok((ranks.get('rust') ?? []).some((rank) => rank.divisionId === 'Native' && rank.fieldSize >= 3));
	assert.equal((ranks.get('python') ?? []).some((rank) => rank.divisionId === 'Native'), false);

	const tiny = calculateDivisionRanks([
		{ languageId: 'rust', overall: 94, classification: getLanguageClassification('rust') },
		{ languageId: 'cpp', overall: 90, classification: getLanguageClassification('cpp') }
	]);
	assert.equal(tiny.get('rust'), undefined);

	const featured = selectFeaturedDivisionRank([
		{ divisionId: 'Systems', divisionName: 'Systems', rank: 2, fieldSize: 4, score: 90 },
		{ divisionId: 'Native', divisionName: 'Native', rank: 1, fieldSize: 3, score: 94 }
	]);
	assert.equal(featured?.divisionId, 'Native');
});

test('balanced profiles still generate All-Around builds without Complete Package', () => {
	const rows = [
		...sizes('alpha', 'nbody', 1_000_000, 1_000_000, 1_000_000),
		...sizes('alpha', 'shortest-path', 1_000_000, 1_000_000, 1_000_000),
		...sizes('alpha', 'aggregation', 1_000_000, 1_000_000, 1_000_000),
		...sizes('beta', 'nbody', 1_100_000, 1_100_000, 1_100_000),
		...sizes('beta', 'shortest-path', 1_100_000, 1_100_000, 1_100_000),
		...sizes('beta', 'aggregation', 1_100_000, 1_100_000, 1_100_000),
		...sizes('gamma', 'nbody', 1_200_000, 1_200_000, 1_200_000),
		...sizes('gamma', 'shortest-path', 1_200_000, 1_200_000, 1_200_000),
		...sizes('gamma', 'aggregation', 1_200_000, 1_200_000, 1_200_000)
	];
	const cards = buildAllCardData({ snapshotId: 'test', results: rows });
	const alpha = cards.find((card) => card.languageId === 'alpha');
	assert.ok(alpha);
	assert.equal(alpha!.attributes.filter((attribute) => attribute.available).length >= 6, true);
	assert.equal(alpha!.badges.some((badge) => badge.badgeId === 'complete-package'), false);
	assert.equal(alpha!.badges.some((badge) => badge.badgeId === 'clean-output'), false);
});

test('buildAllCardData is deterministic and wires face fields', () => {
	const rows = [
		...sizes('rust', 'nbody', 1_000_000, 1_050_000, 1_100_000),
		...sizes('rust', 'shortest-path', 1_000_000, 1_000_000, 1_000_000),
		...sizes('rust', 'aggregation', 1_200_000, 1_200_000, 1_200_000),
		...sizes('go', 'nbody', 1_100_000, 1_100_000, 1_100_000),
		...sizes('go', 'shortest-path', 1_100_000, 1_100_000, 1_100_000),
		...sizes('go', 'aggregation', 1_000_000, 1_000_000, 1_000_000),
		...sizes('python', 'nbody', 2_000_000, 2_000_000, 2_000_000),
		...sizes('python', 'shortest-path', 2_000_000, 2_000_000, 2_000_000),
		...sizes('python', 'aggregation', 2_000_000, 2_000_000, 2_000_000)
	];
	const first = buildAllCardData({ snapshotId: 'snap-1', measuredAt: '2026-01-01', results: rows });
	const second = buildAllCardData({ snapshotId: 'snap-1', measuredAt: '2026-01-01', results: rows });
	assert.deepEqual(first, second);

	const rust = first.find((card) => card.languageId === 'rust');
	assert.ok(rust);
	assert.equal(rust!.metadata.cardSpecVersion, '1');
	assert.ok(rust!.buildName.startsWith('Native'));
	assert.deepEqual(rust!.displayClassifications, ['Native', 'Systems']);
	assert.equal(rust!.featuredBadgeIds.length <= 3, true);
	assert.ok(rust!.takeover.primary);
	assert.equal(rust!.attributes.length, 12);
	assert.equal(rust!.attributes.filter((attribute) => attribute.id.startsWith('runtime') || ['consistency','scalability','compute','algorithms','data-processing'].includes(attribute.id)).length, 6);

	const overall = scoreOverall(rows);
	const attributes = calculateAttributes({
		overall: overall.find((score) => score.language.id === 'rust')!,
		benchmarkById: {
			nbody: scoreBenchmark(rows, 'nbody').find((score) => score.language.id === 'rust'),
			'shortest-path': scoreBenchmark(rows, 'shortest-path').find((score) => score.language.id === 'rust'),
			aggregation: scoreBenchmark(rows, 'aggregation').find((score) => score.language.id === 'rust')
		},
		benchmarkScoresById: {
			nbody: scoreBenchmark(rows, 'nbody'),
			'shortest-path': scoreBenchmark(rows, 'shortest-path'),
			aggregation: scoreBenchmark(rows, 'aggregation')
		},
		languageResults: rows.filter((row) => row.language.id === 'rust'),
		cohortRaw: {
			buildDurations: new Map(),
			artifactBytes: new Map(),
			startupNanoseconds: new Map(),
			peakMemoryBytes: new Map()
		}
	});
	assert.equal(attributes.find((attribute) => attribute.abbreviation === 'SPD')?.available, true);
});

test('featured badges prefer higher tiers and fill to three', () => {
	const featured = selectFeaturedBadgeIds([
		{
			badgeId: 'speedster',
			name: 'Speedster',
			tier: 'gold',
			category: 'execution',
			qualificationScore: 82,
			reason: 'x'
		},
		{
			badgeId: 'steady-hands',
			name: 'Steady Hands',
			tier: 'legend',
			category: 'reliability',
			qualificationScore: 97,
			reason: 'x'
		},
		{
			badgeId: 'pathfinder',
			name: 'Pathfinder',
			tier: 'silver',
			category: 'control',
			qualificationScore: 75,
			reason: 'x'
		},
		{
			badgeId: 'compute-finisher',
			name: 'Compute Finisher',
			tier: 'bronze',
			category: 'execution',
			qualificationScore: 61,
			reason: 'x'
		}
	]);
	assert.equal(featured[0], 'steady-hands');
	assert.equal(featured.length, 3);
});

test('incorrect languages do not earn performance badges from null attributes', () => {
	const rows = [
		...sizes('valid', 'nbody', 1_000_000, 1_000_000, 1_000_000),
		...sizes('valid', 'shortest-path', 1_000_000, 1_000_000, 1_000_000),
		...sizes('valid', 'aggregation', 1_000_000, 1_000_000, 1_000_000),
		result('bad', 'nbody', 'small', 1_000_000, { status: 'wrong-answer' }),
		result('bad', 'nbody', 'medium', 1_000_000, { status: 'wrong-answer' }),
		result('bad', 'nbody', 'large', 1_000_000, { status: 'wrong-answer' }),
		...sizes('third', 'nbody', 1_500_000, 1_500_000, 1_500_000),
		...sizes('third', 'shortest-path', 1_500_000, 1_500_000, 1_500_000),
		...sizes('third', 'aggregation', 1_500_000, 1_500_000, 1_500_000)
	];
	const bad = buildAllCardData({ snapshotId: 'bad', results: rows }).find((card) => card.languageId === 'bad');
	assert.ok(bad);
	assert.equal(bad!.overall, null);
	assert.equal(bad!.cardTier, null);
	assert.equal(
		bad!.badges.some((badge) => ['speedster', 'compute-finisher', 'clean-output', 'complete-package'].includes(badge.badgeId)),
		false
	);
});

function withBuild(row: ArenaResult, duration: number, artifact: number, status: 'success' | 'cached' | 'skipped' = 'success'): ArenaResult {
	return {
		...row,
		build: {
			status,
			durationNanoseconds: duration,
			artifactSizeBytes: artifact,
			command: ['build']
		}
	};
}

test('V1.5 build and artifact attributes use relative lower-is-better scoring', () => {
	const rows = [
		...sizes('fast', 'nbody', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 1_000_000, 100_000)),
		...sizes('fast', 'shortest-path', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 1_000_000, 100_000)),
		...sizes('fast', 'aggregation', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 1_000_000, 100_000)),
		...sizes('slow', 'nbody', 1_100_000, 1_100_000, 1_100_000).map((row) => withBuild(row, 2_000_000, 200_000)),
		...sizes('slow', 'shortest-path', 1_100_000, 1_100_000, 1_100_000).map((row) => withBuild(row, 2_000_000, 200_000)),
		...sizes('slow', 'aggregation', 1_100_000, 1_100_000, 1_100_000).map((row) => withBuild(row, 2_000_000, 200_000)),
		...sizes('mid', 'nbody', 1_200_000, 1_200_000, 1_200_000).map((row) => withBuild(row, 1_500_000, 150_000)),
		...sizes('mid', 'shortest-path', 1_200_000, 1_200_000, 1_200_000).map((row) => withBuild(row, 1_500_000, 150_000)),
		...sizes('mid', 'aggregation', 1_200_000, 1_200_000, 1_200_000).map((row) => withBuild(row, 1_500_000, 150_000))
	];
	const cards = buildAllCardData({ snapshotId: 'v15', results: rows });
	const fast = cards.find((card) => card.languageId === 'fast')!;
	const slow = cards.find((card) => card.languageId === 'slow')!;
	assert.equal(fast.attributes.find((attribute) => attribute.id === 'build-speed')?.rating, 100);
	assert.equal(fast.attributes.find((attribute) => attribute.id === 'artifact-efficiency')?.rating, 100);
	assert.ok((slow.attributes.find((attribute) => attribute.id === 'build-speed')?.rating ?? 0) < 100);
	assert.ok(fast.badges.some((badge) => badge.badgeId === 'fast-builder'));
	assert.ok(fast.badges.some((badge) => badge.badgeId === 'lightweight-build'));
	assert.equal(fast.metadata.cardSpecVersion, '1.5');
});

test('cached zero-duration builds leave Build Speed unavailable', () => {
	const rows = [
		...sizes('cached', 'nbody', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 0, 50_000, 'cached')),
		...sizes('cached', 'shortest-path', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 0, 50_000, 'cached')),
		...sizes('cached', 'aggregation', 1_000_000, 1_000_000, 1_000_000).map((row) => withBuild(row, 0, 50_000, 'cached')),
		...sizes('other', 'nbody', 2_000_000, 2_000_000, 2_000_000).map((row) => withBuild(row, 3_000_000, 90_000)),
		...sizes('other', 'shortest-path', 2_000_000, 2_000_000, 2_000_000).map((row) => withBuild(row, 3_000_000, 90_000)),
		...sizes('other', 'aggregation', 2_000_000, 2_000_000, 2_000_000).map((row) => withBuild(row, 3_000_000, 90_000)),
		...sizes('third', 'nbody', 3_000_000, 3_000_000, 3_000_000).map((row) => withBuild(row, 4_000_000, 120_000)),
		...sizes('third', 'shortest-path', 3_000_000, 3_000_000, 3_000_000).map((row) => withBuild(row, 4_000_000, 120_000)),
		...sizes('third', 'aggregation', 3_000_000, 3_000_000, 3_000_000).map((row) => withBuild(row, 4_000_000, 120_000))
	];
	const card = buildAllCardData({ snapshotId: 'cached', results: rows }).find((entry) => entry.languageId === 'cached')!;
	assert.equal(card.attributes.find((attribute) => attribute.id === 'build-speed')?.available, false);
	assert.equal(card.attributes.find((attribute) => attribute.id === 'artifact-efficiency')?.available, true);
});

test('V2 startup memory parallel attributes and secondary takeover', () => {
	const attachV2 = (row: ArenaResult, language: string): ArenaResult => ({
		...withBuild(row, language === 'alpha' ? 1_000_000 : 2_000_000, language === 'alpha' ? 80_000 : 160_000),
		execution: {
			...row.execution,
			startup: { durationNanoseconds: language === 'alpha' ? 500_000 : 1_000_000, mode: 'process-init' },
			memory: {
				peakResidentBytes: language === 'alpha' ? 32_000_000 : 64_000_000,
				collector: 'arena-rss'
			},
			parallel:
				row.benchmark.id === 'barrier-wave'
					? {
							workerCount: 4,
							singleWorkerBaselineNanoseconds: 4_000_000,
							multiWorkerNanoseconds: language === 'alpha' ? 1_100_000 : 2_000_000
						}
					: undefined
		}
	});

	const rows = ['alpha', 'beta', 'gamma'].flatMap((language, index) => {
		const base = 1_000_000 + index * 200_000;
		return [
			...sizes(language, 'nbody', base, base, base),
			...sizes(language, 'shortest-path', base, base, base),
			...sizes(language, 'aggregation', base, base, base),
			...sizes(language, 'barrier-wave', base, base, base)
		].map((row) => attachV2(row, language));
	});

	const cards = buildAllCardData({ snapshotId: 'v2', results: rows });
	const alpha = cards.find((card) => card.languageId === 'alpha')!;
	assert.equal(alpha.attributes.find((attribute) => attribute.id === 'startup')?.rating, 100);
	assert.equal(alpha.attributes.find((attribute) => attribute.id === 'memory')?.rating, 100);
	assert.ok(alpha.attributes.find((attribute) => attribute.id === 'parallelism')?.available);
	assert.equal(alpha.attributes.find((attribute) => attribute.id === 'io')?.available, false);
	assert.ok(alpha.badges.some((badge) => badge.badgeId === 'quick-draw'));
	assert.ok(alpha.badges.some((badge) => badge.badgeId === 'memory-minder'));
	assert.ok(alpha.badges.some((badge) => badge.badgeId === 'parallel-engine'));
	assert.equal(alpha.metadata.cardSpecVersion, '2');
	assert.ok(alpha.takeover.primary);
	// With many strong attributes available, secondary may appear when #2 >= 85
	if (alpha.takeover.secondary) {
		assert.notEqual(alpha.takeover.secondary, alpha.takeover.primary);
	}
});

test('unsupported V2 measurements stay unavailable and do not become zero', () => {
	const rows = [
		...sizes('lonely', 'nbody', 1_000_000, 1_000_000, 1_000_000),
		...sizes('lonely', 'shortest-path', 1_000_000, 1_000_000, 1_000_000),
		...sizes('lonely', 'aggregation', 1_000_000, 1_000_000, 1_000_000),
		...sizes('peer', 'nbody', 2_000_000, 2_000_000, 2_000_000),
		...sizes('peer', 'shortest-path', 2_000_000, 2_000_000, 2_000_000),
		...sizes('peer', 'aggregation', 2_000_000, 2_000_000, 2_000_000),
		...sizes('third', 'nbody', 3_000_000, 3_000_000, 3_000_000),
		...sizes('third', 'shortest-path', 3_000_000, 3_000_000, 3_000_000),
		...sizes('third', 'aggregation', 3_000_000, 3_000_000, 3_000_000)
	];
	const card = buildAllCardData({ snapshotId: 'no-v2', results: rows }).find((entry) => entry.languageId === 'lonely')!;
	for (const id of ['startup', 'memory', 'io']) {
		const attribute = card.attributes.find((entry) => entry.id === id)!;
		assert.equal(attribute.available, false);
		assert.equal(attribute.rating, null);
	}
});
