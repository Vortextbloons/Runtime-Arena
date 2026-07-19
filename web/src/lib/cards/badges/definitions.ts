import type { BadgeCategory, BadgeTier, BadgeTierRule } from '../types.ts';
import { HYBRID_TIER_THRESHOLDS } from '../types.ts';

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

/** Performance badges only — no participation / correctness trophies. */
export const V1_BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		id: 'speedster',
		name: 'Speedster',
		category: 'execution',
		source: 'SPD',
		legendRequiresFirstOverall: true
	},
	{
		id: 'compute-finisher',
		name: 'Compute Finisher',
		category: 'execution',
		source: 'CMP',
		benchmarkId: 'nbody',
		legendRequiresSizeSweep: true
	},
	{
		id: 'data-handler',
		name: 'Data Wrangler',
		category: 'control',
		source: 'DAT',
		benchmarkId: 'aggregation',
		legendRequiresSizeSweep: true
	},
	{
		id: 'pathfinder',
		name: 'Pathfinder',
		category: 'control',
		source: 'ALG',
		benchmarkId: 'shortest-path',
		legendRequiresSizeSweep: true
	},
	{
		id: 'steady-hands',
		name: 'Steady Hands',
		category: 'reliability',
		source: 'CON',
		legendRequiresCategoryWin: true
	},
	{
		id: 'scale-master',
		name: 'Scale Master',
		category: 'physical',
		source: 'SCL',
		legendRequiresCategoryWin: true
	}
];

export const V15_BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		id: 'fast-builder',
		name: 'Quick Build',
		category: 'physical',
		source: 'BLD',
		legendRequiresFastestRaw: true
	},
	{
		id: 'lightweight-build',
		name: 'Minimal Build',
		category: 'physical',
		source: 'BIN',
		legendRequiresSmallestRaw: true
	}
];

export const V2_BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		id: 'memory-minder',
		name: 'Memory Minder',
		category: 'physical',
		source: 'MEM',
		legendRequiresSmallestRaw: true
	}
];

export const V25_BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		id: 'tight-code',
		name: 'Tight Code',
		category: 'physical',
		source: 'LOC',
		legendRequiresSmallestRaw: true
	},
	{
		id: 'code-economy',
		name: 'High Yield',
		category: 'execution',
		source: 'ECO',
		legendRequiresLargestRaw: true
	}
];

export const ALL_BADGE_DEFINITIONS = [
	...V1_BADGE_DEFINITIONS,
	...V15_BADGE_DEFINITIONS,
	...V2_BADGE_DEFINITIONS,
	...V25_BADGE_DEFINITIONS
];

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
