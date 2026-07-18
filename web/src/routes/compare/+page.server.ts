import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArenaRun } from '$lib/types';

export async function load() {
	const root = path.resolve('static/results');
	const index = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8')) as { runs: Array<{ runId: string; path: string }> };
	const runs = await Promise.all(index.runs.slice(0, 20).map(async (entry) =>
		JSON.parse(await fs.readFile(path.join(root, entry.path), 'utf8')) as ArenaRun
	));
	return { runs };
}
