import type { ArenaResult, BenchmarkScore, SizeScore } from './types';

const SIZE_ORDER = ['small', 'medium', 'large'];

export const SCORE_WEIGHTS = {
	performance: 0.6,
	consistency: 0.25,
	scalability: 0.15
} as const;

const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const clampScore = (value: number) => Math.max(0, Math.min(100, value));

export function formatDuration(nanoseconds: number): string {
	if (nanoseconds < 1e6) return `${(nanoseconds / 1e3).toFixed(1)} µs`;
	if (nanoseconds < 1e9) return `${(nanoseconds / 1e6).toFixed(2)} ms`;
	return `${(nanoseconds / 1e9).toFixed(3)} s`;
}

export function formatVariation(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

export function scoreBenchmark(results: ArenaResult[], benchmarkId: string): BenchmarkScore[] {
	const cohort = results.filter((result) => result.benchmark.id === benchmarkId);
	const expectedSizes = [...new Set(cohort.map((result) => result.benchmark.size))]
		.toSorted((a, b) => {
			const ai = SIZE_ORDER.indexOf(a);
			const bi = SIZE_ORDER.indexOf(b);
			return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.localeCompare(b);
		});
	const languages = new Map(cohort.map((result) => [result.language.id, result.language]));
	const completeResult = (result: ArenaResult | undefined) =>
		Boolean(
			result &&
			result.checker.status === 'accepted' &&
			result.execution.summary.validSamples === result.execution.measuredIterations
		);
	const fastestBySize = new Map<string, number>();

	for (const size of expectedSizes) {
		const medians = cohort
			.filter((result) => result.benchmark.size === size && completeResult(result))
			.map((result) => result.execution.summary.medianWallTimeNanoseconds)
			.filter((median) => Number.isFinite(median) && median > 0);
		if (medians.length) fastestBySize.set(size, Math.min(...medians));
	}

	return [...languages.values()]
		.map((language): BenchmarkScore => {
			const languageResults = new Map(
				cohort
					.filter((result) => result.language.id === language.id)
					.map((result) => [result.benchmark.size, result])
			);
			const diagnostics: string[] = [];

			for (const size of expectedSizes) {
				const result = languageResults.get(size);
				if (!result) {
					diagnostics.push(`Missing ${size} result.`);
					continue;
				}
				if (result.checker.status !== 'accepted') {
					diagnostics.push(`${size}: ${result.checker.status}.`, ...result.checker.diagnostics);
				}
				if (result.execution.summary.validSamples !== result.execution.measuredIterations) {
					diagnostics.push(
						`${size}: ${result.execution.summary.validSamples}/${result.execution.measuredIterations} measured samples are valid.`
					);
				}
			}

			const eligible = diagnostics.length === 0 && expectedSizes.length > 0;
			if (!eligible) {
				return {
					benchmarkId,
					language,
					eligible,
					overall: null,
					performance: null,
					consistency: null,
					scalability: null,
					sizes: [],
					expectedSizes,
					diagnostics
				};
			}

			const sizes = expectedSizes.map((size): SizeScore => {
				const result = languageResults.get(size)!;
				const summary = result.execution.summary;
				const mean = summary.meanWallTimeNanoseconds ?? summary.medianWallTimeNanoseconds;
				const deviation = summary.standardDeviationWallTimeNanoseconds ?? 0;
				const variation = mean > 0 ? deviation / mean : 0;
				return {
					size,
					result,
					medianNanoseconds: summary.medianWallTimeNanoseconds,
					p95Nanoseconds: summary.p95WallTimeNanoseconds,
					variation,
					performance: clampScore((fastestBySize.get(size)! / summary.medianWallTimeNanoseconds) * 100),
					consistency: clampScore(100 - variation * 400)
				};
			});
			const performance = average(sizes.map((size) => size.performance));
			const consistency = average(sizes.map((size) => size.consistency));
			const sizePerformance = sizes.map((size) => size.performance);
			const maximumPerformance = Math.max(...sizePerformance);
			const scalability = maximumPerformance > 0 ? (Math.min(...sizePerformance) / maximumPerformance) * 100 : 0;
			const overall =
				performance * SCORE_WEIGHTS.performance +
				consistency * SCORE_WEIGHTS.consistency +
				scalability * SCORE_WEIGHTS.scalability;

			return {
				benchmarkId,
				language,
				eligible,
				overall,
				performance,
				consistency,
				scalability,
				sizes,
				expectedSizes,
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
			const entries = benchmarkIds
				.map((benchmarkId) => benchmarkScores.get(benchmarkId)?.find((score) => score.language.id === language.id))
				.filter((score): score is BenchmarkScore => Boolean(score));
			const invalid = entries.filter((score) => !score.eligible);
			if (entries.length !== benchmarkIds.length || invalid.length) {
				return {
					benchmarkId: 'overall',
					language,
					eligible: false,
					overall: null,
					performance: null,
					consistency: null,
					scalability: null,
					sizes: [],
					expectedSizes: benchmarkIds,
					diagnostics: [
						...benchmarkIds
							.filter((id) => !entries.some((entry) => entry.benchmarkId === id))
							.map((id) => `Missing ${id} benchmark results.`),
						...invalid.flatMap((entry) => entry.diagnostics.map((diagnostic) => `${entry.benchmarkId}: ${diagnostic}`))
					]
				};
			}

			const performance = average(entries.map((score) => score.performance!));
			const consistency = average(entries.map((score) => score.consistency!));
			const scalability = average(entries.map((score) => score.scalability!));
			const overall =
				performance * SCORE_WEIGHTS.performance +
				consistency * SCORE_WEIGHTS.consistency +
				scalability * SCORE_WEIGHTS.scalability;

			return {
				benchmarkId: 'overall',
				language,
				eligible: true,
				overall,
				performance,
				consistency,
				scalability,
				sizes: [],
				expectedSizes: benchmarkIds,
				diagnostics: [],
				benchmarks: entries.map((entry) => ({
					benchmarkId: entry.benchmarkId,
					overall: entry.overall!,
					performance: entry.performance!,
					consistency: entry.consistency!,
					scalability: entry.scalability!
				}))
			};
		})
		.toSorted((a, b) => {
			if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
			return (b.overall ?? -1) - (a.overall ?? -1) || a.language.name.localeCompare(b.language.name);
		});
}

export function scoreInterpretation(score: number): string {
	if (score >= 90) return 'Leading balance of speed and repeatability.';
	if (score >= 75) return 'Strong result with limited tradeoffs.';
	if (score >= 60) return 'Competitive, with a visible area to improve.';
	return 'Performance or repeatability trails this cohort.';
}
