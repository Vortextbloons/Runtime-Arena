import type { ArenaRun } from '$lib/types';

export async function load({ fetch }) {
	const response = await fetch('/results/current.json');
	if (!response.ok) return { run: null as ArenaRun | null, message: 'No canonical results are available.' };
	return { run: await response.json() as ArenaRun, message: '' };
}
