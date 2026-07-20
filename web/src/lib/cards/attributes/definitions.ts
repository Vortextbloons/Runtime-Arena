import type { AttributeCategory } from '../types.ts';
import sharedBadgeDefs from '../../../../shared/badge-definitions.json';

export type AttributeDefinition = {
	id: string;
	label: string;
	abbreviation: string;
	category: AttributeCategory;
};

// Attribute definitions from shared single source of truth
const sharedAttrDefs = sharedBadgeDefs.attributeDefinitions as AttributeDefinition[];

export const CORE_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = sharedAttrDefs.filter(
	(d) => ['runtime-speed', 'consistency', 'scalability', 'compute', 'algorithms', 'data-processing'].includes(d.id)
);

export const EXTENDED_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = sharedAttrDefs.filter(
	(d) => !['runtime-speed', 'consistency', 'scalability', 'compute', 'algorithms', 'data-processing'].includes(d.id)
);

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
