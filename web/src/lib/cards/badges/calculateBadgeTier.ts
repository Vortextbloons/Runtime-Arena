import type { BadgeTier, EarnedBadge } from '../types.ts';
import { BADGE_TIER_ORDER, HYBRID_TIER_THRESHOLDS } from '../types.ts';
import { normalizeScore, percentileRank } from '../util.ts';
import { BADGE_TIER_LABEL } from './definitions.ts';

export type HybridEvidence = {
	absoluteScore: number;
	fieldScores: number[];
	/** When defined, Legend requires this to be true. */
	hasCategoryWin?: boolean;
	hasSizeSweep?: boolean;
	hasFirstOverall?: boolean;
	/** Allows Legend when the field has fewer than three languages. */
	independentLegendEvidence?: boolean;
};

export function hybridQualificationScore(absoluteScore: number, fieldScores: number[]): {
	qualificationScore: number;
	percentile: number | undefined;
	usesPercentile: boolean;
} {
	if (fieldScores.length >= 3) {
		const percentile = percentileRank(absoluteScore, fieldScores);
		return {
			qualificationScore: normalizeScore(0.7 * absoluteScore + 0.3 * percentile),
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

function nextTierAfter(tier: BadgeTier): BadgeTier | undefined {
	const index = BADGE_TIER_ORDER.indexOf(tier);
	if (index < 0 || index >= BADGE_TIER_ORDER.length - 1) return undefined;
	return BADGE_TIER_ORDER[index + 1];
}

function legendSatisfied(evidence: HybridEvidence, usesPercentile: boolean): boolean {
	if (evidence.absoluteScore < 95) return false;
	if (!usesPercentile && !evidence.independentLegendEvidence) return false;
	if (evidence.hasSizeSweep === false) return false;
	if (evidence.hasCategoryWin === false) return false;
	if (evidence.hasFirstOverall === false) return false;
	return true;
}

function nextTierRequirements(tier: BadgeTier, evidence: HybridEvidence, usesPercentile: boolean): string[] {
	const requirements: string[] = [];
	const threshold = HYBRID_TIER_THRESHOLDS.find((entry) => entry.tier === tier)?.minimumScore;
	if (threshold !== undefined) {
		requirements.push(
			tier === 'legend' || !usesPercentile
				? `Reach an absolute rating of ${threshold}`
				: `Reach a qualification score of ${threshold}`
		);
	}
	if (tier === 'legend') {
		if (evidence.hasSizeSweep === false) requirements.push('Win every eligible dataset size');
		if (evidence.hasCategoryWin === false) requirements.push('Hold the highest rating in this category');
		if (evidence.hasFirstOverall === false) requirements.push('Rank first overall');
		if (!usesPercentile && !evidence.independentLegendEvidence) {
			requirements.push('Need at least three eligible languages for Legend, or an independent size sweep');
		}
	}
	return requirements;
}

export function awardHybridBadge(options: {
	badgeId: string;
	name: string;
	category: EarnedBadge['category'];
	evidence: HybridEvidence;
	benchmarkId?: string;
}): EarnedBadge | null {
	const { badgeId, name, category, evidence, benchmarkId } = options;
	const { absoluteScore, fieldScores } = evidence;
	const { qualificationScore, percentile, usesPercentile } = hybridQualificationScore(
		absoluteScore,
		fieldScores
	);

	let awarded: BadgeTier | null = null;
	for (const { tier, minimumScore } of HYBRID_TIER_THRESHOLDS) {
		if (tier === 'legend') {
			if (legendSatisfied(evidence, usesPercentile)) {
				awarded = 'legend';
				break;
			}
			continue;
		}
		if (qualificationScore >= minimumScore) {
			awarded = tier;
			break;
		}
	}

	if (!awarded) return null;

	const next = nextTierAfter(awarded);
	const reasonParts = [
		`Rating ${Math.round(absoluteScore)}`,
		percentile !== undefined ? `percentile ${Math.round(percentile)}` : null,
		`qualification ${Math.round(qualificationScore)}`
	].filter(Boolean);

	return {
		badgeId,
		name,
		tier: awarded,
		category,
		qualificationScore,
		attributeScore: absoluteScore,
		percentile,
		benchmarkId,
		reason: `${BADGE_TIER_LABEL[awarded]}: ${reasonParts.join(', ')}`,
		nextTier: next
			? {
					tier: next,
					requirements: nextTierRequirements(next, evidence, usesPercentile)
				}
			: undefined
	};
}
