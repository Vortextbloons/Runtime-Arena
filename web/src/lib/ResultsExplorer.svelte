<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BenchmarkChart from './BenchmarkChart.svelte';
	import BenchmarkScorecard from './BenchmarkScorecard.svelte';
	import { applyBadgeBonusesToScores, buildAllCardData, type EarnedBadge, type LanguageCardData } from './cards';
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

	const benchmarks = $derived([...new Set(run.results.map((result) => result.benchmark.id))].toSorted());

	function parseView(value: string | null): 'chart' | 'scorecard' {
		return value === 'scorecard' ? 'scorecard' : 'chart';
	}

	function parseBenchmark(value: string | null, allowed: string[]): string {
		if (!value || value === 'overall') return 'overall';
		return allowed.includes(value) ? value : 'overall';
	}

	function formatSnapshotId(id: string): string {
		const match = /^(?<date>\d{4}-\d{2}-\d{2})T.*?(?<tail>[a-f0-9]{6,})z?$/i.exec(id);
		if (match?.groups) return `${match.groups.date} · ${match.groups.tail}`;
		return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
	}

	function initialBenchmark(): string {
		if (fixedBenchmark) return fixedBenchmark;
		return parseBenchmark(
			page.url.searchParams.get('benchmark'),
			[...new Set(run.results.map((result) => result.benchmark.id))]
		);
	}

	function initialView(): 'chart' | 'scorecard' {
		return parseView(page.url.searchParams.get('view'));
	}

	let view = $state<'chart' | 'scorecard'>(initialView());
	let selectedBenchmark = $state(initialBenchmark());
	let expandedCard = $state<{ score: BenchmarkScore; card?: LanguageCardData } | null>(null);
	let selectedBadgeId = $state<string | null>(null);
	let overlayEl: HTMLDivElement | undefined = $state();
	let lastUrlSearch = $state(page.url.search);

	$effect(() => {
		if (fixedBenchmark) selectedBenchmark = fixedBenchmark;
	});

	$effect(() => {
		if (!browser) return;
		const search = page.url.search;
		if (search === lastUrlSearch) return;
		lastUrlSearch = search;
		view = parseView(page.url.searchParams.get('view'));
		if (!fixedBenchmark) {
			selectedBenchmark = parseBenchmark(page.url.searchParams.get('benchmark'), benchmarks);
		}
	});

	$effect(() => {
		if (!browser || !expandedCard) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => overlayEl?.focus({ preventScroll: true }));
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function syncUrl(nextView: 'chart' | 'scorecard', nextBenchmark: string) {
		if (!browser) return;
		const params = new URLSearchParams(page.url.searchParams);
		if (nextView === 'chart') params.delete('view');
		else params.set('view', nextView);
		if (!fixedBenchmark) {
			if (nextBenchmark === 'overall') params.delete('benchmark');
			else params.set('benchmark', nextBenchmark);
		}
		const query = params.toString();
		const nextSearch = query ? `?${query}` : '';
		lastUrlSearch = nextSearch;
		const next = `${page.url.pathname}${nextSearch}${page.url.hash}`;
		const current = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (next !== current) {
			void goto(next, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	const expandedBadges = $derived(expandedCard?.card?.badges ?? []);
	const selectedBadge = $derived.by(() => {
		const badges = expandedBadges;
		if (!badges.length) return null;
		return badges.find((badge) => badge.badgeId === selectedBadgeId) ?? badges[0] ?? null;
	});
	const showExpandedDetails = $derived.by(() => {
		const current = expandedCard;
		if (!current) return false;
		const hasDiagnostics = !current.score.eligible && current.score.diagnostics.length > 0;
		const hasBenchmarks = Boolean(current.score.benchmarks?.length);
		const hasBadges = Boolean(current.card?.badges.length);
		return hasDiagnostics || hasBenchmarks || hasBadges;
	});

	function closeExpanded() {
		expandedCard = null;
		selectedBadgeId = null;
	}

	function openExpanded(score: BenchmarkScore, card?: LanguageCardData) {
		expandedCard = { score, card };
		selectedBadgeId = card?.featuredBadgeIds[0] ?? card?.badges[0]?.badgeId ?? null;
	}

	function badgeTierLabel(tier: string): string {
		if (tier === 'hall-of-fame') return 'HOF';
		return tier.replace(/-/g, ' ').toUpperCase();
	}

	function selectBadge(badge: EarnedBadge) {
		selectedBadgeId = badge.badgeId;
	}

	function setView(next: 'chart' | 'scorecard') {
		view = next;
		syncUrl(next, selectedBenchmark);
	}

	function setBenchmark(next: string) {
		if (fixedBenchmark) return;
		selectedBenchmark = next;
		syncUrl(view, next);
	}

	const activeBenchmark = $derived(fixedBenchmark ?? selectedBenchmark);
	const benchmarkResults = $derived(run.results.filter((result) => result.benchmark.id === activeBenchmark));
	const baseOverallScores = $derived(scoreOverall(run.results));
	const languageCards = $derived(
		activeBenchmark === 'overall'
			? buildAllCardData({
					snapshotId: run.snapshotId,
					measuredAt: run.updatedAt,
					results: run.results,
					overallScores: baseOverallScores
				})
			: []
	);
	const allScores = $derived(
		activeBenchmark === 'overall'
			? applyBadgeBonusesToScores(baseOverallScores, languageCards)
			: scoreBenchmark(run.results, activeBenchmark)
	);
	const cardsByLanguage = $derived(new Map(languageCards.map((card) => [card.languageId, card])));
	const visibleScores = $derived(fixedLanguage ? allScores.filter((score) => score.language.id === fixedLanguage) : allScores);
	const profileScores = $derived(
		fixedLanguage
			? ['overall', ...benchmarks].map((benchmark) => {
				if (benchmark === 'overall') {
					return baseOverallScores.find((score) => score.language.id === fixedLanguage);
				}
				return scoreBenchmark(run.results, benchmark).find((score) => score.language.id === fixedLanguage);
			})
			: []
	);
	const profileOverallCards = $derived(
		fixedLanguage
			? buildAllCardData({
					snapshotId: run.snapshotId,
					measuredAt: run.updatedAt,
					results: run.results,
					overallScores: baseOverallScores
				})
			: []
	);
	const profileDisplayScores = $derived(
		fixedLanguage
			? profileBenchmarks.map((benchmark, index) => {
				const score = profileScores[index];
				if (benchmark !== 'overall' || !score) return score;
				const card = profileOverallCards.find((entry) => entry.languageId === fixedLanguage);
				return card?.overall !== null && card?.overall !== undefined
					? { ...score, overall: card.overall }
					: score;
			})
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
			<strong title={run.snapshotId}>{formatSnapshotId(run.snapshotId)}</strong>
			<time datetime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString()}</time>
		</div>
	</header>
	{#if machineSignatures.length > 1}
		<p class="machine-warning">Comparability note: this snapshot contains measurements from {machineSignatures.length} materially different machine environments.</p>
	{/if}

	{#if fixedLanguage}
		<nav class="profile-strip" aria-label="Benchmark scores">
			{#each profileDisplayScores as score, index (profileBenchmarks[index])}
				<button class:active={activeBenchmark === profileBenchmarks[index]} onclick={() => setBenchmark(profileBenchmarks[index])}>
					<span>{profileBenchmarks[index]}</span>
					<strong>{score?.overall === null || score?.overall === undefined ? '—' : Math.round(score.overall)}</strong>
				</button>
			{/each}
		</nav>
	{/if}

	<div class="toolbar">
		{#if fixedBenchmark}
			<div class="fixed-context"><span>Benchmark</span><strong>{fixedBenchmark}</strong></div>
		{:else if !fixedLanguage}
			<label>
				<span>Benchmark</span>
				<select value={selectedBenchmark} onchange={(e) => setBenchmark(e.currentTarget.value)}>
					<option value="overall">Overall score</option>
					{#each benchmarks as benchmark (benchmark)}
						<option value={benchmark}>{benchmark}</option>
					{/each}
				</select>
			</label>
		{:else}
			<div class="fixed-context">
				<span>Benchmark</span>
				{#if activeBenchmark === 'overall'}
					<strong>Overall score</strong>
				{:else}
					<a href={resolve(`/benchmarks/${activeBenchmark}`)}>{activeBenchmark}</a>
				{/if}
			</div>
		{/if}

		<div class="view-toggle" role="group" aria-label="Results view">
			<button class:active={view === 'chart'} aria-pressed={view === 'chart'} onclick={() => setView('chart')}>Chart</button>
			<button class:active={view === 'scorecard'} aria-pressed={view === 'scorecard'} onclick={() => setView('scorecard')}>Scorecard</button>
		</div>
	</div>

	<div class="view-intro">
		<div>
			<h2>
				{#if activeBenchmark === 'overall'}
					Overall
				{:else if fixedBenchmark}
					{activeBenchmark.replace(/[-_]+/g, ' ')}
				{:else}
					<a href={resolve(`/benchmarks/${activeBenchmark}`)}>{activeBenchmark.replace(/[-_]+/g, ' ')}</a>
				{/if}
			</h2>
			<p class="qualification">
				<a href="{resolve('/methodology')}#ranking">75% geometric-mean speed · 25% flexibility</a>
				{#if view === 'scorecard'} · badge bonuses{/if}
				 · skipped workloads noted
			</p>
		</div>
		<p class="hint">
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
				{#if showExpandedDetails}
					<div class="expanded-details">
						{#if expandedBadges.length && selectedBadge}
							<section class="badge-dossier" aria-label="Badge collection">
								<h3>Badge collection</h3>
								<ul class="badge-dossier-list">
									{#each expandedBadges as badge (badge.badgeId)}
										<li>
											<button
												type="button"
												class="badge-dossier-chip tier-{badge.tier}"
												class:active={selectedBadge.badgeId === badge.badgeId}
												onclick={() => selectBadge(badge)}
												aria-pressed={selectedBadge.badgeId === badge.badgeId}
											>
												<span class="badge-dossier-name">{badge.name}</span>
												<span class="badge-dossier-tier">{badgeTierLabel(badge.tier)}</span>
											</button>
										</li>
									{/each}
								</ul>
								<div class="badge-dossier-detail">
									<p class="badge-dossier-heading">
										<strong>{selectedBadge.name}</strong>
										<span class="badge-dossier-tier-label tier-{selectedBadge.tier}">
											{badgeTierLabel(selectedBadge.tier)}
										</span>
									</p>
									<p class="badge-dossier-reason">{selectedBadge.reason}</p>
									{#if selectedBadge.nextTier}
										<p class="badge-dossier-next">
											<span>Next {badgeTierLabel(selectedBadge.nextTier.tier)}</span>
											{selectedBadge.nextTier.requirements.join(' · ')}
										</p>
									{:else}
										<p class="badge-dossier-maxed">Max tier reached</p>
									{/if}
								</div>
							</section>
						{/if}
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
	.page-head { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: end; padding-bottom: 1.75rem; }
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
	.fixed-context strong, .fixed-context a { text-transform: capitalize; }
	.fixed-context a {
		color: inherit;
		font-weight: 650;
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.fixed-context a:hover, .fixed-context a:focus-visible { color: #fff; }
	.view-toggle { display: inline-flex; padding: .22rem; background: var(--panel); border: 1px solid var(--rule); border-radius: .45rem; }
	.view-toggle button { min-width: 6.5rem; border: 0; border-radius: .28rem; background: transparent; color: var(--muted); padding: .55rem .8rem; cursor: pointer; font: 650 .72rem var(--mono); }
	.view-toggle button.active { background: var(--accent); color: #071217; }
	.view-intro { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding: 1.25rem 0 0.85rem; }
	.view-intro .hint { max-width: 34rem; margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
	.view-intro .qualification {
		margin: 0.4rem 0 0;
		max-width: 32rem;
		color: var(--muted);
		font: 600 0.68rem / 1.4 var(--mono);
		letter-spacing: 0.02em;
	}
	.view-intro .qualification a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
	}
	.view-intro .qualification a:hover,
	.view-intro .qualification a:focus-visible {
		color: var(--text);
	}
	.view-intro h2 { margin: 0; font-size: 1.45rem; text-transform: capitalize; }
	.view-intro h2 a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid transparent;
	}
	.view-intro h2 a:hover,
	.view-intro h2 a:focus-visible {
		border-bottom-color: color-mix(in srgb, var(--accent) 50%, transparent);
	}
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

	.badge-dossier-list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.4rem;
	}

	.badge-dossier-chip {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: 0.35rem;
		width: 100%;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--panel) 80%, #000);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		font: 650 0.62rem var(--mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.badge-dossier-chip:hover {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
	}

	.badge-dossier-chip.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--panel));
	}

	.badge-dossier-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge-dossier-tier,
	.badge-dossier-tier-label {
		color: var(--muted);
		white-space: nowrap;
	}

	.badge-dossier-chip.tier-legend .badge-dossier-tier,
	.badge-dossier-tier-label.tier-legend { color: #c9a227; }
	.badge-dossier-chip.tier-hall-of-fame .badge-dossier-tier,
	.badge-dossier-tier-label.tier-hall-of-fame { color: #9b7bb8; }
	.badge-dossier-chip.tier-gold .badge-dossier-tier,
	.badge-dossier-tier-label.tier-gold { color: #b8860b; }
	.badge-dossier-chip.tier-silver .badge-dossier-tier,
	.badge-dossier-tier-label.tier-silver { color: #8a939c; }
	.badge-dossier-chip.tier-bronze .badge-dossier-tier,
	.badge-dossier-tier-label.tier-bronze { color: #a0673a; }

	.badge-dossier-detail {
		display: grid;
		gap: 0.45rem;
		padding: 0.85rem 0.95rem;
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--bg, #0b0d10) 35%, transparent);
	}

	.badge-dossier-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0;
		font: 650 0.78rem var(--body);
	}

	.badge-dossier-heading strong {
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge-dossier-tier-label {
		font: 700 0.62rem var(--mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.badge-dossier-reason,
	.badge-dossier-next,
	.badge-dossier-maxed {
		margin: 0;
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.badge-dossier-next span {
		display: block;
		margin-bottom: 0.15rem;
		color: var(--accent);
		font: 650 0.62rem var(--mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.badge-dossier-maxed {
		font: 650 0.62rem var(--mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
