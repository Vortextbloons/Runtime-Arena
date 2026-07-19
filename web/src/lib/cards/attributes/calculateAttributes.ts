import type { BenchmarkScore } from '../../types.ts';
import type { CardAttribute } from '../types.ts';
import { CORE_ATTRIBUTE_DEFINITIONS, BENCHMARK_ATTRIBUTE_IDS } from './definitions.ts';
import { average, normalizeScore } from '../util.ts';

/** Per-benchmark scalability: (min size performance / max size performance) × 100. */
export function scalabilityFromSizes(score: BenchmarkScore | undefined): number | null {
	if (!score?.eligible || !score.sizes.length) return null;
	const performances = score.sizes.map((size) => size.performance).filter((value) => Number.isFinite(value));
	if (performances.length < 2) return null;
	const min = Math.min(...performances);
	const max = Math.max(...performances);
	if (max <= 0) return null;
	return normalizeScore((min / max) * 100);
}

/** Overall SCL: average scalability across eligible benchmarks that have size data. */
export function overallScalability(benchmarkScores: BenchmarkScore[]): number | null {
	const values: number[] = [];
	for (const score of benchmarkScores) {
		const scalability = scalabilityFromSizes(score);
		if (scalability !== null) values.push(scalability);
	}
	if (!values.length) return null;
	return normalizeScore(average(values));
}

/**
 * Pressure Proof retention for one language across eligible benchmarks.
 * retention = 100 × min(1, largeRelative / smallRelative) averaged over pairs.
 */
export function pressureProofRetention(
	languageId: string,
	benchmarkScoresById: Record<string, BenchmarkScore[]>
): number | null {
	const retentions: number[] = [];
	for (const scores of Object.values(benchmarkScoresById)) {
		const score = scores.find((entry) => entry.language.id === languageId);
		if (!score?.eligible) continue;
		const small = score.sizes.find((size) => size.size === 'small');
		const large = score.sizes.find((size) => size.size === 'large');
		if (!small || !large || small.performance <= 0) continue;
		retentions.push(normalizeScore(100 * Math.min(1, large.performance / small.performance)));
	}
	if (!retentions.length) return null;
	return normalizeScore(average(retentions));
}

function attributeFromRating(
	definition: (typeof CORE_ATTRIBUTE_DEFINITIONS)[number],
	rating: number | null,
	evidence: string[]
): CardAttribute {
	if (rating === null) {
		return {
			id: definition.id,
			label: definition.label,
			abbreviation: definition.abbreviation,
			rating: null,
			category: definition.category,
			available: false,
			evidence
		};
	}
	return {
		id: definition.id,
		label: definition.label,
		abbreviation: definition.abbreviation,
		rating: normalizeScore(rating),
		category: definition.category,
		available: true,
		evidence
	};
}

export type AttributeContext = {
	overall: BenchmarkScore;
	/** Eligible benchmark scores for this language, keyed by benchmark id. */
	benchmarkById: Record<string, BenchmarkScore | undefined>;
	/** All language scores per benchmark (for cohort-derived metrics). */
	benchmarkScoresById: Record<string, BenchmarkScore[]>;
};

export function calculateAttributes(ctx: AttributeContext): CardAttribute[] {
	const { overall, benchmarkById, benchmarkScoresById } = ctx;
	const scalabilityValues = Object.values(benchmarkById)
		.map((score) => scalabilityFromSizes(score))
		.filter((value): value is number => value !== null);
	const scl =
		scalabilityValues.length > 0 ? normalizeScore(average(scalabilityValues)) : overallScalability(
			Object.values(benchmarkScoresById)
				.map((scores) => scores.find((entry) => entry.language.id === overall.language.id))
				.filter((score): score is BenchmarkScore => Boolean(score))
		);

	const ratings: Record<string, { rating: number | null; evidence: string[] }> = {
		'runtime-speed': {
			rating: overall.eligible ? overall.performance : null,
			evidence: overall.eligible ? ['Overall performance score'] : ['Overall performance unavailable']
		},
		consistency: {
			rating: overall.eligible ? overall.consistency : null,
			evidence: overall.eligible ? ['Overall consistency score'] : ['Overall consistency unavailable']
		},
		scalability: {
			rating: scl,
			evidence: scl === null ? ['Insufficient size coverage for scalability'] : ['Average min/max size performance ratio']
		},
		compute: {
			rating: benchmarkById.nbody?.eligible ? benchmarkById.nbody.overall : null,
			evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.compute}`]
		},
		algorithms: {
			rating: benchmarkById['shortest-path']?.eligible ? benchmarkById['shortest-path'].overall : null,
			evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.algorithms}`]
		},
		'data-processing': {
			rating: benchmarkById.aggregation?.eligible ? benchmarkById.aggregation.overall : null,
			evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS['data-processing']}`]
		}
	};

	return CORE_ATTRIBUTE_DEFINITIONS.map((definition) => {
		const entry = ratings[definition.id] ?? { rating: null, evidence: [] };
		return attributeFromRating(definition, entry.rating, entry.evidence);
	});
}

export function attributeMap(attributes: CardAttribute[]): Record<string, CardAttribute> {
	return Object.fromEntries(attributes.map((attribute) => [attribute.abbreviation, attribute]));
}

export function coreAttributeSpread(attributes: CardAttribute[]): number | null {
	const available = attributes
		.filter((attribute) => CORE_ATTRIBUTE_DEFINITIONS.some((definition) => definition.id === attribute.id))
		.filter((attribute) => attribute.available && attribute.rating !== null)
		.map((attribute) => attribute.rating!);
	if (available.length < 2) return null;
	return Math.max(...available) - Math.min(...available);
}
