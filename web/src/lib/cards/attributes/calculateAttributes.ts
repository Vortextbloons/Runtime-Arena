import type { ArenaResult, BenchmarkScore } from '../../types.ts';
import type { CardAttribute } from '../types.ts';
import {
	ALL_ATTRIBUTE_DEFINITIONS,
	BENCHMARK_ATTRIBUTE_IDS,
	CORE_ATTRIBUTE_DEFINITIONS,
	type AttributeDefinition
} from './definitions.ts';
import {
	averageLogicalLinesForLanguage,
	codeEconomyRaw
} from '../../implementationLines.ts';
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

/** Relative score where higher raw values are better (best → 100). */
export function relativeHigherIsBetter(value: number, field: number[]): number | null {
	const positive = field.filter((entry) => Number.isFinite(entry) && entry > 0);
	if (!positive.length || !Number.isFinite(value) || value <= 0) return null;
	const best = Math.max(...positive);
	return normalizeScore((value / best) * 100);
}

/** Relative score where lower raw values are better (best → 100). */
export function relativeLowerIsBetter(value: number, field: number[]): number | null {
	const positive = field.filter((entry) => Number.isFinite(entry) && entry > 0);
	if (!positive.length || !Number.isFinite(value) || value <= 0) return null;
	const best = Math.min(...positive);
	return normalizeScore((best / value) * 100);
}

export function representativeBuildDuration(results: ArenaResult[]): number | null {
	const measured = results
		.map((result) => result.build)
		.filter(
			(build): build is NonNullable<ArenaResult['build']> =>
				Boolean(build) &&
				(build!.status === 'success' || build!.status === 'cached') &&
				build!.durationNanoseconds > 0
		)
		.map((build) => build.durationNanoseconds);
	if (!measured.length) return null;
	return Math.min(...measured);
}

export function representativeArtifactBytes(results: ArenaResult[]): number | null {
	const sizes = results
		.map((result) => result.build?.artifactSizeBytes)
		.filter((size): size is number => typeof size === 'number' && size > 0);
	if (!sizes.length) return null;
	return Math.min(...sizes);
}

export function representativeStartupNanoseconds(results: ArenaResult[]): number | null {
	const values = results
		.map((result) => result.execution.startup?.durationNanoseconds)
		.filter((value): value is number => typeof value === 'number' && value > 0);
	if (!values.length) return null;
	return average(values);
}

export function representativePeakMemoryBytes(results: ArenaResult[]): number | null {
	const collectors = new Set(
		results
			.map((result) => result.execution.memory?.collector ?? result.execution.memoryCollector)
			.filter((collector): collector is string => Boolean(collector))
	);
	// Comparable only when every contributing cell shares a collector identity,
	// or when sample peak memory is present without conflicting collectors.
	const explicit = results
		.map((result) => result.execution.memory?.peakResidentBytes)
		.filter((value): value is number => typeof value === 'number' && value > 0);
	if (explicit.length) {
		if (collectors.size > 1) return null;
		return average(explicit);
	}

	const samplePeaks: number[] = [];
	for (const result of results) {
		const peaks = result.execution.samples
			.map((sample) => sample.peakMemoryBytes)
			.filter((value): value is number => typeof value === 'number' && value > 0);
		if (peaks.length) samplePeaks.push(average(peaks));
	}
	if (!samplePeaks.length) return null;
	if (collectors.size > 1) return null;
	return average(samplePeaks);
}

export function parallelScalingScore(results: ArenaResult[]): number | null {
	const scored: number[] = [];
	for (const result of results) {
		const parallel = result.execution.parallel;
		if (!parallel) continue;
		if (
			parallel.workerCount < 2 ||
			!parallel.singleWorkerBaselineNanoseconds ||
			!parallel.multiWorkerNanoseconds ||
			parallel.singleWorkerBaselineNanoseconds <= 0 ||
			parallel.multiWorkerNanoseconds <= 0
		) {
			continue;
		}
		const ideal = parallel.singleWorkerBaselineNanoseconds / parallel.workerCount;
		const efficiency = Math.min(1, ideal / parallel.multiWorkerNanoseconds);
		scored.push(normalizeScore(efficiency * 100));
	}
	if (!scored.length) return null;
	return normalizeScore(average(scored));
}

