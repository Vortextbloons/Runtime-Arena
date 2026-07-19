<script lang="ts">
	import { browser } from '$app/environment';
	import BenchmarkChart from './BenchmarkChart.svelte';
	import BenchmarkScorecard from './BenchmarkScorecard.svelte';
	import { buildAllCardData, type LanguageCardData } from './cards';
	import OverallCard from './OverallCard.svelte';
	import OverallChart from './OverallChart.svelte';
	import { scoreBenchmark, scoreOverall } from './scoring';
	import type { ArenaRun, BenchmarkScore } from './types';

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
	let expandedCard = $state<{ score: BenchmarkScore; card?: LanguageCardData } | null>(null);
	let overlayEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!browser || !expandedCard) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => overlayEl?.focus({ preventScroll: true }));
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function closeExpanded() {
		expandedCard = null;
	}

	function openExpanded(score: BenchmarkScore, card?: LanguageCardData) {
		expandedCard = { score, card };
	}
	const benchmarks = $derived([...new Set(run.results.map((result) => result.benchmark.id))].toSorted());
	let selectedBenchmark = $derived(fixedBenchmark ?? 'overall');
	const activeBenchmark = $derived(selectedBenchmark);
	const benchmarkResults = $derived(run.results.filter((result) => result.benchmark.id === activeBenchmark));
	const allScores = $derived(activeBenchmark === 'overall' ? scoreOverall(run.results) : scoreBenchmark(run.results, activeBenchmark));
	const languageCards = $derived(
		activeBenchmark === 'overall'
			? buildAllCardData({
					snapshotId: run.snapshotId,
					measuredAt: run.updatedAt,
					results: run.results,
					overallScores: allScores
				})
			: []
	);
	const cardsByLanguage = $derived(new Map(languageCards.map((card) => [card.languageId, card])));
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
	const machineSignatures = $derived([...new Set(run.results.map((result) => {
		const machine = result.provenance.machine;
		return `${machine.cpu.model}|${machine.cpu.architecture}|${machine.operatingSystem.platform}`;
	}))]);
	const representativeMachine = $derived(run.results[0]?.provenance.machine);
</script>

<svelte:head><title>{title} · Runtime Arena</title></svelte:head>

