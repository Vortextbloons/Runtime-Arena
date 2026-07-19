import type { ArenaResult, BenchmarkScore, MutationScore, SizeScore } from './types';

const SIZE_ORDER = ['small', 'medium', 'large'];
export const MINIMUM_RANKED_MEDIAN_NANOSECONDS = 1_000_000;
export const SCORE_WEIGHTS = { performance: 0.75, versatility: 0.25 } as const;

const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const geometricMean = (values: number[]) =>
	values.length && values.every((value) => Number.isFinite(value) && value > 0)
		? Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)
		: 0;
const PERF_EXPONENT = 0.65;
const PERF_FLOOR = 5;
const clampScore = (value: number) => Math.max(0, Math.min(100, value));
const normalizeScore = (value: number) => Math.round(clampScore(value) * 1e9) / 1e9;
const performanceScore = (fastest: number, median: number) =>
	Math.max(PERF_FLOOR, normalizeScore(100 * Math.pow(fastest / median, PERF_EXPONENT)));
const weightedOverall = (performance: number, versatility: number) =>
	normalizeScore(performance * SCORE_WEIGHTS.performance + versatility * SCORE_WEIGHTS.versatility);

const variantKey = (size: string, mutation?: string) => (mutation ? `${size}/${mutation}` : size);

export function formatDuration(nanoseconds: number): string {
	if (nanoseconds < 1e6) return `${(nanoseconds / 1e3).toFixed(1)} µs`;
	if (nanoseconds < 1e9) return `${(nanoseconds / 1e6).toFixed(2)} ms`;
	return `${(nanoseconds / 1e9).toFixed(3)} s`;
}

