import type { ArenaRun } from '$lib/types';

export const entries = () => [{ id: 'rust' }, { id: 'go' }, { id: 'typescript' }];

export async function load({ fetch, params }) {
	const run = await fetch('/results/current.json').then((r) => r.json()) as ArenaRun;
	return { run, id: params.id };
}
