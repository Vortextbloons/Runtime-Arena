import type { AttributeCategory } from '../types.ts';

export type AttributeDefinition = {
	id: string;
	label: string;
	abbreviation: string;
	category: AttributeCategory;
};

export const CORE_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
	{
		id: 'runtime-speed',
		label: 'Runtime Speed',
		abbreviation: 'SPD',
		category: 'execution'
	},
	{
		id: 'consistency',
		label: 'Consistency',
		abbreviation: 'CON',
		category: 'reliability'
	},
	{
		id: 'scalability',
		label: 'Scalability',
		abbreviation: 'SCL',
		category: 'physical'
	},
	{
		id: 'compute',
		label: 'Compute',
		abbreviation: 'CMP',
		category: 'execution'
	},
	{
		id: 'algorithms',
		label: 'Algorithms',
		abbreviation: 'ALG',
		category: 'control'
	},
	{
		id: 'data-processing',
		label: 'Data Processing',
		abbreviation: 'DAT',
		category: 'control'
	}
];

export const EXTENDED_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
	{
		id: 'build-speed',
		label: 'Build Speed',
		abbreviation: 'BLD',
		category: 'physical'
	},
	{
		id: 'artifact-efficiency',
		label: 'Artifact Efficiency',
		abbreviation: 'BIN',
		category: 'physical'
	},
	{
		id: 'startup',
		label: 'Startup',
		abbreviation: 'STA',
		category: 'physical'
	},
	{
		id: 'memory',
		label: 'Memory Efficiency',
		abbreviation: 'MEM',
		category: 'physical'
	},
	{
		id: 'io',
		label: 'I/O',
		abbreviation: 'IO',
		category: 'control'
	},
	{
		id: 'parallelism',
		label: 'Parallelism',
		abbreviation: 'PAR',
		category: 'execution'
	}
];

export const ALL_ATTRIBUTE_DEFINITIONS = [
	...CORE_ATTRIBUTE_DEFINITIONS,
	...EXTENDED_ATTRIBUTE_DEFINITIONS
];

export const BENCHMARK_ATTRIBUTE_IDS = {
	compute: 'nbody',
	algorithms: 'shortest-path',
	'data-processing': 'aggregation',
	/** Dedicated stream/file I/O workload when present in a snapshot. */
	io: 'stream-io',
	/** Dedicated parallel workload (barrier-wave satisfies this for current arena). */
	parallelism: 'barrier-wave'
} as const;