export function formatVariation(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function completeResult(result: ArenaResult | undefined) {
	return Boolean(
		result &&
			result.checker.status === 'accepted' &&
			result.execution.summary.validSamples === result.execution.measuredIterations
	);
}

function mutationScore(result: ArenaResult, fastest: number): MutationScore {
	const summary = result.execution.summary;
	const mean = summary.meanKernelTimeNanoseconds ?? summary.medianKernelTimeNanoseconds;
	const deviation = summary.standardDeviationKernelTimeNanoseconds ?? 0;
	const variation = mean > 0 ? deviation / mean : 0;
	return {
		mutation: result.benchmark.mutation,
		result,
		medianNanoseconds: summary.medianKernelTimeNanoseconds,
		fastestMedianNanoseconds: fastest,
		p95Nanoseconds: summary.p95KernelTimeNanoseconds,
		variation,
		performance: performanceScore(fastest, summary.medianKernelTimeNanoseconds),
		consistency: clampScore(100 - variation * 400)
	};
}

export function scoreBenchmark(results: ArenaResult[], benchmarkId: string): BenchmarkScore[] {
	const cohort = results.filter((result) => result.benchmark.id === benchmarkId);
	const expectedSizes = [...new Set(cohort.map((result) => result.benchmark.size))].toSorted((a, b) => {
		const ai = SIZE_ORDER.indexOf(a);
		const bi = SIZE_ORDER.indexOf(b);
		return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.localeCompare(b);
	});
	const mutationsBySize = new Map<string, string[]>();
	for (const result of cohort) {
		const size = result.benchmark.size;
		const mutation = result.benchmark.mutation ?? '';
		const list = mutationsBySize.get(size) ?? [];
		if (!list.includes(mutation)) list.push(mutation);
		mutationsBySize.set(size, list.toSorted());
	}
	const languages = new Map(cohort.map((result) => [result.language.id, result.language]));
	const fastestByVariant = new Map<string, number>();

	for (const [size, mutations] of mutationsBySize) {
		for (const mutation of mutations) {
			const key = variantKey(size, mutation || undefined);
			const medians = cohort
				.filter(
					(result) =>
						result.benchmark.size === size &&
						(result.benchmark.mutation ?? '') === mutation &&
						completeResult(result)
				)
				.map((result) => result.execution.summary.medianKernelTimeNanoseconds)
				.filter((median) => Number.isFinite(median) && median > 0);
			const fastest = medians.length ? Math.min(...medians) : 0;
			if (fastest >= MINIMUM_RANKED_MEDIAN_NANOSECONDS) fastestByVariant.set(key, fastest);
		}
	}

	const rankedSizes = expectedSizes.filter((size) =>
		(mutationsBySize.get(size) ?? ['']).every((mutation) => fastestByVariant.has(variantKey(size, mutation || undefined)))
	);

	return [...languages.values()]
		.map((language): BenchmarkScore => {
			const languageResults = new Map(
				cohort
					.filter((result) => result.language.id === language.id)
					.map((result) => [variantKey(result.benchmark.size, result.benchmark.mutation), result])
			);
			const diagnostics: string[] = [];

			for (const size of expectedSizes) {
				for (const mutation of mutationsBySize.get(size) ?? ['']) {
					const label = variantKey(size, mutation || undefined);
					const result = languageResults.get(label);
					if (!result) {
						diagnostics.push(`Missing ${label} result.`);
						continue;
					}
					if (result.checker.status !== 'accepted') {
						diagnostics.push(`${label}: ${result.checker.status}.`, ...result.checker.diagnostics);
					}
					if (result.execution.summary.validSamples !== result.execution.measuredIterations) {
						diagnostics.push(
							`${label}: ${result.execution.summary.validSamples}/${result.execution.measuredIterations} measured samples are valid.`
						);
					}
				}
			}
			if (!rankedSizes.length) diagnostics.push('No size tier has a fastest valid median of at least 1 ms.');

			const eligible = diagnostics.length === 0;
			if (!eligible) {
				return {
					benchmarkId,
					language,
					eligible,
					overall: null,
					performance: null,
					consistency: null,
					versatility: null,
					sizes: [],
					expectedSizes: rankedSizes,
					diagnostics
				};
			}

			const sizes = rankedSizes.map((size): SizeScore => {
				const mutationScores = (mutationsBySize.get(size) ?? ['']).map((mutation) => {
					const result = languageResults.get(variantKey(size, mutation || undefined))!;
					return mutationScore(result, fastestByVariant.get(variantKey(size, mutation || undefined))!);
				});
				return {
					size,
					mutations: mutationScores,
					result: mutationScores[0]!.result,
					medianNanoseconds: average(mutationScores.map((entry) => entry.medianNanoseconds)),
					fastestMedianNanoseconds: average(mutationScores.map((entry) => entry.fastestMedianNanoseconds)),
					p95Nanoseconds: average(mutationScores.map((entry) => entry.p95Nanoseconds)),
					variation: average(mutationScores.map((entry) => entry.variation)),
					performance: normalizeScore(geometricMean(mutationScores.map((entry) => entry.performance))),
					consistency: average(mutationScores.map((entry) => entry.consistency))
				};
			});
			const performance = normalizeScore(geometricMean(sizes.map((size) => size.performance)));
			const consistency = average(sizes.map((size) => size.consistency));
			const overall = performance;

			return {
				benchmarkId,
				language,
				eligible,
				overall,
				performance,
				consistency,
				versatility: null,
				sizes,
				expectedSizes: rankedSizes,
				diagnostics
			};
		})
		.toSorted((a, b) => {
			if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
			return (b.overall ?? -1) - (a.overall ?? -1) || a.language.name.localeCompare(b.language.name);
		});
}

export function scoreOverall(results: ArenaResult[]): BenchmarkScore[] {
	const benchmarkIds = [...new Set(results.map((result) => result.benchmark.id))].toSorted();
	const benchmarkScores = new Map(benchmarkIds.map((id) => [id, scoreBenchmark(results, id)]));
	const languages = new Map(results.map((result) => [result.language.id, result.language]));

	return [...languages.values()]
		.map((language): BenchmarkScore => {
			const byBenchmark = benchmarkIds.map((benchmarkId) => ({
				benchmarkId,
				score: benchmarkScores.get(benchmarkId)?.find((entry) => entry.language.id === language.id)
			}));
			const present = byBenchmark.filter(
				(entry): entry is { benchmarkId: string; score: BenchmarkScore } => Boolean(entry.score)
			);
			const eligibleEntries = present.filter((entry) => entry.score.eligible).map((entry) => entry.score);
			const missing = benchmarkIds.filter((id) => !present.some((entry) => entry.benchmarkId === id));
			const invalid = present.filter((entry) => !entry.score.eligible);

			const diagnostics = [
				...missing.map((id) => `Skipped ${id} (no results in this snapshot).`),
				...invalid.flatMap((entry) =>
					entry.score.diagnostics.map((diagnostic) => `${entry.benchmarkId}: ${diagnostic}`)
				)
			];

			if (!eligibleEntries.length) {
				return {
					benchmarkId: 'overall',
					language,
					eligible: false,
					overall: null,
					performance: null,
					consistency: null,
					versatility: null,
					sizes: [],
					expectedSizes: benchmarkIds,
					diagnostics: diagnostics.length ? diagnostics : ['No eligible benchmark results.']
				};
			}

			const performance = normalizeScore(geometricMean(eligibleEntries.map((score) => score.performance!)));
			const consistency = average(eligibleEntries.map((score) => score.consistency!));
			const benchmarkPerformances = eligibleEntries.map((score) => score.performance!);
			const versatility = normalizeScore(0.6 * Math.min(...benchmarkPerformances) + 0.4 * average(benchmarkPerformances));
			const overall = weightedOverall(performance, versatility);

			return {
				benchmarkId: 'overall',
				language,
				eligible: true,
				overall,
				performance,
				consistency,
				versatility,
				sizes: [],
				expectedSizes: eligibleEntries.map((entry) => entry.benchmarkId),
				diagnostics,
				benchmarks: eligibleEntries.map((entry) => ({
					benchmarkId: entry.benchmarkId,
					overall: entry.overall!,
					performance: entry.performance!,
					consistency: entry.consistency!,
					versatility: entry.versatility!
				}))
			};
		})
		.toSorted((a, b) => {
			if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
			return (b.overall ?? -1) - (a.overall ?? -1) || a.language.name.localeCompare(b.language.name);
		});
}

export function scoreInterpretation(score: number): string {
	if (score >= 90) return 'Strong overall performance across speed and flexibility.';
	if (score >= 75) return 'Competitive overall performance across the ranked workloads.';
	if (score >= 60) return 'Solid results with room to improve speed or flexibility.';
	return 'Overall results trail this cohort across the ranked workloads.';
}

export function performanceLabel(relativeSpeed: number): string {
	if (relativeSpeed <= 1.05) return 'Photo Finish';
	if (relativeSpeed <= 1.15) return 'Contender';
	if (relativeSpeed <= 1.35) return 'Competitive';
	if (relativeSpeed <= 2.0) return 'In Range';
	if (relativeSpeed <= 4.0) return 'Trailing';
	return 'Outpaced';
}
