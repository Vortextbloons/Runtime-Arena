import type { BenchmarkScore } from '../../types.ts';
import { formatDuration } from '../../scoring.ts';
import { attributeMap } from '../attributes/calculateAttributes.ts';
import type { CardAttribute, EarnedBadge, LanguageCardData } from '../types.ts';
import { BADGE_OVR_BONUS } from './calculateBadgeBonus.ts';
import { ALL_BADGE_DEFINITIONS, BADGE_TIER_LABEL, type BadgeDefinition } from './definitions.ts';

export type BadgeDetailMeasurement = {
	label: string;
	value: string;
};

export type BadgeDetailScore = {
	label: string;
	value: string;
};

export type BadgeLegendCheck = {
	label: string;
	met: boolean;
};

export type BadgeSizeRow = {
	size: string;
	median: string;
	performance: number;
	wonSize: boolean;
};

export type BadgeDetail = {
	summary: string;
	measuredBy: string;
	measurements: BadgeDetailMeasurement[];
	evidence: string[];
	scores: BadgeDetailScore[];
	benchmarkWorkload?: string;
	sizeBreakdown?: BadgeSizeRow[];
	legendChecks?: BadgeLegendCheck[];
	ovrImpact?: string;
};

export type BadgeDetailContext = {
	badge: EarnedBadge;
	card: LanguageCardData;
	benchmarkScore?: BenchmarkScore;
	allBenchmarkScores?: BenchmarkScore[];
	overallScores?: BenchmarkScore[];
	cohortAttributes?: Map<string, CardAttribute[]>;
	isFeatured?: boolean;
};

const BADGE_SUMMARIES: Record<string, string> = {
	speedster:
		'Overall runtime speed — geometric mean of normalized speed across every benchmark this language completed in the snapshot.',
	'compute-finisher':
		'Numeric compute on the N-body workload: pairwise gravitational forces, velocity updates, and energy checksums over many simulation steps.',
	'data-handler':
		'Data wrangling on the aggregation workload: CSV parsing, hash-map aggregation, sorting, and checksum verification.',
	pathfinder:
		'Graph algorithms on shortest-path: Dijkstra queries over weighted directed graphs with sparse and dense edge sets.',
	'steady-hands':
		'Run-to-run stability — low kernel-time variation across measured samples and dataset sizes.',
	'scale-master':
		'Scalability — how evenly performance holds from small to large datasets relative to the fastest size.',
	'fast-builder': 'Compile and link speed — shortest measured build duration across benchmark cells.',
	'lightweight-build': 'Artifact footprint — smallest produced binary or bundle size after a successful build.',
	'memory-minder': 'Peak resident memory while executing workloads, compared against other languages in the snapshot.',
	'tight-code': 'Implementation size — fewest average logical lines of code across benchmark implementations.',
	'code-economy':
		'Performance yield per line of code — overall speed score divided by implementation size.'
};

