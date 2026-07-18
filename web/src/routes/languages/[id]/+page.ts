import type { ArenaRun } from '$lib/types';

export const entries = () => [{ id: 'rust' }, { id: 'go' }, { id: 'typescript' }];

export async function load({ fetch, params }) {
	const pointer = await fetch('/results/latest.json').then((r) => r.json()) as { path: string };
	const run = await fetch(`/results/${pointer.path}`).then((r) => r.json()) as ArenaRun;
	return { run, id: params.id, results: run.results.filter((result) => result.language.id === params.id) };
}
