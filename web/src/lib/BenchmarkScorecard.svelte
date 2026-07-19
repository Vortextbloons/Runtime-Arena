<script lang="ts">
	import { formatDuration, formatVariation, SCORE_WEIGHTS, scoreInterpretation } from './scoring';
	import type { BenchmarkScore } from './types';

	let { scores }: { scores: BenchmarkScore[] } = $props();
	const categories = [
		{ key: 'performance', label: 'Performance', weight: SCORE_WEIGHTS.performance },
		{ key: 'consistency', label: 'Consistency', weight: SCORE_WEIGHTS.consistency },
		{ key: 'scalability', label: 'Scalability', weight: SCORE_WEIGHTS.scalability }
	] as const;
</script>

<div class="score-list">
	{#each scores as score, index (`${score.benchmarkId}-${score.language.id}`)}
		<article class:unranked={!score.eligible}>
			<div class="score-summary">
				<div class="rank">{score.eligible ? String(index + 1).padStart(2, '0') : '—'}</div>
				<div class="identity">
					<p>{score.benchmarkId}</p>
					<h2>{score.language.name}</h2>
					<span class:accepted={score.eligible}>{score.eligible ? 'Accepted' : 'Unranked'}</span>
				</div>
				<div class="overall">
					<strong>{score.overall === null ? '—' : Math.round(score.overall)}</strong>
					<span>overall / 100</span>
				</div>
				<div class="score-rail" aria-label={score.overall === null ? 'Unranked' : `Overall score ${Math.round(score.overall)} out of 100`}>
					<div class="ticks" aria-hidden="true"></div>
					<div class="fill" style:--score={`${score.overall ?? 0}%`}></div>
					{#if score.overall !== null}<i style:--score={`${score.overall}%`}></i>{/if}
				</div>
				<p class="interpretation">
					{score.overall === null ? score.diagnostics[0] ?? 'This result is not eligible for ranking.' : scoreInterpretation(score.overall)}
				</p>
				<div class="categories">
					{#each categories as category (category.key)}
						{@const value = score[category.key]}
						<div>
							<span>{category.label} <small>{Math.round(category.weight * 100)}%</small></span>
							<div class="category-track"><i style:--score={`${value ?? 0}%`}></i></div>
							<strong>{value === null ? '—' : Math.round(value)}</strong>
						</div>
					{/each}
				</div>
			</div>

			<details>
				<summary>{score.eligible ? 'Show calculation' : 'Show diagnostics'}</summary>
				{#if score.eligible}
					<div class="formula">
						<p><strong>Formula</strong> Performance × 60% + Consistency × 25% + Scalability × 15%</p>
						<p><strong>Cohort</strong> {score.benchmarkId} · {score.expectedSizes.join(', ')} · accepted results only</p>
					</div>
					{#if score.benchmarks}
						<div class="size-table">
							<div class="table-head"><span>Benchmark</span><span>Overall</span><span>Performance</span><span>Consistency</span><span>Scalability</span></div>
							{#each score.benchmarks as benchmark (benchmark.benchmarkId)}
								<div class="size-row">
									<strong>{benchmark.benchmarkId}</strong>
									<code>{benchmark.overall.toFixed(1)}</code>
									<code>{benchmark.performance.toFixed(1)}</code>
									<code>{benchmark.consistency.toFixed(1)}</code>
									<code>{benchmark.scalability.toFixed(1)}</code>
								</div>
							{/each}
						</div>
					{:else}
						<div class="size-table">
							<div class="table-head"><span>Size</span><span>Median</span><span>p95</span><span>Variation</span><span>Relative score</span></div>
							{#each score.sizes as size (size.size)}
								<div class="size-row">
									<strong>{size.size}</strong>
									<code>{formatDuration(size.medianNanoseconds)}</code>
									<code>{formatDuration(size.p95Nanoseconds)}</code>
									<code>{formatVariation(size.variation)}</code>
									<code>{size.performance.toFixed(1)}</code>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<ul>
						{#each score.diagnostics as diagnostic, diagnosticIndex (`${diagnosticIndex}-${diagnostic}`)}
							<li>{diagnostic}</li>
						{/each}
					</ul>
				{/if}
			</details>
		</article>
	{/each}
</div>

<style>
	.score-list { display: grid; gap: 1rem; }
	article { overflow: hidden; border: 1px solid var(--rule); background: var(--panel); border-radius: .8rem; }
	.score-summary { display: grid; grid-template-columns: 2.5rem minmax(9rem, 1fr) auto minmax(15rem, 2.5fr); gap: 1rem 1.4rem; align-items: center; padding: 1.5rem; }
	.rank { align-self: start; color: var(--muted); font: 600 .7rem var(--mono); }
	.identity p, .identity h2 { margin: 0; }
	.identity p { color: var(--muted); font: 600 .63rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
	.identity h2 { margin: .2rem 0 .45rem; font-size: 1.35rem; }
	.identity > span { display: inline-flex; color: var(--warning); font: 650 .66rem var(--mono); text-transform: uppercase; }
	.identity > span.accepted { color: var(--accepted); }
	.overall { display: grid; min-width: 5.5rem; justify-items: end; }
	.overall strong { font: 650 2.8rem/.85 var(--display); letter-spacing: -.06em; }
	.overall span { margin-top: .45rem; color: var(--muted); font: .6rem var(--mono); text-transform: uppercase; }
	.score-rail { position: relative; height: 1.6rem; background: #0d1419; border-radius: .25rem; overflow: visible; }
	.ticks { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), color-mix(in srgb, var(--muted) 28%, transparent) calc(10% - 1px) 10%); }
	.fill { width: var(--score); height: 100%; background: var(--accent); border-radius: inherit; }
	.score-rail > i { position: absolute; left: var(--score); top: -.35rem; width: 2px; height: 2.3rem; background: var(--text); box-shadow: 0 0 0 3px var(--panel); }
	.interpretation { grid-column: 2 / 4; margin: 0; color: var(--muted); font-size: .82rem; line-height: 1.5; }
	.categories { grid-column: 4; display: grid; gap: .55rem; }
	.categories > div { display: grid; grid-template-columns: 7.2rem 1fr 2rem; gap: .75rem; align-items: center; }
	.categories span, .categories strong { font: .66rem var(--mono); }
	.categories small { color: var(--muted); }
	.categories strong { text-align: right; }
	.category-track { height: .3rem; background: #0d1419; border-radius: 1rem; overflow: hidden; }
	.category-track i { display: block; width: var(--score); height: 100%; background: var(--accent); }
	details { border-top: 1px solid var(--rule); }
	summary { padding: .8rem 1.5rem; color: var(--muted); cursor: pointer; font: 650 .68rem var(--mono); text-transform: uppercase; letter-spacing: .06em; }
	summary:hover { color: var(--text); }
	.formula { display: flex; flex-wrap: wrap; gap: .6rem 2rem; padding: .5rem 1.5rem 1rem; color: var(--muted); font-size: .76rem; }
	.formula p { margin: 0; }
	.formula strong { color: var(--text); margin-right: .35rem; }
	.size-table { margin: 0 1.5rem 1.5rem; border-top: 1px solid var(--rule); }
	.table-head, .size-row { display: grid; grid-template-columns: 1fr repeat(4, 1.2fr); gap: .75rem; padding: .65rem 0; border-bottom: 1px solid var(--rule); }
	.table-head { color: var(--muted); font: 600 .6rem var(--mono); text-transform: uppercase; }
	.size-row { font-size: .75rem; }
	.size-row strong { text-transform: capitalize; }
	.size-row code { font-family: var(--mono); }
	ul { margin: .4rem 1.5rem 1.4rem; color: var(--warning); font-size: .78rem; }
	article.unranked { opacity: .72; }
	@media (max-width: 800px) {
		.score-summary { grid-template-columns: 2rem 1fr auto; }
		.score-rail, .categories { grid-column: 2 / -1; }
		.interpretation { grid-column: 2 / -1; }
	}
	@media (max-width: 560px) {
		.score-summary { padding: 1.1rem; }
		.categories > div { grid-template-columns: 6.4rem 1fr 1.6rem; }
		.table-head { display: none; }
		.size-row { grid-template-columns: 1fr 1fr; }
		.size-row strong { grid-column: 1 / -1; }
	}
</style>
