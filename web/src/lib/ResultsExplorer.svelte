<script lang="ts">
	import BenchmarkChart from './BenchmarkChart.svelte';
	import BenchmarkScorecard from './BenchmarkScorecard.svelte';
	import OverallChart from './OverallChart.svelte';
	import { scoreBenchmark, scoreOverall } from './scoring';
	import type { ArenaRun } from './types';

	let {
		title,
		subtitle,
		run,
		fixedBenchmark,
		fixedLanguage
	}: {
		title: string;
		subtitle: string;
		run: ArenaRun;
		fixedBenchmark?: string;
		fixedLanguage?: string;
	} = $props();

	let view = $state<'chart' | 'scorecard'>('chart');
	const benchmarks = $derived([...new Set(run.results.map((result) => result.benchmark.id))].toSorted());
	let selectedBenchmark = $derived(fixedBenchmark ?? 'overall');
	const activeBenchmark = $derived(selectedBenchmark);
	const benchmarkResults = $derived(run.results.filter((result) => result.benchmark.id === activeBenchmark));
	const allScores = $derived(activeBenchmark === 'overall' ? scoreOverall(run.results) : scoreBenchmark(run.results, activeBenchmark));
	const visibleScores = $derived(fixedLanguage ? allScores.filter((score) => score.language.id === fixedLanguage) : allScores);
	const profileScores = $derived(
		fixedLanguage
			? ['overall', ...benchmarks].map((benchmark) =>
				(benchmark === 'overall' ? scoreOverall(run.results) : scoreBenchmark(run.results, benchmark))
					.find((score) => score.language.id === fixedLanguage)
			)
			: []
	);
	const profileBenchmarks = $derived(['overall', ...benchmarks]);
</script>

<svelte:head><title>{title} · Runtime Arena</title></svelte:head>

