<svelte:head><title>Methodology · Runtime Arena</title></svelte:head>
<section>
	<p class="eyebrow">Benchmark protocol</p>
	<h1>Fast is meaningless<br />until correct is proven.</h1>
	<div class="rules">
		<article><span>Input</span><h2>One immutable dataset</h2><p>Every implementation receives the same hashed input and documented workload.</p></article>
		<article><span>Timing</span><h2>Computation only</h2><p>Compilation, input generation, checker execution, and reporting stay outside the measured window.</p></article>
		<article><span>Proof</span><h2>Independent validation</h2><p>A separate Go executable validates structure and correctness after each measured process exits.</p></article>
		<article><span>Ranking</span><h2>Weighted overall score</h2><p>Scores weight geometric-mean speed at 80%, consistency at 10%, and scalability at 10%. Tiers below the 1 ms timing floor are excluded for every language.</p></article>
	</div>
</section>
<style>
	section { max-width: 1200px; margin: auto; padding: clamp(4rem, 9vw, 9rem) clamp(1rem, 4vw, 4rem); }
	.eyebrow { color: #66b2ff; font: 700 .72rem "Cascadia Code", monospace; letter-spacing: .13em; text-transform: uppercase; }
	h1 { max-width: 1000px; margin: 1rem 0 6rem; font-size: clamp(3rem, 7vw, 7rem); line-height: .9; letter-spacing: -.065em; }
	.rules { border-top: 1px solid #27313a; }
	article { display: grid; grid-template-columns: .5fr 1.2fr 1.5fr; gap: 2rem; padding: 2rem 0; border-bottom: 1px solid #27313a; }
	article span { color: #66b2ff; font: .7rem "Cascadia Code", monospace; text-transform: uppercase; }
	h2, p { margin: 0; } h2 { letter-spacing: -.03em; } p { color: #93a0ac; line-height: 1.6; }
	@media(max-width:700px){ article { grid-template-columns: 1fr; gap: .6rem; } }
</style>
