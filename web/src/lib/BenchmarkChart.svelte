<script lang="ts">
	import { formatDuration } from './scoring';
	import type { ArenaResult } from './types';

	let {
		results,
		languageId
	}: {
		results: ArenaResult[];
		languageId?: string;
	} = $props();

	const sizes = $derived([...new Set(results.map((result) => result.benchmark.size))]);
	const languageColors: Record<string, string> = {
		rust: '#d97852',
		go: '#58b7d6',
		typescript: '#7797df',
		lua: '#2554C7',
		python: '#f0c040'
	};

	const rowsFor = (size: string) => {
		const rows = results
			.filter((result) => result.benchmark.size === size)
			.toSorted((a, b) => {
				if (a.checker.status !== b.checker.status) return a.checker.status === 'accepted' ? -1 : 1;
				return a.execution.summary.medianWallTimeNanoseconds - b.execution.summary.medianWallTimeNanoseconds;
			});
		return languageId ? rows.filter((result) => result.language.id === languageId) : rows;
	};

	const cohortFor = (size: string) => results.filter((result) => result.benchmark.size === size);
</script>

<div class="chart-stack">
	{#each sizes as size (size)}
		{@const cohort = cohortFor(size)}
		{@const accepted = cohort.filter((result) => result.checker.status === 'accepted')}
		{@const fastest = Math.min(...accepted.map((result) => result.execution.summary.medianWallTimeNanoseconds))}
		{@const maximum = Math.max(1, ...cohort.map((result) => result.execution.summary.maximumWallTimeNanoseconds ?? result.execution.summary.medianWallTimeNanoseconds))}
		<section class="size-group" aria-labelledby={`size-${size}`}>
			<header class="size-header">
				<div>
					<p>Dataset size</p>
					<h2 id={`size-${size}`}>{size}</h2>
				</div>
				<span>{cohort.length} implementations</span>
			</header>

			<div class="chart-head" aria-hidden="true">
				<span>Language</span><span>Measured wall time</span><span>Median</span>
			</div>
			<div class="chart-rows">
				{#each rowsFor(size) as result (`${result.language.id}-${size}`)}
					{@const median = result.execution.summary.medianWallTimeNanoseconds}
					{@const acceptedResult = result.checker.status === 'accepted'}
					<article class:invalid={!acceptedResult}>
						<div class="language">
							<i style:background={languageColors[result.language.id] ?? '#8c9aa5'}></i>
							<div>
								<strong>{result.language.name}</strong>
								<span>{acceptedResult ? `${(median / fastest).toFixed(2)}× fastest` : result.checker.status}</span>
							</div>
						</div>
						<div class="track" aria-label={`${result.language.name}: ${formatDuration(median)} median`}>
							<div
								class="median-bar"
								style:--bar-color={languageColors[result.language.id] ?? '#8c9aa5'}
								style:--bar-width={`${Math.max(2, (median / maximum) * 100)}%`}
							></div>
							{#each result.execution.samples as sample (sample.iteration)}
								<span
									class="sample"
									aria-hidden="true"
									style:--sample-position={`${Math.min(100, (sample.wallTimeNanoseconds / maximum) * 100)}%`}
									style:--sample-color={languageColors[result.language.id] ?? '#8c9aa5'}
								></span>
							{/each}
						</div>
						<div class="reading">
							<strong>{acceptedResult ? formatDuration(median) : 'Unranked'}</strong>
							<span>{result.execution.summary.validSamples}/{result.execution.measuredIterations} valid</span>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.chart-stack { display: grid; gap: 1rem; }
	.size-group { overflow: hidden; border: 1px solid var(--rule); background: var(--panel); border-radius: .8rem; }
	.size-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.4rem; border-bottom: 1px solid var(--rule); }
	.size-header p, .size-header h2 { margin: 0; }
	.size-header p, .size-header > span { color: var(--muted); font: 600 .65rem var(--mono); text-transform: uppercase; letter-spacing: .09em; }
	.size-header h2 { margin-top: .2rem; font-size: 1.35rem; text-transform: capitalize; }
	.chart-head, article { display: grid; grid-template-columns: minmax(9rem, 1fr) minmax(14rem, 3fr) minmax(8rem, .8fr); gap: 1.5rem; align-items: center; }
	.chart-head { padding: .7rem 1.4rem; color: var(--muted); font: 600 .62rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
	.chart-head span:last-child { text-align: right; }
	article { min-height: 4.8rem; padding: .8rem 1.4rem; border-top: 1px solid color-mix(in srgb, var(--rule) 70%, transparent); }
	.language { display: flex; align-items: center; gap: .75rem; }
	.language > i { width: .28rem; height: 2.25rem; border-radius: 1rem; }
	.language div, .reading { display: grid; gap: .18rem; }
	.language span, .reading span { color: var(--muted); font-size: .68rem; }
	.track { position: relative; height: .75rem; background: #0d1419; border-radius: 1rem; }
	.median-bar { width: var(--bar-width); height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--bar-color) 55%, #0d1419), var(--bar-color)); transition: width .25s ease; }
	.sample { position: absolute; left: var(--sample-position); top: 50%; width: .38rem; height: .38rem; border: 1px solid var(--panel); border-radius: 50%; background: var(--sample-color); opacity: .8; transform: translate(-50%, -50%); }
	.reading { justify-items: end; font-family: var(--mono); }
	.reading strong { font-size: .84rem; }
	article.invalid { opacity: .55; }
	@media (max-width: 700px) {
		.chart-head { display: none; }
		article { grid-template-columns: 1fr auto; gap: .7rem 1rem; padding-block: 1rem; }
		.track { grid-column: 1 / -1; grid-row: 2; }
	}
	@media (prefers-reduced-motion: reduce) { .median-bar { transition: none; } }
</style>