<section class="explorer">
	<header class="page-head">
		<div>
			<p class="eyebrow">{subtitle}</p>
			<h1>{title}</h1>
			<p class="lede">Verified runtime measurements from one machine, one dataset, and one clock.</p>
		</div>
		<div class="run-tag">
			<span>Run</span>
			<strong>{run.runId}</strong>
			<time datetime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time>
		</div>
	</header>

	{#if fixedLanguage}
		<nav class="profile-strip" aria-label="Benchmark scores">
			{#each profileScores as score, index (profileBenchmarks[index])}
				<button class:active={activeBenchmark === profileBenchmarks[index]} onclick={() => selectedBenchmark = profileBenchmarks[index]}>
					<span>{profileBenchmarks[index]}</span>
					<strong>{score?.overall === null || score?.overall === undefined ? '—' : Math.round(score.overall)}</strong>
				</button>
			{/each}
		</nav>
	{/if}

	<div class="toolbar">
		{#if !fixedBenchmark}
			<label>
				<span>Benchmark</span>
				<select bind:value={selectedBenchmark}>
					<option value="overall">Overall average</option>
					{#each benchmarks as benchmark (benchmark)}
						<option value={benchmark}>{benchmark}</option>
					{/each}
				</select>
			</label>
		{:else}
			<div class="fixed-context"><span>Benchmark</span><strong>{fixedBenchmark}</strong></div>
		{/if}

		<div class="view-toggle" role="group" aria-label="Results view">
			<button class:active={view === 'chart'} aria-pressed={view === 'chart'} onclick={() => view = 'chart'}>Chart</button>
			<button class:active={view === 'scorecard'} aria-pressed={view === 'scorecard'} onclick={() => view = 'scorecard'}>Scorecard</button>
		</div>
	</div>

	<div class="view-intro">
		<div>
			<p>{view === 'chart' ? 'Measured comparison' : 'Runtime quality'}</p>
			<h2>{activeBenchmark}</h2>
		</div>
		<p>
			{view === 'chart' && activeBenchmark === 'overall'
				? 'Each bar is the language’s weighted average across every benchmark.'
				: view === 'chart'
					? 'Shorter bars are faster. Muted dots show each measured sample.'
				: 'Scores are relative to accepted languages in this benchmark and run.'}
		</p>
	</div>

	{#if view === 'chart'}
		{#if activeBenchmark === 'overall'}
			<OverallChart scores={allScores} languageId={fixedLanguage} />
		{:else}
			<BenchmarkChart results={benchmarkResults} languageId={fixedLanguage} />
		{/if}
	{:else}
		<BenchmarkScorecard scores={visibleScores} />
	{/if}

	<details class="run-details">
		<summary>Run and machine details</summary>
		<dl>
			<div><dt>Processor</dt><dd>{run.environment.cpu.model.trim()}</dd></div>
			<div><dt>Logical cores</dt><dd>{run.environment.cpu.logicalCores}</dd></div>
			<div><dt>Memory</dt><dd>{(run.environment.memoryBytes / 2 ** 30).toFixed(1)} GiB</dd></div>
			<div><dt>System</dt><dd>{run.environment.operatingSystem.platform} {run.environment.operatingSystem.release}</dd></div>
			<div><dt>Revision</dt><dd><code>{run.gitCommit?.slice(0, 10) ?? 'unknown'}</code></dd></div>
			<div><dt>Arena</dt><dd>{run.arenaVersion}</dd></div>
		</dl>
	</details>
</section>

<style>
	.explorer { max-width: 1260px; margin: auto; padding: clamp(2.5rem, 6vw, 5.5rem) clamp(1rem, 4vw, 3.5rem) 5rem; }
	.page-head { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: end; padding-bottom: 2.5rem; }
	.eyebrow { margin: 0 0 .7rem; color: var(--accent); font: 650 .68rem var(--mono); letter-spacing: .1em; text-transform: uppercase; }
	h1 { max-width: 780px; margin: 0; font: 640 clamp(2.6rem, 6vw, 5.7rem)/.92 var(--display); letter-spacing: -.055em; text-transform: capitalize; }
	.lede { max-width: 38rem; margin: 1rem 0 0; color: var(--muted); line-height: 1.55; }
	.run-tag { display: grid; max-width: 20rem; justify-items: end; gap: .25rem; padding-right: 1rem; border-right: 2px solid var(--accent); font-family: var(--mono); text-align: right; }
	.run-tag span, .run-tag time { color: var(--muted); font-size: .64rem; text-transform: uppercase; }
	.run-tag strong { overflow: hidden; max-width: 100%; font-size: .75rem; text-overflow: ellipsis; }
	.profile-strip { display: grid; grid-template-columns: repeat(4, 1fr); margin-bottom: 1rem; border: 1px solid var(--rule); border-radius: .65rem; overflow: hidden; }
	.profile-strip button { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 0; border-right: 1px solid var(--rule); background: var(--panel); color: var(--muted); padding: .85rem 1rem; cursor: pointer; text-transform: capitalize; }
	.profile-strip button:last-child { border-right: 0; }
	.profile-strip button.active { background: color-mix(in srgb, var(--accent) 10%, var(--panel)); color: var(--text); }
	.profile-strip strong { font: 650 1.4rem var(--display); }
	.toolbar { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: .9rem 0; border-block: 1px solid var(--rule); }
	label, .fixed-context { display: grid; gap: .35rem; }
	label > span, .fixed-context span { color: var(--muted); font: 600 .62rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
	select { min-width: 12rem; border: 0; background: transparent; color: var(--text); padding: .25rem 1.2rem .25rem 0; font: 650 .9rem var(--body); text-transform: capitalize; }
	select option { background: var(--panel); }
	.fixed-context strong { text-transform: capitalize; }
	.view-toggle { display: inline-flex; padding: .22rem; background: var(--panel); border: 1px solid var(--rule); border-radius: .45rem; }
	.view-toggle button { min-width: 6.5rem; border: 0; border-radius: .28rem; background: transparent; color: var(--muted); padding: .55rem .8rem; cursor: pointer; font: 650 .72rem var(--mono); }
	.view-toggle button.active { background: var(--accent); color: #071217; }
	.view-intro { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding: 2rem 0 1rem; }
	.view-intro p { max-width: 34rem; margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
	.view-intro div p { color: var(--accent); font: 650 .62rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
	.view-intro h2 { margin: .2rem 0 0; font-size: 1.65rem; text-transform: capitalize; }
	.run-details { margin-top: 1rem; border: 1px solid var(--rule); border-radius: .7rem; background: var(--panel); }
	.run-details summary { padding: 1rem 1.2rem; color: var(--muted); cursor: pointer; font: 650 .68rem var(--mono); text-transform: uppercase; letter-spacing: .06em; }
	dl { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border-top: 1px solid var(--rule); }
	dl div { min-width: 0; padding: 1rem 1.2rem; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
	dt { color: var(--muted); font-size: .65rem; }
	dd { overflow-wrap: anywhere; margin: .35rem 0 0; font-size: .8rem; }
	dd code { font-family: var(--mono); }
	@media (max-width: 700px) {
		.page-head { grid-template-columns: 1fr; }
		.run-tag { justify-items: start; border-right: 0; border-left: 2px solid var(--accent); padding: 0 0 0 1rem; text-align: left; }
		.toolbar, .view-intro { align-items: stretch; flex-direction: column; }
		.view-toggle { display: grid; grid-template-columns: 1fr 1fr; }
		.profile-strip { grid-template-columns: 1fr; }
		.profile-strip button { border-right: 0; border-bottom: 1px solid var(--rule); }
		dl { grid-template-columns: 1fr 1fr; }
	}
	@media (max-width: 430px) { dl { grid-template-columns: 1fr; } }
</style>