function attributeFromRating(
	definition: AttributeDefinition,
	rating: number | null,
	evidence: string[],
	extras: Partial<CardAttribute> = {}
): CardAttribute {
	if (rating === null) {
		return {
			id: definition.id,
			label: definition.label,
			abbreviation: definition.abbreviation,
			rating: null,
			category: definition.category,
			available: false,
			evidence,
			...extras
		};
	}
	return {
		id: definition.id,
		label: definition.label,
		abbreviation: definition.abbreviation,
		rating: normalizeScore(rating),
		category: definition.category,
		available: true,
		evidence,
		...extras
	};
}

export type AttributeContext = {
	overall: BenchmarkScore;
	overallScores: BenchmarkScore[];
	/** Eligible benchmark scores for this language, keyed by benchmark id. */
	benchmarkById: Record<string, BenchmarkScore | undefined>;
	/** All language scores per benchmark (for cohort-derived metrics). */
	benchmarkScoresById: Record<string, BenchmarkScore[]>;
	/** Raw results for this language. */
	languageResults: ArenaResult[];
	/** Cohort raw-value maps for relative lower-is-better attributes. */
	cohortRaw: {
		buildDurations: Map<string, number>;
		artifactBytes: Map<string, number>;
		startupNanoseconds: Map<string, number>;
		peakMemoryBytes: Map<string, number>;
		averageImplementationLines: Map<string, number>;
	};
};

export function cohortCodeEconomyValues(
	overallScores: BenchmarkScore[],
	averageImplementationLines: Map<string, number>
): number[] {
	const values: number[] = [];
	for (const score of overallScores) {
		if (!score.eligible || score.performance === null) continue;
		const lines = averageImplementationLines.get(score.language.id);
		if (lines === undefined) continue;
		const raw = codeEconomyRaw(score.performance, lines);
		if (raw !== null) values.push(raw);
	}
	return values;
}

