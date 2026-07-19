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
		// Heavier field weight so mid-pack high scores do not coast on absolute alone.
		return {
			qualificationScore: normalizeScore(0.55 * absoluteScore + 0.45 * percentile),
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

function legendSatisfied(evidence: HybridEvidence, usesPercentile: boolean, percentile?: number): boolean {
	const legendRule = HYBRID_TIER_THRESHOLDS.find((entry) => entry.tier === 'legend');
	const absoluteFloor = legendRule?.minimumScore ?? 97;
	if (evidence.absoluteScore < absoluteFloor) return false;
	if (!usesPercentile && !evidence.independentLegendEvidence) return false;
	if (
		usesPercentile &&
		legendRule?.minimumPercentile !== undefined &&
		(percentile === undefined || percentile < legendRule.minimumPercentile)
	) {
		return false;
	}
	if (evidence.hasSizeSweep === false) return false;
	if (evidence.hasCategoryWin === false) return false;
	if (evidence.hasFirstOverall === false) return false;
	return true;
}

function tierSatisfied(
	tier: BadgeTier,
	absoluteScore: number,
	qualificationScore: number,
	percentile: number | undefined,
	usesPercentile: boolean
): boolean {
	const rule = HYBRID_TIER_THRESHOLDS.find((entry) => entry.tier === tier);
	if (!rule) return false;
	if (absoluteScore < rule.minimumScore) return false;
	if (qualificationScore < rule.minimumScore) return false;
	if (
		usesPercentile &&
		rule.minimumPercentile !== undefined &&
		(percentile === undefined || percentile < rule.minimumPercentile)
	) {
		return false;
	}
	return true;
}

function nextTierRequirements(
	tier: BadgeTier,
	evidence: HybridEvidence,
	usesPercentile: boolean
): string[] {
	const requirements: string[] = [];
	const rule = HYBRID_TIER_THRESHOLDS.find((entry) => entry.tier === tier);
	if (rule) {
		requirements.push(`Reach an absolute rating of ${rule.minimumScore}`);
		requirements.push(`Reach a qualification score of ${rule.minimumScore}`);
		if (usesPercentile && rule.minimumPercentile !== undefined) {
			requirements.push(`Reach at least the ${rule.minimumPercentile}th percentile`);
		}
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
	for (const { tier } of HYBRID_TIER_THRESHOLDS) {
		if (tier === 'legend') {
			if (legendSatisfied(evidence, usesPercentile, percentile)) {
				awarded = 'legend';
				break;
			}
			continue;
		}
		if (tierSatisfied(tier, absoluteScore, qualificationScore, percentile, usesPercentile)) {
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
