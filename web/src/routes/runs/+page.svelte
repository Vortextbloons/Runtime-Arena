<script lang="ts">import { resolve } from '$app/paths'; let { data } = $props();</script>
<svelte:head><title>Runs · Runtime Arena</title></svelte:head>
<section>
	<p class="eyebrow">Immutable history</p><h1>Runs</h1>
	<div class="list">
		{#each data.index.runs as run (run.runId)}
			<article><time datetime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time><strong><a href={resolve(`/runs/${run.runId}`)}>{run.runId}</a></strong><span>{run.benchmarks.join(', ')}</span><span>{run.languages.join(' · ')}</span></article>
		{:else}<p>No saved runs. Run <code>npm run arena -- run</code>.</p>{/each}
	</div>
</section>
<style>
	section{max-width:1200px;margin:auto;padding:clamp(4rem,9vw,8rem) clamp(1rem,4vw,4rem)}.eyebrow{color:#66b2ff;font:700 .72rem "Cascadia Code",monospace;text-transform:uppercase;letter-spacing:.13em}h1{font-size:clamp(4rem,10vw,9rem);line-height:.8;letter-spacing:-.07em;margin:1rem 0 5rem}.list{border-top:1px solid #27313a}article{display:grid;grid-template-columns:1fr 1.2fr 1.5fr 1fr;gap:1rem;padding:1.5rem 0;border-bottom:1px solid #27313a;align-items:center}time,span{color:#84929e;font-size:.8rem}strong{font-family:"Cascadia Code",monospace;font-size:.82rem}code{color:#e8edf2}@media(max-width:700px){article{grid-template-columns:1fr} }
</style>