export function calculateAttributes(ctx: AttributeContext): CardAttribute[] {
	const { overall, overallScores, benchmarkById, benchmarkScoresById, languageResults, cohortRaw } = ctx;
	const languageId = overall.language.id;
	const scalabilityValues = Object.values(benchmarkById)
		.map((score) => scalabilityFromSizes(score))
		.filter((value): value is number => value !== null);
	const scl =
		scalabilityValues.length > 0
			? normalizeScore(average(scalabilityValues))
			: overallScalability(
					Object.values(benchmarkScoresById)
						.map((scores) => scores.find((entry) => entry.language.id === languageId))
						.filter((score): score is BenchmarkScore => Boolean(score))
				);

	const buildDuration = cohortRaw.buildDurations.get(languageId);
	const artifactBytes = cohortRaw.artifactBytes.get(languageId);
	const startupNs = cohortRaw.startupNanoseconds.get(languageId);
	const peakMemory = cohortRaw.peakMemoryBytes.get(languageId);
	const averageLines = cohortRaw.averageImplementationLines.get(languageId);
	const codeEconomyField = cohortCodeEconomyValues(overallScores, cohortRaw.averageImplementationLines);
	const codeEconomy =
		overall.eligible && overall.performance !== null && averageLines !== undefined
			? codeEconomyRaw(overall.performance, averageLines)
			: null;
	const parallelScaling = parallelScalingScore(
		languageResults.filter((result) => result.benchmark.id === BENCHMARK_ATTRIBUTE_IDS.parallelism)
	);
	const parallelBenchmark = benchmarkById[BENCHMARK_ATTRIBUTE_IDS.parallelism];
	const ioBenchmark = benchmarkById[BENCHMARK_ATTRIBUTE_IDS.io];

	const ratings: Record<string, { rating: number | null; evidence: string[]; extras?: Partial<CardAttribute> }> =
		{
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
				evidence:
					scl === null
						? ['Insufficient size coverage for scalability']
						: ['Average min/max size performance ratio']
			},
			compute: {
				rating: benchmarkById.nbody?.eligible ? benchmarkById.nbody.overall : null,
				evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.compute}`]
			},
			algorithms: {
				rating: benchmarkById['shortest-path']?.eligible
					? benchmarkById['shortest-path'].overall
					: null,
				evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.algorithms}`]
			},
			'data-processing': {
				rating: benchmarkById.aggregation?.eligible ? benchmarkById.aggregation.overall : null,
				evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS['data-processing']}`]
			},
			'build-speed': {
				rating:
					buildDuration === undefined
						? null
						: relativeLowerIsBetter(buildDuration, [...cohortRaw.buildDurations.values()]),
				evidence:
					buildDuration === undefined
						? ['No measured build duration (skipped/cached/zero)']
						: [`Build duration ${buildDuration} ns`],
				extras: buildDuration === undefined ? undefined : { rawValue: buildDuration, unit: 'ns' }
			},
			'artifact-efficiency': {
				rating:
					artifactBytes === undefined
						? null
						: relativeLowerIsBetter(artifactBytes, [...cohortRaw.artifactBytes.values()]),
				evidence:
					artifactBytes === undefined
						? ['No meaningful artifact size']
						: [`Artifact size ${artifactBytes} bytes`],
				extras: artifactBytes === undefined ? undefined : { rawValue: artifactBytes, unit: 'bytes' }
			},
			startup: {
				rating:
					startupNs === undefined
						? null
						: relativeLowerIsBetter(startupNs, [...cohortRaw.startupNanoseconds.values()]),
				evidence:
					startupNs === undefined
						? ['No explicit startup measurement']
						: [`Startup duration ${startupNs} ns`],
				extras: startupNs === undefined ? undefined : { rawValue: startupNs, unit: 'ns' }
			},
			memory: {
				rating:
					peakMemory === undefined
						? null
						: relativeLowerIsBetter(peakMemory, [...cohortRaw.peakMemoryBytes.values()]),
				evidence:
					peakMemory === undefined
						? ['No comparable peak memory measurement']
						: [`Peak memory ${peakMemory} bytes`],
				extras: peakMemory === undefined ? undefined : { rawValue: peakMemory, unit: 'bytes' }
			},
			io: {
				rating: ioBenchmark?.eligible ? ioBenchmark.overall : null,
				evidence: [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.io}`]
			},
			parallelism: {
				rating:
					parallelScaling !== null
						? parallelScaling
						: parallelBenchmark?.eligible
							? parallelBenchmark.overall
							: null,
				evidence:
					parallelScaling !== null
						? ['Parallel scaling efficiency vs single-worker baseline']
						: parallelBenchmark?.eligible
							? [`Benchmark ${BENCHMARK_ATTRIBUTE_IDS.parallelism}`]
							: ['No parallel workload or scaling measurement']
			},
			'implementation-size': {
				rating:
					averageLines === undefined
						? null
						: relativeLowerIsBetter(averageLines, [...cohortRaw.averageImplementationLines.values()]),
				evidence:
					averageLines === undefined
						? ['No implementation line count available']
						: [`Average ${Math.round(averageLines)} logical lines per benchmark`],
				extras: averageLines === undefined ? undefined : { rawValue: averageLines, unit: 'lines' }
			},
			'code-economy': {
				rating:
					codeEconomy === null ? null : relativeHigherIsBetter(codeEconomy, codeEconomyField),
				evidence:
					codeEconomy === null
						? ['Code economy unavailable without eligible performance and line counts']
						: [`${codeEconomy.toFixed(2)} performance points per 100 logical lines`],
				extras: codeEconomy === null ? undefined : { rawValue: codeEconomy, unit: 'pts/100 lines' }
			}
		};

	return ALL_ATTRIBUTE_DEFINITIONS.map((definition) => {
		const entry = ratings[definition.id] ?? { rating: null, evidence: [] };
		return attributeFromRating(definition, entry.rating, entry.evidence, entry.extras);
	});
}

export function buildCohortRawMaps(results: ArenaResult[]): AttributeContext['cohortRaw'] {
	const byLanguage = new Map<string, ArenaResult[]>();
	for (const result of results) {
		const list = byLanguage.get(result.language.id) ?? [];
		list.push(result);
		byLanguage.set(result.language.id, list);
	}

	const buildDurations = new Map<string, number>();
	const artifactBytes = new Map<string, number>();
	const startupNanoseconds = new Map<string, number>();
	const peakMemoryBytes = new Map<string, number>();
	const averageImplementationLines = new Map<string, number>();

	for (const [languageId, languageResults] of byLanguage) {
		const build = representativeBuildDuration(languageResults);
		if (build !== null) buildDurations.set(languageId, build);
		const artifact = representativeArtifactBytes(languageResults);
		if (artifact !== null) artifactBytes.set(languageId, artifact);
		const startup = representativeStartupNanoseconds(languageResults);
		if (startup !== null) startupNanoseconds.set(languageId, startup);
		const memory = representativePeakMemoryBytes(languageResults);
		if (memory !== null) peakMemoryBytes.set(languageId, memory);
		const benchmarkIds = [...new Set(languageResults.map((result) => result.benchmark.id))];
		const lines = averageLogicalLinesForLanguage(languageId, benchmarkIds);
		if (lines !== null) averageImplementationLines.set(languageId, lines);
	}

	return { buildDurations, artifactBytes, startupNanoseconds, peakMemoryBytes, averageImplementationLines };
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
