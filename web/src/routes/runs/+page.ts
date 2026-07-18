export async function load({ fetch }) {
	const response = await fetch('/results/index.json');
	return { index: await response.json() as { runs: Array<{ runId: string; createdAt: string; benchmarks: string[]; languages: string[] }> } };
}
