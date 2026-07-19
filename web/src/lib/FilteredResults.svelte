<script lang="ts">
	import type { ArenaResult, ArenaRun } from './types';
	let { title, subtitle, run, results }: { title: string; subtitle: string; run: ArenaRun; results: ArenaResult[] } = $props();
	const fastest = $derived(Math.min(...results.filter((r) => r.checker.status === 'accepted').map((r) => r.execution.summary.medianKernelTimeNanoseconds)));
	const format = (ns: number) => `${(ns / 1e6).toFixed(2)} ms`;
</script>

<section>
	<p class="eyebrow">{subtitle}</p>
	<h1>{title}</h1>
	<p class="run">Snapshot {run.snapshotId}</p>
	<div class="table">
		<div class="head"><span>Benchmark</span><span>Language</span><span>Median</span><span>Relative</span><span>Correctness</span></div>
		{#each results as result (`${result.benchmark.id}-${result.benchmark.size}-${result.benchmark.mutation ?? ''}-${result.language.id}`)}
			{@const median = result.execution.summary.medianKernelTimeNanoseconds}
			<article>
				<strong>{result.benchmark.id} / {result.benchmark.size}{result.benchmark.mutation ? ` / ${result.benchmark.mutation}` : ''}</strong>
				<span>{result.language.name}</span>
				<code>{format(median)}</code>
				<code>{result.checker.status === 'accepted' ? `${(median / fastest).toFixed(2)}x` : '—'}</code>
				<span class:ok={result.checker.status === 'accepted'}>{result.checker.status}</span>
			</article>
		{/each}
	</div>
</section>

<style>
	section{max-width:1200px;margin:auto;padding:clamp(4rem,9vw,8rem) clamp(1rem,4vw,4rem)}
	.eyebrow{color:#66b2ff;font:700 .72rem "Cascadia Code",monospace;text-transform:uppercase;letter-spacing:.13em}
	h1{font-size:clamp(3.5rem,9vw,8rem);line-height:.85;letter-spacing:-.07em;margin:1rem 0}
	.run{color:#788795;font: .75rem "Cascadia Code",monospace;margin-bottom:4rem}
	.table{border-top:1px solid #27313a}.head,article{display:grid;grid-template-columns:1.6fr 1fr .8fr .7fr .8fr;gap:1rem;align-items:center}
	.head{color:#6f7d89;font:.65rem "Cascadia Code",monospace;text-transform:uppercase;padding:.8rem 0}
	article{padding:1.2rem 0;border-top:1px solid #202a32;font-size:.85rem}article span{color:#94a1ac}.ok{color:#7bd6ad!important}code{font-family:"Cascadia Code",monospace}
	@media(max-width:700px){.head{display:none}article{grid-template-columns:1fr 1fr}article strong{grid-column:1/-1}}
</style>
