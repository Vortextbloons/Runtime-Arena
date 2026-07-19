<script lang="ts">
	import ResultsExplorer from '$lib/ResultsExplorer.svelte';
	let { data } = $props();
</script>

{#if data.run}
	<ResultsExplorer title="Latest results" subtitle="Verified run" run={data.run} />
{:else}
	<section class="empty">
		<p class="eyebrow">No result data</p>
		<h1>Run the arena to begin.</h1>
		<p>{data.message}</p>
		<code>npm run arena -- run</code>
	</section>
{/if}

<style>
	.empty { max-width: 760px; margin: auto; padding: clamp(5rem, 12vw, 10rem) 1rem; text-align: center; }
	.eyebrow { color: var(--accent); font: 650 .68rem var(--mono); letter-spacing: .1em; text-transform: uppercase; }
	h1 { margin: .8rem 0; font: 640 clamp(2.7rem, 7vw, 5rem)/.95 var(--display); letter-spacing: -.05em; }
	.empty > p:not(.eyebrow) { color: var(--muted); }
	code { display: inline-block; margin-top: 1rem; padding: .8rem 1rem; border: 1px solid var(--rule); background: var(--panel); font-family: var(--mono); }
</style>
