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

export const BENCHMARK_ATTRIBUTE_IDS = {
	compute: 'nbody',
	algorithms: 'shortest-path',
	'data-processing': 'aggregation'
} as const;
