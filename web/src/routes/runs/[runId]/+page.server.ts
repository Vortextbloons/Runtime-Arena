import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArenaRun } from '$lib/types';

const resultsRoot = path.resolve('static/results');

export async function entries() {
	const index = JSON.parse(await fs.readFile(path.join(resultsRoot, 'index.json'), 'utf8')) as { runs: Array<{ runId: string }> };
	return index.runs.map(({ runId }) => ({ runId }));
}

export async function load({ params }) {
	const safeId = path.basename(params.runId);
	const run = JSON.parse(await fs.readFile(path.join(resultsRoot, 'runs', `${safeId}.json`), 'utf8')) as ArenaRun;
	return { run };
}