<section class="explorer">
	<header class="page-head">
		<div>
			<p class="eyebrow">{subtitle}</p>
			<h1>{title}</h1>
			<p class="lede">Verified measurements maintained incrementally, one benchmark cell at a time.</p>
		</div>
		<div class="run-tag">
			<span>Snapshot</span>
			<strong>{run.snapshotId}</strong>
			<time datetime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString()}</time>
		</div>
	</header>
	{#if machineSignatures.length > 1}
		<p class="machine-warning">Comparability note: this snapshot contains measurements from {machineSignatures.length} materially different machine environments.</p>
	{/if}

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
					<option value="overall">Overall score</option>
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
			<p>{view === 'chart' ? 'Measured comparison' : 'Weighted overall score'}</p>
			<h2>{activeBenchmark === 'overall' ? 'Overall' : activeBenchmark.replace(/[-_]+/g, ' ')}</h2>
			<p class="qualification">Snapshot rankings · 80% geometric-mean speed · 10% stability · 10% flexibility · skipped workloads noted</p>
		</div>
		<p>
			{view === 'chart' && activeBenchmark === 'overall'
				? 'Each bar is the geometric mean of normalized speed across the benchmarks that language completed in this snapshot.'
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
		{#if activeBenchmark === 'overall'}
			<div class="card-grid">
				{#each allScores as score (score.language.id)}
					{@const card = cardsByLanguage.get(score.language.id)}
					<OverallCard {score} {card} onexpand={() => openExpanded(score, card)} />
				{/each}
			</div>
		{:else}
			<BenchmarkScorecard scores={visibleScores} />
		{/if}
	{/if}

	{#if expandedCard}
		<div
			bind:this={overlayEl}
			class="card-overlay"
			onclick={(e) => { if (e.target === e.currentTarget) closeExpanded(); }}
			onkeydown={(e) => { if (e.key === 'Escape') closeExpanded(); }}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="card-overlay-inner" role="group">
				<OverallCard score={expandedCard.score} card={expandedCard.card} expanded />
				{#if (!expandedCard.score.eligible && expandedCard.score.diagnostics.length) || (expandedCard.score.benchmarks && expandedCard.score.benchmarks.length)}
					<div class="expanded-details">
						{#if !expandedCard.score.eligible && expandedCard.score.diagnostics.length}
							<section class="expanded-diagnostics">
								<h3>{expandedCard.score.diagnostics.length === 1 ? 'UNVERIFIED · 1 issue' : `UNVERIFIED · ${expandedCard.score.diagnostics.length} issues`}</h3>
								<ul>
									{#each expandedCard.score.diagnostics as diagnostic, diagnosticIndex (`${diagnosticIndex}-${diagnostic}`)}
										<li>{diagnostic}</li>
									{/each}
								</ul>
							</section>
						{/if}
						{#if expandedCard.score.benchmarks && expandedCard.score.benchmarks.length}
							<h3>Benchmark breakdown</h3>
							<div class="expanded-table">
								<div class="expanded-table-head">
									<span>Benchmark</span>
									<span>Overall</span>
									<span>Performance</span>
									<span>Stability</span>
									<span>Flex</span>
								</div>
								{#each expandedCard.score.benchmarks as bench (bench.benchmarkId)}
									<div class="expanded-table-row">
										<strong>{bench.benchmarkId.replace(/[-_]+/g, ' ')}</strong>
										<code>{Math.round(bench.overall)}</code>
										<code>{Math.round(bench.performance)}</code>
										<code>{Math.round(bench.consistency)}</code>
										<code>{Math.round(bench.performance)}</code>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				<button class="expanded-close" onclick={closeExpanded} type="button">✕</button>
			</div>
		</div>
	{/if}

	<details class="run-details">
		<summary>Snapshot and machine details</summary>
		<dl>
			<div><dt>Processor</dt><dd>{representativeMachine?.cpu.model.trim() ?? 'unknown'}</dd></div>
			<div><dt>Logical cores</dt><dd>{representativeMachine?.cpu.logicalCores ?? 'unknown'}</dd></div>
			<div><dt>Memory</dt><dd>{representativeMachine ? `${(representativeMachine.memoryBytes / 2 ** 30).toFixed(1)} GiB` : 'unknown'}</dd></div>
			<div><dt>System</dt><dd>{representativeMachine?.operatingSystem.platform ?? 'unknown'} {representativeMachine?.operatingSystem.release ?? ''}</dd></div>
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
	.machine-warning { margin: -1rem 0 2rem; padding: .8rem 1rem; border-left: 2px solid var(--warning); background: color-mix(in srgb, var(--warning) 8%, transparent); color: var(--muted); }
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
	.view-intro .qualification {
		margin-top: 0.55rem;
		max-width: 28rem;
		color: var(--muted);
		font: 600 0.68rem / 1.4 var(--mono);
		letter-spacing: 0.02em;
		text-transform: none;
	}
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

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1.2rem;
		padding: 0.5rem 0 2rem;
		align-items: start;
	}

	.card-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: block;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		padding: 2rem;
		-webkit-overflow-scrolling: touch;
	}

	.card-overlay-inner {
		position: relative;
		display: grid;
		grid-template-columns: minmax(260px, 340px) minmax(0, 1.4fr);
		gap: 2rem;
		align-items: start;
		max-width: 920px;
		width: 100%;
		margin: 0 auto;
		padding-bottom: 2rem;
	}

	.card-overlay-inner :global(.card-2k) {
		cursor: default;
		transform: none;
	}

	.card-overlay-inner :global(.card-2k:hover) {
		transform: none;
	}

	.expanded-details {
		background: var(--panel);
		border: 1px solid var(--rule);
		border-radius: 1rem;
		padding: 1.5rem;
		display: grid;
		gap: 1.2rem;
	}

	.expanded-details h3 {
		margin: 0 0 0.75rem;
		font: 650 0.72rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.expanded-diagnostics h3 {
		color: var(--warning);
	}

	.expanded-diagnostics ul {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--muted);
		font-size: 0.82rem;
		line-height: 1.45;
		display: grid;
		gap: 0.35rem;
	}

	.expanded-table {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--rule);
	}

	.expanded-table-head,
	.expanded-table-row {
		display: grid;
		grid-template-columns: 1.2fr repeat(4, 1fr);
		gap: 0.6rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--rule);
		align-items: center;
	}

	.expanded-table-head {
		color: var(--muted);
		font: 600 0.58rem var(--mono);
		text-transform: uppercase;
	}

	.expanded-table-row {
		font-size: 0.78rem;
	}

	.expanded-table-row strong {
		text-transform: capitalize;
	}

	.expanded-table-row code {
		font-family: var(--mono);
		text-align: center;
	}

	.expanded-close {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--rule);
		border-radius: 0.4rem;
		background: var(--panel);
		color: var(--muted);
		cursor: pointer;
		font-size: 0.9rem;
	}

	.expanded-close:hover {
		color: var(--text);
		border-color: var(--muted);
	}

	@media (max-width: 700px) {
		.card-overlay { padding: 1rem; }
		.card-overlay-inner {
			grid-template-columns: 1fr;
		}
		.expanded-table-head,
		.expanded-table-row {
			grid-template-columns: 1fr repeat(4, 0.8fr);
			font-size: 0.68rem;
		}
	}
</style>
