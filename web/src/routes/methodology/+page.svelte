<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Methodology · Runtime Arena</title></svelte:head>
<section>
	<p class="eyebrow">Benchmark protocol</p>
	<h1>Fast is meaningless<br />until correct is proven.</h1>
	<div class="rules">
		<article id="input">
			<span>Input</span>
			<h2>One immutable dataset</h2>
			<p>Every implementation receives the same hashed input and documented workload.</p>
		</article>
		<article id="timing">
			<span>Timing</span>
			<h2>Computation only</h2>
			<p>Compilation, input generation, checker execution, and reporting stay outside the measured window.</p>
		</article>
		<article id="proof">
			<span>Proof</span>
			<h2>Independent validation</h2>
			<p>A separate Go executable validates structure and correctness after each measured process exits.</p>
		</article>
		<article id="ranking">
			<span>Ranking</span>
			<h2>Weighted overall score</h2>
			<p>
				Scores weight geometric-mean speed at 75% and either Efficiency (when every ranked pair has comparable resource data) or the legacy flexibility score at 25%. Earned badges can raise the overall rating but never lower it.
				Stability is shown for diagnostics only. All accepted size tiers with valid samples are ranked.
			</p>
		</article>
	</div>
	<p class="back">
		<a href={resolve('/')}>View current results</a>
	</p>
</section>
<style>
	section { max-width: 1200px; margin: auto; padding: clamp(4rem, 9vw, 9rem) clamp(1rem, 4vw, 4rem); }
	.eyebrow { color: var(--accent); font: 700 .72rem var(--mono); letter-spacing: .13em; text-transform: uppercase; }
	h1 { max-width: 1000px; margin: 1rem 0 6rem; font-size: clamp(3rem, 7vw, 7rem); line-height: .9; letter-spacing: -.065em; }
	.rules { border-top: 1px solid var(--rule); }
	article { display: grid; grid-template-columns: .5fr 1.2fr 1.5fr; gap: 2rem; padding: 2rem 0; border-bottom: 1px solid var(--rule); scroll-margin-top: 5rem; }
	article span { color: var(--accent); font: .7rem var(--mono); text-transform: uppercase; }
	h2, p { margin: 0; } h2 { letter-spacing: -.03em; } p { color: var(--muted); line-height: 1.6; }
	.back { margin: 2.5rem 0 0; }
	.back a {
		color: var(--accent);
		font: 650 0.78rem var(--mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.back a:hover, .back a:focus-visible { color: var(--text); }
	@media(max-width:700px){ article { grid-template-columns: 1fr; gap: .6rem; } }
</style>
