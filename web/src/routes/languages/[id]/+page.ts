import type { ArenaRun } from '$lib/types';
import { base } from '$app/paths';

export async function load({ fetch, params }) {
	const run = (await fetch(`${base}/results/current.json`).then((r) => r.json())) as ArenaRun;
	return { run, id: params.id };
}
