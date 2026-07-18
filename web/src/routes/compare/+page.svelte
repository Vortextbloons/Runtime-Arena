<script lang="ts">
	let { data } = $props();
	let leftId = $derived(data.runs[1]?.runId ?? data.runs[0]?.runId ?? '');
	let rightId = $derived(data.runs[0]?.runId ?? '');
	const left = $derived(data.runs.find((run) => run.runId === leftId));
	const right = $derived(data.runs.find((run) => run.runId === rightId));
	const rows = $derived.by(() => {
		if (!left || !right) return [];
		const previous = new Map(left.results.map((result) => [`${result.benchmark.id}/${result.benchmark.size}/${result.language.id}`, result]));
		return right.results.map((current) => {
			const key = `${current.benchmark.id}/${current.benchmark.size}/${current.language.id}`;
			const before = previous.get(key);
			const oldMedian = before?.execution.summary.medianWallTimeNanoseconds;
			const newMedian = current.execution.summary.medianWallTimeNanoseconds;
			return { key, oldMedian, newMedian, change: oldMedian ? (newMedian / oldMedian - 1) * 100 : null };
		});
	});
</script>
<svelte:head><title>Compare · Runtime Arena</title></svelte:head>
<section>
	<p class="eyebrow">Historical comparison</p><h1>Run over run.</h1>
	<div class="selectors">
		<label>Baseline<select bind:value={leftId}>{#each data.runs as run (run.runId)}<option value={run.runId}>{run.runId}</option>{/each}</select></label>
		<label>Candidate<select bind:value={rightId}>{#each data.runs as run (run.runId)}<option value={run.runId}>{run.runId}</option>{/each}</select></label>
	</div>
	<div class="rows">
		{#each rows as row (row.key)}
			<article><strong>{row.key}</strong><code>{row.oldMedian ? `${(row.oldMedian/1e6).toFixed(2)} ms` : '—'}</code><span>→</span><code>{(row.newMedian/1e6).toFixed(2)} ms</code><b class:better={row.change !== null && row.change < 0}>{row.change === null ? 'new' : `${row.change > 0 ? '+' : ''}${row.change.toFixed(1)}%`}</b></article>
		{/each}
	</div>
</section>
<style>
	section{max-width:1200px;margin:auto;padding:clamp(4rem,9vw,8rem) clamp(1rem,4vw,4rem)}.eyebrow{color:#66b2ff;font:700 .72rem "Cascadia Code",monospace;text-transform:uppercase;letter-spacing:.13em}h1{font-size:clamp(3.5rem,9vw,8rem);line-height:.85;letter-spacing:-.07em;margin:1rem 0 4rem}.selectors{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:3rem}label{display:grid;gap:.5rem;color:#748391;font:.7rem "Cascadia Code",monospace;text-transform:uppercase}select{background:#151d24;color:#e8edf2;border:1px solid #33414d;padding:.8rem}.rows{border-top:1px solid #27313a}article{display:grid;grid-template-columns:2fr 1fr auto 1fr .7fr;gap:1rem;padding:1.2rem 0;border-bottom:1px solid #27313a;align-items:center;font-size:.82rem}code{font-family:"Cascadia Code",monospace}b{color:#ee918b;text-align:right}.better{color:#7bd6ad}@media(max-width:700px){.selectors{grid-template-columns:1fr}article{grid-template-columns:1fr 1fr}article strong{grid-column:1/-1}}
</style>
