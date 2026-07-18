import type { ArenaRun } from '$lib/types';

export const entries = () => [{ id: 'nbody' }, { id: 'shortest-path' }, { id: 'aggregation' }];

export async function load({ fetch, params }) {
	const pointer = await fetch('/results/latest.json').then((r) => r.json()) as { path: string };
	const run = await fetch(`/results/${pointer.path}`).then((r) => r.json()) as ArenaRun;
	return { run, id: params.id, results: run.results.filter((result) => result.benchmark.id === params.id) };
}
