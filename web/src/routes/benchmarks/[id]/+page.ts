import type { ArenaRun } from '$lib/types';

export const entries = () => [{ id: 'nbody' }, { id: 'shortest-path' }, { id: 'aggregation' }];

export async function load({ fetch, params }) {
	const run = await fetch('/results/current.json').then((r) => r.json()) as ArenaRun;
	return { run, id: params.id };
}
