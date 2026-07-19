import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArenaRun } from '$lib/types';

function loadCurrentRun(): ArenaRun {
	return JSON.parse(readFileSync(join(process.cwd(), 'static/results/current.json'), 'utf8')) as ArenaRun;
}

export function entries() {
	return [...new Set(loadCurrentRun().results.map((result) => result.language.id))]
		.toSorted()
		.map((id) => ({ id }));
}
