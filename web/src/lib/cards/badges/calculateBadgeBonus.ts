import type { BadgeTier, EarnedBadge } from '../types.ts';
import { BADGE_TIER_ORDER } from '../types.ts';
import { clampScore, normalizeScore } from '../util.ts';
import { selectFeaturedBadgeIds } from './awardBadges.ts';

export const BADGE_OVR_BONUS: Record<BadgeTier, number> = {
	bronze: 0.70,
	silver: 1.15,
	gold: 1.75,
	'hall-of-fame': 2.25,
	legend: 2.75
};

export function applyFinalOverall(baseOverall: number, badgeBonus: number): number {
	return normalizeScore(Math.min(100, baseOverall + Math.max(0, badgeBonus)));
}

export function calculateBadgeBonus(badges: EarnedBadge[], featuredBadgeIds?: string[]): number {
	const featuredIds = featuredBadgeIds ?? selectFeaturedBadgeIds(badges);
	const featured = featuredIds
		.map((badgeId) => badges.find((badge) => badge.badgeId === badgeId))
		.filter((badge): badge is EarnedBadge => Boolean(badge))
		.toSorted(
			(a, b) =>
				BADGE_TIER_ORDER.indexOf(b.tier) - BADGE_TIER_ORDER.indexOf(a.tier) ||
				b.qualificationScore - a.qualificationScore
		)
		.slice(0, 3);

	const raw = featured.reduce((total, badge) => total + BADGE_OVR_BONUS[badge.tier], 0);
	return normalizeScore(clampScore(raw));
}
