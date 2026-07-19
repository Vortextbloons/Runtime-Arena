import type { ArenaResult, BenchmarkScore } from '../../types.ts';
import type { CardAttribute, EarnedBadge } from '../types.ts';
import { BADGE_TIER_ORDER } from '../types.ts';
import { attributeMap } from '../attributes/calculateAttributes.ts';
import { awardHybridBadge } from './calculateBadgeTier.ts';
import { ALL_BADGE_DEFINITIONS, type BadgeDefinition } from './definitions.ts';

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

function awardFromDefinition(
	definition: BadgeDefinition,
	ctx: BadgeAwardContext,
	languageAttributes: Map<string, CardAttribute[]>
): EarnedBadge | null {
	const { languageId, attributes, overallScores, benchmarkScoresById } = ctx;
	const languageIds = [...new Set(overallScores.map((score) => score.language.id))];

	let absoluteScore: number | null = null;
	let fieldScores: number[] = [];
	let hasSizeSweep: boolean | undefined;
	let hasCategoryWin: boolean | undefined;
	let hasFirstOverall: boolean | undefined;
	let independentLegendEvidence = false;

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
	if (definition.legendRequiresFastestRaw || definition.legendRequiresSmallestRaw) {
		const rawValues = languageIds
			.map((id) => {
				const peer = attributeMap(languageAttributes.get(id) ?? [])[definition.source];
				return peer?.available ? peer.rawValue : undefined;
			})
			.filter((value): value is number => typeof value === 'number' && value > 0);
		const ownRaw = attribute.rawValue;
		if (typeof ownRaw === 'number' && rawValues.length) {
			const best = Math.min(...rawValues);
			hasCategoryWin = ownRaw === best;
			independentLegendEvidence = hasCategoryWin;
		} else {
			hasCategoryWin = false;
		}
	}
	if (definition.legendRequiresLargestRaw) {
		const rawValues = languageIds
			.map((id) => {
				const peer = attributeMap(languageAttributes.get(id) ?? [])[definition.source];
				return peer?.available ? peer.rawValue : undefined;
			})
			.filter((value): value is number => typeof value === 'number' && value > 0);
		const ownRaw = attribute.rawValue;
		if (typeof ownRaw === 'number' && rawValues.length) {
			const best = Math.max(...rawValues);
			hasCategoryWin = ownRaw === best;
			independentLegendEvidence = hasCategoryWin;
		} else {
			hasCategoryWin = false;
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
	for (const definition of ALL_BADGE_DEFINITIONS) {
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
			ALL_BADGE_DEFINITIONS.findIndex((definition) => definition.id === a.badgeId) -
			ALL_BADGE_DEFINITIONS.findIndex((definition) => definition.id === b.badgeId);
		return definitionOrder;
	});

	const featured: string[] = [];
	const usedCategories = new Set<string>();
	for (const badge of sorted) {
		if (featured.length >= limit) break;
		if (usedCategories.has(badge.category) && featured.length < limit - 1) continue;
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
