import type { ArenaResult, BenchmarkScore } from '../types.ts';
import { scoreBenchmark, scoreOverall } from '../scoring.ts';
import {
	buildCohortRawMaps,
	calculateAttributes
} from './attributes/calculateAttributes.ts';
import { BENCHMARK_ATTRIBUTE_IDS } from './attributes/definitions.ts';
import { generateBuildName } from './archetypes/buildNames.ts';
import { awardBadges, selectFeaturedBadgeIds } from './badges/awardBadges.ts';
import {
	displayClassifications,
	getLanguageClassification
} from './classifications.ts';
import {
	calculateDivisionRanks,
	divisionLanguagesFromScores,
	selectFeaturedDivisionRank
} from './divisions/calculateDivisionRanks.ts';
import {
	calculatePrimaryTakeover,
	calculateSecondaryTakeover
} from './takeovers/calculateTakeover.ts';
import type { CardAttribute, LanguageCardData } from './types.ts';
import { cardTierFromOverall } from './util.ts';

const ATTRIBUTE_BENCHMARK_IDS = [
	BENCHMARK_ATTRIBUTE_IDS.compute,
	BENCHMARK_ATTRIBUTE_IDS.algorithms,
	BENCHMARK_ATTRIBUTE_IDS['data-processing'],
	BENCHMARK_ATTRIBUTE_IDS.io,
	BENCHMARK_ATTRIBUTE_IDS.parallelism
] as const;

export type BuildCardsOptions = {
	snapshotId: string;
	measuredAt?: string;
	results: ArenaResult[];
	overallScores?: BenchmarkScore[];
	benchmarkScoresById?: Record<string, BenchmarkScore[]>;
};

function collectBenchmarkScores(
	results: ArenaResult[],
	precomputed?: Record<string, BenchmarkScore[]>
): Record<string, BenchmarkScore[]> {
	if (precomputed) return precomputed;
	const byId: Record<string, BenchmarkScore[]> = {};
	const benchmarkIds = [...new Set(results.map((result) => result.benchmark.id))];
	for (const benchmarkId of benchmarkIds) {
		byId[benchmarkId] = scoreBenchmark(results, benchmarkId);
	}
	return byId;
}

function resolveCardSpecVersion(attributes: CardAttribute[]): '1' | '1.5' | '2' {
	const ids = new Set(attributes.filter((attribute) => attribute.available).map((attribute) => attribute.id));
	if (
		ids.has('startup') ||
		ids.has('memory') ||
		ids.has('io') ||
		ids.has('parallelism')
	) {
		return '2';
	}
	if (ids.has('build-speed') || ids.has('artifact-efficiency')) return '1.5';
	return '1';
}

export function buildCardDataForLanguage(options: {
	languageId: string;
	snapshotId: string;
	measuredAt?: string;
	overallScores: BenchmarkScore[];
	benchmarkScoresById: Record<string, BenchmarkScore[]>;
	results: ArenaResult[];
	attributesByLanguage: Map<string, CardAttribute[]>;
	divisionRanksByLanguage: Map<string, LanguageCardData['divisionRanks']>;
}): LanguageCardData {
	const {
		languageId,
		snapshotId,
		measuredAt,
		overallScores,
		benchmarkScoresById,
		results,
		attributesByLanguage,
		divisionRanksByLanguage
	} = options;

	const overall =
		overallScores.find((score) => score.language.id === languageId) ??
		({
			benchmarkId: 'overall',
			language: { id: languageId, name: languageId, version: '' },
			eligible: false,
			overall: null,
			performance: null,
			consistency: null,
			versatility: null,
			sizes: [],
			expectedSizes: [],
			diagnostics: []
		} satisfies BenchmarkScore);

	const attributes = attributesByLanguage.get(languageId) ?? [];
	const classification = getLanguageClassification(languageId);
	const badges = awardBadges(
		{
			languageId,
			attributes,
			overallScores,
			benchmarkScoresById,
			results
		},
		attributesByLanguage
	);
	const divisionRanks = divisionRanksByLanguage.get(languageId) ?? [];
	const primary = calculatePrimaryTakeover(attributes);
	const secondary = calculateSecondaryTakeover(attributes, primary);
	const languageResult = results.find((result) => result.language.id === languageId);

	return {
		languageId,
		languageName: overall.language.name,
		overall: overall.eligible ? overall.overall : null,
		cardTier: cardTierFromOverall(overall.eligible ? overall.overall : null),
		buildName: generateBuildName(classification, attributes),
		classifications: {
			executionModels: classification.executionModels,
			roles: classification.roles,
			memoryModels: classification.memoryModels
		},
		displayClassifications: displayClassifications(classification),
		attributes,
		badges,
		featuredBadgeIds: selectFeaturedBadgeIds(badges),
		takeover: {
			primary,
			...(secondary ? { secondary } : {})
		},
		divisionRanks,
		featuredDivisionRank: selectFeaturedDivisionRank(divisionRanks),
		runtime: {
			name: overall.language.id,
			version: overall.language.version,
			compilerVersion: languageResult?.language.compilerVersion
		},
		metadata: {
			snapshotId,
			measuredAt,
			cardSpecVersion: resolveCardSpecVersion(attributes)
		}
	};
}

/** Build language cards for every language present in the snapshot (V1–V2). */
export function buildAllCardData(options: BuildCardsOptions): LanguageCardData[] {
	const overallScores = options.overallScores ?? scoreOverall(options.results);
	const benchmarkScoresById = collectBenchmarkScores(options.results, options.benchmarkScoresById);
	const cohortRaw = buildCohortRawMaps(options.results);

	const attributesByLanguage = new Map<string, CardAttribute[]>();
	for (const overall of overallScores) {
		const languageId = overall.language.id;
		const languageResults = options.results.filter((result) => result.language.id === languageId);
		const benchmarkById: Record<string, BenchmarkScore | undefined> = {};
		for (const benchmarkId of ATTRIBUTE_BENCHMARK_IDS) {
			benchmarkById[benchmarkId] = benchmarkScoresById[benchmarkId]?.find(
				(score) => score.language.id === languageId
			);
		}
		for (const [benchmarkId, scores] of Object.entries(benchmarkScoresById)) {
			if (!(benchmarkId in benchmarkById)) {
				benchmarkById[benchmarkId] = scores.find((score) => score.language.id === languageId);
			}
		}
		attributesByLanguage.set(
			languageId,
			calculateAttributes({
				overall,
				benchmarkById,
				benchmarkScoresById,
				languageResults,
				cohortRaw
			})
		);
	}

	const divisionRanksByLanguage = calculateDivisionRanks(
		divisionLanguagesFromScores(overallScores, getLanguageClassification)
	);

	return overallScores.map((overall) =>
		buildCardDataForLanguage({
			languageId: overall.language.id,
			snapshotId: options.snapshotId,
			measuredAt: options.measuredAt,
			overallScores,
			benchmarkScoresById,
			results: options.results,
			attributesByLanguage,
			divisionRanksByLanguage
		})
	);
}
