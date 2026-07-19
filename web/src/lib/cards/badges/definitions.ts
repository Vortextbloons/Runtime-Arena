import type { BadgeCategory, BadgeTier, BadgeTierRule } from '../types.ts';
import { HYBRID_TIER_THRESHOLDS } from '../types.ts';

export type BadgeDefinition = {
	id: string;
	name: string;
	category: BadgeCategory;
	/** Attribute abbreviation used for hybrid scoring, or a special source key. */
	source: 'SPD' | 'CMP' | 'DAT' | 'ALG' | 'CON' | 'SCL' | 'pressure-proof' | 'clean-output' | 'complete-package';
	benchmarkId?: string;
	legendRequiresSizeSweep?: boolean;
	legendRequiresCategoryWin?: boolean;
	legendRequiresFirstOverall?: boolean;
	/** Custom Complete Package / Clean Output handling. */
	special?: 'complete-package' | 'clean-output';
};

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
		name: 'Data Handler',
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
		id: 'pressure-proof',
		name: 'Pressure Proof',
		category: 'reliability',
		source: 'pressure-proof',
		legendRequiresCategoryWin: true
	},
	{
		id: 'clean-output',
		name: 'Clean Output',
		category: 'reliability',
		source: 'clean-output',
		special: 'clean-output'
	},
	{
		id: 'scale-master',
		name: 'Scale Master',
		category: 'physical',
		source: 'SCL',
		legendRequiresCategoryWin: true
	},
	{
		id: 'complete-package',
		name: 'Complete Package',
		category: 'special',
		source: 'complete-package',
		special: 'complete-package'
	}
];

export const HYBRID_RULES: Record<BadgeTier, BadgeTierRule> = Object.fromEntries(
	HYBRID_TIER_THRESHOLDS.map(({ tier, minimumScore }) => [tier, { minimumScore }])
) as Record<BadgeTier, BadgeTierRule>;

export const COMPLETE_PACKAGE_THRESHOLDS: Array<{ tier: BadgeTier; minimum: number }> = [
	{ tier: 'legend', minimum: 90 },
	{ tier: 'hall-of-fame', minimum: 85 },
	{ tier: 'gold', minimum: 75 },
	{ tier: 'silver', minimum: 65 },
	{ tier: 'bronze', minimum: 55 }
];

export const BADGE_TIER_LABEL: Record<BadgeTier, string> = {
	bronze: 'Bronze',
	silver: 'Silver',
	gold: 'Gold',
	'hall-of-fame': 'Hall of Fame',
	legend: 'Legend'
};
