import { HYBRID_TIER_THRESHOLDS as _HYBRID_TIER_THRESHOLDS } from './shared.ts';

export type CardTier = 's-plus' | 's' | 'a-plus' | 'a' | 'b' | 'c' | 'd';

export type AttributeCategory = 'execution' | 'control' | 'reliability' | 'physical';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'hall-of-fame' | 'legend';

export type BadgeCategory = 'execution' | 'control' | 'reliability' | 'physical' | 'special';

export type CardAttribute = {
	id: string;
	label: string;
	abbreviation: string;
	rating: number | null;
	rawValue?: number;
	unit?: string;
	category: AttributeCategory;
	available: boolean;
	evidence: string[];
};

export type EarnedBadge = {
	badgeId: string;
	name: string;
	tier: BadgeTier;
	category: BadgeCategory;
	qualificationScore: number;
	attributeScore?: number;
	percentile?: number;
	benchmarkId?: string;
	reason: string;
	nextTier?: {
		tier: BadgeTier;
		requirements: string[];
	};
};

export type DivisionRank = {
	divisionId: string;
	divisionName: string;
	rank: number;
	fieldSize: number;
	score: number;
};

export type LanguageCardData = {
	languageId: string;
	languageName: string;
	overall: number | null;
	cardTier: CardTier | null;
	buildName: string;
	classifications: {
		executionModels: string[];
		roles: string[];
		memoryModels: string[];
	};
	displayClassifications: string[];
	attributes: CardAttribute[];
	badges: EarnedBadge[];
	featuredBadgeIds: string[];
	takeover: {
		primary: string;
		secondary?: string;
	};
	divisionRanks: DivisionRank[];
	featuredDivisionRank?: DivisionRank;
	runtime: {
		name?: string;
		version?: string;
		compilerVersion?: string;
	};
	metadata: {
		snapshotId: string;
		measuredAt?: string;
		cardSpecVersion: '1' | '1.5' | '2';
	};
};

export type BadgeTierRule = {
	minimumScore: number;
	minimumPercentile?: number;
	requiresCategoryWin?: boolean;
	requiresSizeSweep?: boolean;
	minimumEligibleCells?: number;
};

export type LanguageClassification = {
	languageId: string;
	executionModels: string[];
	roles: string[];
	memoryModels: string[];
};

export const CORE_ATTRIBUTE_IDS = [
	'runtime-speed',
	'efficiency',
	'scalability',
	'compute',
	'algorithms',
	'data-processing'
] as const;

export const ATTRIBUTE_PRIORITY = [
	'CMP',
	'ALG',
	'DAT',
	'SCL',
	'CON',
	'SPD',
	'STA',
	'MEM',
	'IO',
	'PAR'
] as const;

export const BADGE_TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'hall-of-fame', 'legend'];

export const CARD_TIER_BANDS: Array<{ min: number; tier: CardTier }> = [
	{ min: 93, tier: 's-plus' },
	{ min: 90, tier: 's' },
	{ min: 85, tier: 'a-plus' },
	{ min: 80, tier: 'a' },
	{ min: 70, tier: 'b' },
	{ min: 60, tier: 'c' },
	{ min: 0, tier: 'd' }
];

export const HYBRID_TIER_THRESHOLDS = _HYBRID_TIER_THRESHOLDS;
