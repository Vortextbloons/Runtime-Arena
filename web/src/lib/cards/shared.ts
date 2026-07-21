/**
 * AUTO-GENERATED from shared/badge-definitions.json
 * Do not edit by hand — run `node scripts/sync-badge-defs.mjs` to regenerate.
 */
export const ALL_BADGE_DEFINITIONS = [
	{
	id: 'speedster',
	name: 'Speedster',
	category: 'execution' as const,
	source: 'SPD' as const,
	legendRequiresFirstOverall: true
},
	{
	id: 'compute-finisher',
	name: 'Compute Finisher',
	category: 'execution' as const,
	source: 'CMP' as const,
	benchmarkId: 'nbody',
	legendRequiresSizeSweep: true
},
	{
	id: 'data-handler',
	name: 'Data Wrangler',
	category: 'control' as const,
	source: 'DAT' as const,
	benchmarkId: 'aggregation',
	legendRequiresSizeSweep: true
},
	{
	id: 'pathfinder',
	name: 'Pathfinder',
	category: 'control' as const,
	source: 'ALG' as const,
	benchmarkId: 'shortest-path',
	legendRequiresSizeSweep: true
},
	{
	id: 'steady-hands',
	name: 'Steady Hands',
	category: 'reliability' as const,
	source: 'CON' as const,
	legendRequiresCategoryWin: true
},
	{
	id: 'scale-master',
	name: 'Scale Master',
	category: 'physical' as const,
	source: 'SCL' as const,
	legendRequiresCategoryWin: true
},
	{
	id: 'fast-builder',
	name: 'Quick Build',
	category: 'physical' as const,
	source: 'BLD' as const,
	legendRequiresFastestRaw: true
},
	{
	id: 'lightweight-build',
	name: 'Minimal Build',
	category: 'physical' as const,
	source: 'BIN' as const,
	legendRequiresSmallestRaw: true
},
	{
	id: 'memory-minder',
	name: 'Memory Minder',
	category: 'physical' as const,
	source: 'MEM' as const,
	legendRequiresSmallestRaw: true
},
	{
	id: 'tight-code',
	name: 'Tight Code',
	category: 'physical' as const,
	source: 'LOC' as const,
	legendRequiresSmallestRaw: true
},
	{
	id: 'code-economy',
	name: 'High Yield',
	category: 'execution' as const,
	source: 'ECO' as const,
	legendRequiresLargestRaw: true
}
];

export const ALL_ATTRIBUTE_DEFINITIONS = [
	{ id: 'runtime-speed', label: 'Runtime Speed', abbreviation: 'SPD', category: 'execution' as const },
	{ id: 'efficiency', label: 'Efficiency', abbreviation: 'EFF', category: 'physical' as const },
	{ id: 'consistency', label: 'Consistency', abbreviation: 'CON', category: 'reliability' as const },
	{ id: 'scalability', label: 'Scalability', abbreviation: 'SCL', category: 'physical' as const },
	{ id: 'compute', label: 'Compute', abbreviation: 'CMP', category: 'execution' as const },
	{ id: 'algorithms', label: 'Algorithms', abbreviation: 'ALG', category: 'control' as const },
	{ id: 'data-processing', label: 'Data Processing', abbreviation: 'DAT', category: 'control' as const },
	{ id: 'build-speed', label: 'Build Speed', abbreviation: 'BLD', category: 'physical' as const },
	{ id: 'artifact-efficiency', label: 'Artifact Efficiency', abbreviation: 'BIN', category: 'physical' as const },
	{ id: 'startup', label: 'Startup', abbreviation: 'STA', category: 'physical' as const },
	{ id: 'memory', label: 'Memory Efficiency', abbreviation: 'MEM', category: 'physical' as const },
	{ id: 'io', label: 'I/O', abbreviation: 'IO', category: 'control' as const },
	{ id: 'parallelism', label: 'Parallelism', abbreviation: 'PAR', category: 'execution' as const },
	{ id: 'implementation-size', label: 'Implementation Size', abbreviation: 'LOC', category: 'physical' as const },
	{ id: 'code-economy', label: 'Code Economy', abbreviation: 'ECO', category: 'execution' as const }
];

export const HYBRID_TIER_THRESHOLDS = [
	{ tier: 'legend' as const, minimumScore: 95, minimumPercentile: 85 },
	{ tier: 'hall-of-fame' as const, minimumScore: 90, minimumPercentile: 70 },
	{ tier: 'gold' as const, minimumScore: 85, minimumPercentile: 55 },
	{ tier: 'silver' as const, minimumScore: 80, minimumPercentile: 40 },
	{ tier: 'bronze' as const, minimumScore: 75, minimumPercentile: 25 }
];

export const BADGE_OVR_BONUS: Record<string, number> = {
	'bronze': 0.7,
	'silver': 1.15,
	'gold': 1.75,
	'hall-of-fame': 2.25,
	'legend': 2.75
};