const BENCHMARK_WORKLOADS: Record<string, string> = {
	nbody: 'Gravitational N-body simulation with direct pairwise force computation.',
	aggregation: 'CSV transaction aggregation with hash maps, sorting, and SHA-256 checksum.',
	'shortest-path': "Weighted directed graph shortest-path queries using Dijkstra's algorithm.",
	'barrier-wave': 'Parallel worker pool with deterministic barriers and ordered reduction.',
	'stream-io': 'Stream and file I/O throughput workload.',
	'record-sorting': 'Multi-field record sorting with comparator-heavy access patterns.',
	'matrix-multiplication': 'Dense matrix multiply stressing numeric loops and memory layout.',
	'word-frequency': 'Word frequency counting, ranking, and checksum over prepared token lists.'
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function formatRawValue(attribute: CardAttribute): string | undefined {
	if (attribute.rawValue === undefined || !attribute.unit) return undefined;
	const value = attribute.rawValue;
	switch (attribute.unit) {
		case 'ns':
			return formatDuration(value);
		case 'bytes':
			return formatBytes(value);
		case 'lines':
			return `${Math.round(value)} logical lines`;
		case 'pts/100 lines':
			return `${value.toFixed(2)} pts per 100 lines`;
		default:
			return `${value} ${attribute.unit}`;
	}
}

function definitionFor(badgeId: string): BadgeDefinition | undefined {
	return ALL_BADGE_DEFINITIONS.find((definition) => definition.id === badgeId);
}

function languageHasSizeSweep(languageId: string, scores: BenchmarkScore[]): boolean {
	const candidate = scores.find((score) => score.language.id === languageId);
	if (!candidate?.eligible || !candidate.sizes.length) return false;
	for (const size of candidate.sizes) {
		const best = Math.max(
			...scores
				.filter((score) => score.eligible)
				.map((score) => score.sizes.find((entry) => entry.size === size.size)?.performance ?? -Infinity)
		);
		if (size.performance < best) return false;
	}
	return true;
}

function buildLegendChecks(
	definition: BadgeDefinition,
	attribute: CardAttribute,
	ctx: BadgeDetailContext
): BadgeLegendCheck[] | undefined {
	const checks: BadgeLegendCheck[] = [];
	const { card, benchmarkScore, allBenchmarkScores, overallScores } = ctx;

	if (definition.legendRequiresSizeSweep && definition.benchmarkId && allBenchmarkScores?.length) {
		const met = languageHasSizeSweep(card.languageId, allBenchmarkScores);
		checks.push({
			label: `Fastest at every ${definition.benchmarkId} dataset size`,
			met
		});
	}

	if (definition.legendRequiresCategoryWin && attribute.rating !== null && ctx.cohortAttributes?.size) {
		const peerRatings: number[] = [];
		for (const attributes of ctx.cohortAttributes.values()) {
			const peer = attributeMap(attributes)[definition.source];
			if (peer?.available && peer.rating !== null) peerRatings.push(peer.rating);
		}
		if (peerRatings.length) {
			checks.push({
				label: `Highest ${attribute.label} rating in the snapshot`,
				met: attribute.rating >= Math.max(...peerRatings)
			});
		}
	}

	if (definition.legendRequiresFirstOverall && overallScores?.length) {
		const eligible = overallScores.filter((score) => score.eligible && score.overall !== null);
		const best = eligible.length ? Math.max(...eligible.map((score) => score.overall!)) : null;
		const own = eligible.find((score) => score.language.id === card.languageId)?.overall ?? null;
		checks.push({
			label: 'Rank first in overall score',
			met: best !== null && own === best
		});
	}

	if (
		(definition.legendRequiresFastestRaw ||
			definition.legendRequiresSmallestRaw ||
			definition.legendRequiresLargestRaw) &&
		typeof attribute.rawValue === 'number' &&
		ctx.cohortAttributes?.size
	) {
		const peerRaw: number[] = [];
		for (const attributes of ctx.cohortAttributes.values()) {
			const peer = attributeMap(attributes)[definition.source];
			if (peer?.available && typeof peer.rawValue === 'number' && peer.rawValue > 0) {
				peerRaw.push(peer.rawValue);
			}
		}
		if (peerRaw.length) {
			const lowerIsBetter =
				definition.legendRequiresFastestRaw || definition.legendRequiresSmallestRaw;
			const best = lowerIsBetter ? Math.min(...peerRaw) : Math.max(...peerRaw);
			const label = definition.legendRequiresFastestRaw
				? 'Fastest measured build in the snapshot'
				: `${lowerIsBetter ? 'Smallest' : 'Largest'} raw ${attribute.label.toLowerCase()} in the snapshot`;
			checks.push({
				label,
				met: attribute.rawValue === best
			});
		}
	}

	return checks.length ? checks : undefined;
}

function buildSizeBreakdown(
	benchmarkScore: BenchmarkScore | undefined,
	allBenchmarkScores: BenchmarkScore[] | undefined
): BadgeSizeRow[] | undefined {
	if (!benchmarkScore?.eligible || !benchmarkScore.sizes.length) return undefined;
	return benchmarkScore.sizes.map((size) => {
		const best = Math.max(
			...(allBenchmarkScores ?? [])
				.filter((score) => score.eligible)
				.map((entry) => entry.sizes.find((candidate) => candidate.size === size.size)?.performance ?? -Infinity)
		);
		return {
			size: size.size,
			median: formatDuration(size.medianNanoseconds),
			performance: Math.round(size.performance),
			wonSize: size.performance >= best
		};
	});
}

function buildMeasurements(attribute: CardAttribute, benchmarkScore?: BenchmarkScore): BadgeDetailMeasurement[] {
	const measurements: BadgeDetailMeasurement[] = [];
	const formatted = formatRawValue(attribute);
	if (formatted) {
		measurements.push({ label: 'Measured value', value: formatted });
	}
	if (attribute.rating !== null) {
		measurements.push({ label: 'Attribute rating', value: String(Math.round(attribute.rating)) });
	}
	if (benchmarkScore?.eligible) {
		if (benchmarkScore.overall !== null) {
			measurements.push({ label: 'Benchmark overall', value: String(Math.round(benchmarkScore.overall)) });
		}
		if (benchmarkScore.performance !== null) {
			measurements.push({ label: 'Benchmark speed', value: String(Math.round(benchmarkScore.performance)) });
		}
		if (benchmarkScore.consistency !== null) {
			measurements.push({ label: 'Benchmark stability', value: String(Math.round(benchmarkScore.consistency)) });
		}
	}
	return measurements;
}

export function buildBadgeDetail(ctx: BadgeDetailContext): BadgeDetail {
	const { badge, card, benchmarkScore, allBenchmarkScores, isFeatured } = ctx;
	const definition = definitionFor(badge.badgeId);
	const attributes = attributeMap(card.attributes);
	const attribute = definition ? attributes[definition.source] : undefined;
	const summary =
		BADGE_SUMMARIES[badge.badgeId] ??
		`Performance recognition based on the ${attribute?.label ?? 'linked'} attribute.`;

	const measuredBy = attribute
		? `${attribute.label} (${attribute.abbreviation})`
		: definition
			? definition.source
			: badge.category;

	const measurements = attribute ? buildMeasurements(attribute, benchmarkScore) : [];
	const evidence = attribute?.evidence.length ? attribute.evidence : [];

	const scores: BadgeDetailScore[] = [];
	if (badge.attributeScore !== undefined) {
		scores.push({ label: 'Absolute rating', value: String(Math.round(badge.attributeScore)) });
	}
	if (badge.percentile !== undefined) {
		scores.push({ label: 'Percentile vs snapshot', value: `${Math.round(badge.percentile)}th` });
	}
	scores.push({ label: 'Qualification score', value: String(Math.round(badge.qualificationScore)) });

	const benchmarkWorkload = badge.benchmarkId ? BENCHMARK_WORKLOADS[badge.benchmarkId] : undefined;
	const sizeBreakdown = badge.benchmarkId
		? buildSizeBreakdown(benchmarkScore, allBenchmarkScores)
		: undefined;
	const legendChecks = definition && attribute ? buildLegendChecks(definition, attribute, ctx) : undefined;

	const bonus = BADGE_OVR_BONUS[badge.tier];
	const ovrImpact = isFeatured
		? `Featured badge: +${bonus} overall (${BADGE_TIER_LABEL[badge.tier]} tier)`
		: `Would add +${bonus} overall if featured (${BADGE_TIER_LABEL[badge.tier]} tier)`;

	return {
		summary,
		measuredBy,
		measurements,
		evidence,
		scores,
		benchmarkWorkload,
		sizeBreakdown,
		legendChecks,
		ovrImpact
	};
}

export function formatBadgeTooltip(
	badge: EarnedBadge,
	card?: LanguageCardData,
	detail?: BadgeDetail
): string {
	const built = detail ?? (card ? buildBadgeDetail({ badge, card }) : null);
	const lines = [`${badge.name} — ${BADGE_TIER_LABEL[badge.tier]}`];
	if (built) {
		lines.push(built.summary);
		if (built.measurements.length) {
			lines.push(
				built.measurements.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')
			);
		} else if (built.evidence.length) {
			lines.push(built.evidence.join(' · '));
		}
	} else {
		lines.push(badge.reason);
	}
	if (badge.nextTier) {
		lines.push(
			`Next ${BADGE_TIER_LABEL[badge.nextTier.tier]}: ${badge.nextTier.requirements.join('; ')}`
		);
	}
	return lines.join('\n');
}
