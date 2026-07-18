import type { ArenaRun } from '$lib/types';

export async function load({ fetch }) {
	const pointerResponse = await fetch('/results/latest.json');
	const pointer = await pointerResponse.json() as { path: string | null; message?: string };
	if (!pointer.path) return { run: null as ArenaRun | null, message: pointer.message ?? 'No runs available.' };
	const resultResponse = await fetch(`/results/${pointer.path}`);
	return { run: await resultResponse.json() as ArenaRun, message: '' };
}
