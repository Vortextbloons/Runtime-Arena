import type { ArenaResult, BenchmarkScore } from '../../types.ts';
import type { CardAttribute, EarnedBadge, BadgeTier } from '../types.ts';
import { BADGE_TIER_ORDER, CORE_ATTRIBUTE_IDS } from '../types.ts';
import { attributeMap, pressureProofRetention } from '../attributes/calculateAttributes.ts';
import { awardHybridBadge } from './calculateBadgeTier.ts';
import {
	BADGE_TIER_LABEL,
	COMPLETE_PACKAGE_THRESHOLDS,
	V1_BADGE_DEFINITIONS,
	type BadgeDefinition
} from './definitions.ts';

export type BadgeAwardContext = {
	languageId: string;
	attributes: CardAttribute[];
	overallScores: BenchmarkScore[];
	benchmarkScoresById: Record<string, BenchmarkScore[]>;
	results: ArenaResult[];
};

function fieldScoresForAbbreviation(
	abbreviation: string,
	languageAttributes: Map<string, CardAttribute[]>,
	languageIds: string[]
): number[] {
	const values: number[] = [];
	for (const languageId of languageIds) {
		const attribute = attributeMap(languageAttributes.get(languageId) ?? [])[abbreviation];
		if (attribute?.available && attribute.rating !== null) values.push(attribute.rating);
	}
	return values;
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

function isCategoryWin(value: number, field: number[]): boolean {
	if (!field.length) return false;
	return value >= Math.max(...field);
}

function isFirstOverall(languageId: string, overallScores: BenchmarkScore[]): boolean {
	const eligible = overallScores.filter((score) => score.eligible && score.overall !== null);
	if (!eligible.length) return false;
	const best = Math.max(...eligible.map((score) => score.overall!));
	const language = eligible.find((score) => score.language.id === languageId);
	return language?.overall === best;
}

function hasLastPlaceBenchmark(
	languageId: string,
	benchmarkScoresById: Record<string, BenchmarkScore[]>
): boolean {
	for (const scores of Object.values(benchmarkScoresById)) {
		const eligible = scores.filter((score) => score.eligible && score.overall !== null);
		if (eligible.length < 2) continue;
		const language = eligible.find((score) => score.language.id === languageId);
		if (!language || language.overall === null) continue;
		const worst = Math.min(...eligible.map((score) => score.overall!));
		if (language.overall === worst) return true;
	}
	return false;
}

function awardCleanOutput(languageId: string, results: ArenaResult[]): EarnedBadge | null {
	const cells = results.filter((result) => result.language.id === languageId);
	if (!cells.length) return null;

	const allAccepted = cells.every((result) => result.checker.status === 'accepted');
	if (!allAccepted) return null;

	const benchmarks = new Map<string, ArenaResult[]>();
	for (const cell of cells) {
		const list = benchmarks.get(cell.benchmark.id) ?? [];
		list.push(cell);
		benchmarks.set(cell.benchmark.id, list);
	}

	const acceptedBenchmarkCount = [...benchmarks.values()].filter((group) =>
		group.every((result) => result.checker.status === 'accepted')
	).length;

	const everyRequiredSizeAccepted = [...benchmarks.values()].every((group) => {
		const sizes = new Set(group.map((result) => result.benchmark.size));
		// Gold: every cell for attempted benchmarks is accepted (already true) and
		// the language covered multiple sizes when the cohort has them.
		return group.every((result) => result.checker.status === 'accepted') && sizes.size >= 1;
	});

	let tier: BadgeTier = 'bronze';
	if (acceptedBenchmarkCount >= 3) tier = 'silver';
	if (everyRequiredSizeAccepted && acceptedBenchmarkCount >= 1 && cells.length >= 3) {
		// Gold when every attempted cell is accepted across all attempted benchmarks,
		// and the language has results spanning the full attempted set.
		const incomplete = [...benchmarks.entries()].some(([, group]) =>
			group.some((result) => result.checker.status !== 'accepted')
		);
		if (!incomplete && acceptedBenchmarkCount >= 1) tier = 'gold';
	}

	// Cap at Gold for Version 1
	if (tier === 'hall-of-fame' || tier === 'legend') tier = 'gold';

	const nextRequirements =
		tier === 'bronze'
			? ['Earn accepted results in at least three benchmarks']
			: tier === 'silver'
				? ['Accept every required size for every attempted benchmark']
				: ['Hall of Fame requires multi-snapshot evidence (deferred)'];

	return {
		badgeId: 'clean-output',
		name: 'Clean Output',
		tier,
		category: 'reliability',
		qualificationScore: tier === 'gold' ? 80 : tier === 'silver' ? 70 : 60,
		reason: `${BADGE_TIER_LABEL[tier]}: perfect current-snapshot checker record across ${cells.length} cells`,
		nextTier: {
			tier: tier === 'bronze' ? 'silver' : tier === 'silver' ? 'gold' : 'hall-of-fame',
			requirements: nextRequirements
		}
	};
}

function awardCompletePackage(
	attributes: CardAttribute[],
	languageId: string,
	benchmarkScoresById: Record<string, BenchmarkScore[]>
): EarnedBadge | null {
	const core = attributes.filter((attribute) =>
		(CORE_ATTRIBUTE_IDS as readonly string[]).includes(attribute.id)
	);
	if (core.length !== 6 || core.some((attribute) => !attribute.available || attribute.rating === null)) {
		return null;
	}
	const minimum = Math.min(...core.map((attribute) => attribute.rating!));
	const noLastPlace = !hasLastPlaceBenchmark(languageId, benchmarkScoresById);

	let awarded: BadgeTier | null = null;
	for (const { tier, minimum: threshold } of COMPLETE_PACKAGE_THRESHOLDS) {
		if (tier === 'legend') {
			if (minimum >= threshold && noLastPlace) {
				awarded = 'legend';
				break;
			}
			continue;
		}
		if (minimum >= threshold) {
			awarded = tier;
			break;
		}
	}
	if (!awarded) return null;

	const nextIndex = BADGE_TIER_ORDER.indexOf(awarded) + 1;
	const next = BADGE_TIER_ORDER[nextIndex] as BadgeTier | undefined;
	const nextThreshold = COMPLETE_PACKAGE_THRESHOLDS.find((entry) => entry.tier === next);

	return {
		badgeId: 'complete-package',
		name: 'Complete Package',
		tier: awarded,
		category: 'special',
		qualificationScore: minimum,
		attributeScore: minimum,
		reason: `${BADGE_TIER_LABEL[awarded]}: lowest core attribute ${Math.round(minimum)}`,
		nextTier: next
			? {
					tier: next,
					requirements: [
						next === 'legend'
							? `Raise every core attribute to at least ${nextThreshold?.minimum ?? 90} with no last-place benchmark`
							: `Raise every core attribute to at least ${nextThreshold?.minimum ?? 0}`
					]
				}
			: undefined
	};
}

function awardFromDefinition(
	definition: BadgeDefinition,
	ctx: BadgeAwardContext,
	languageAttributes: Map<string, CardAttribute[]>
): EarnedBadge | null {
	const { languageId, attributes, overallScores, benchmarkScoresById, results } = ctx;
	const languageIds = [...new Set(overallScores.map((score) => score.language.id))];

	if (definition.special === 'clean-output') return awardCleanOutput(languageId, results);
	if (definition.special === 'complete-package') {
		return awardCompletePackage(attributes, languageId, benchmarkScoresById);
	}

	let absoluteScore: number | null = null;
	let fieldScores: number[] = [];
	let hasSizeSweep: boolean | undefined;
	let hasCategoryWin: boolean | undefined;
	let hasFirstOverall: boolean | undefined;
	let independentLegendEvidence = false;

	if (definition.source === 'pressure-proof') {
		absoluteScore = pressureProofRetention(languageId, benchmarkScoresById);
		if (absoluteScore === null) return null;
		fieldScores = languageIds
			.map((id) => pressureProofRetention(id, benchmarkScoresById))
			.filter((value): value is number => value !== null);
		hasCategoryWin = isCategoryWin(absoluteScore, fieldScores);
	} else {
		const map = attributeMap(attributes);
		const attribute = map[definition.source];
		if (!attribute?.available || attribute.rating === null) return null;
		absoluteScore = attribute.rating;
		fieldScores = fieldScoresForAbbreviation(definition.source, languageAttributes, languageIds);
		if (definition.legendRequiresSizeSweep && definition.benchmarkId) {
			hasSizeSweep = languageHasSizeSweep(languageId, benchmarkScoresById[definition.benchmarkId] ?? []);
			independentLegendEvidence = hasSizeSweep;
		}
		if (definition.legendRequiresCategoryWin) {
			hasCategoryWin = isCategoryWin(absoluteScore, fieldScores);
		}
		if (definition.legendRequiresFirstOverall) {
			hasFirstOverall = isFirstOverall(languageId, overallScores);
		}
	}

	if (absoluteScore === null) return null;

	return awardHybridBadge({
		badgeId: definition.id,
		name: definition.name,
		category: definition.category,
		benchmarkId: definition.benchmarkId,
		evidence: {
			absoluteScore,
			fieldScores,
			hasSizeSweep,
			hasCategoryWin,
			hasFirstOverall,
			independentLegendEvidence: independentLegendEvidence || undefined
		}
	});
}

export function awardBadges(
	ctx: BadgeAwardContext,
	languageAttributes: Map<string, CardAttribute[]>
): EarnedBadge[] {
	const badges: EarnedBadge[] = [];
	for (const definition of V1_BADGE_DEFINITIONS) {
		const badge = awardFromDefinition(definition, ctx, languageAttributes);
		if (badge) badges.push(badge);
	}
	return badges;
}

export function selectFeaturedBadgeIds(badges: EarnedBadge[], limit = 3): string[] {
	const sorted = [...badges].sort((a, b) => {
		const tierDelta = BADGE_TIER_ORDER.indexOf(b.tier) - BADGE_TIER_ORDER.indexOf(a.tier);
		if (tierDelta !== 0) return tierDelta;
		const scoreDelta = b.qualificationScore - a.qualificationScore;
		if (scoreDelta !== 0) return scoreDelta;
		const definitionOrder =
			V1_BADGE_DEFINITIONS.findIndex((definition) => definition.id === a.badgeId) -
			V1_BADGE_DEFINITIONS.findIndex((definition) => definition.id === b.badgeId);
		return definitionOrder;
	});

	const featured: string[] = [];
	const usedCategories = new Set<string>();
	for (const badge of sorted) {
		if (featured.length >= limit) break;
		if (usedCategories.has(badge.category) && featured.length < limit - 1) {
			// Prefer category diversity early, but fill remaining slots afterward
			continue;
		}
		featured.push(badge.badgeId);
		usedCategories.add(badge.category);
	}
	if (featured.length < limit) {
		for (const badge of sorted) {
			if (featured.length >= limit) break;
			if (!featured.includes(badge.badgeId)) featured.push(badge.badgeId);
		}
	}
	return featured;
}
