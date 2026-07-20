import type { BadgeCategory, BadgeTier, BadgeTierRule } from '../types.ts';
import { HYBRID_TIER_THRESHOLDS } from '../types.ts';
import { ALL_BADGE_DEFINITIONS as _ALL_BADGE_DEFINITIONS } from '../shared.ts';

export type BadgeSource =
	| 'SPD'
	| 'CMP'
	| 'DAT'
	| 'ALG'
	| 'CON'
	| 'SCL'
	| 'BLD'
	| 'BIN'
	| 'STA'
	| 'MEM'
	| 'IO'
	| 'PAR'
	| 'LOC'
	| 'ECO'
	;

export type BadgeDefinition = {
	id: string;
	name: string;
	category: BadgeCategory;
	source: BadgeSource;
	benchmarkId?: string;
	legendRequiresSizeSweep?: boolean;
	legendRequiresCategoryWin?: boolean;
	legendRequiresFirstOverall?: boolean;
	legendRequiresFastestRaw?: boolean;
	legendRequiresSmallestRaw?: boolean;
	legendRequiresLargestRaw?: boolean;
};

// Badge definitions from shared single source of truth
export const ALL_BADGE_DEFINITIONS: BadgeDefinition[] = _ALL_BADGE_DEFINITIONS;

// Legacy exports for backward compatibility
export const V1_BADGE_DEFINITIONS = ALL_BADGE_DEFINITIONS.filter(b =>
	['speedster', 'compute-finisher', 'data-handler', 'pathfinder', 'steady-hands', 'scale-master'].includes(b.id)
);
export const V15_BADGE_DEFINITIONS = ALL_BADGE_DEFINITIONS.filter(b =>
	['fast-builder', 'lightweight-build'].includes(b.id)
);
export const V2_BADGE_DEFINITIONS = ALL_BADGE_DEFINITIONS.filter(b =>
	['memory-minder'].includes(b.id)
);
export const V25_BADGE_DEFINITIONS = ALL_BADGE_DEFINITIONS.filter(b =>
	['tight-code', 'code-economy'].includes(b.id)
);

export const HYBRID_RULES: Record<BadgeTier, BadgeTierRule> = Object.fromEntries(
	HYBRID_TIER_THRESHOLDS.map(({ tier, minimumScore, minimumPercentile }) => [
		tier,
		{ minimumScore, minimumPercentile }
	])
) as Record<BadgeTier, BadgeTierRule>;

export const BADGE_TIER_LABEL: Record<BadgeTier, string> = {
	bronze: 'Bronze',
	silver: 'Silver',
	gold: 'Gold',
	'hall-of-fame': 'Hall of Fame',
	legend: 'Legend'
};
