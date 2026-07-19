<script lang="ts">
	import type { BenchmarkScore } from './types';

	let { scores, languageId }: { scores: BenchmarkScore[]; languageId?: string } = $props();
	const visible = $derived(
		(languageId ? scores.filter((score) => score.language.id === languageId) : scores)
			.toSorted((a, b) => (b.performance ?? -1) - (a.performance ?? -1) || a.language.name.localeCompare(b.language.name))
	);
	const colors: Record<string, string> = { rust: '#d97852', go: '#58b7d6', java: '#f89820', javascript: '#f7df1e', typescript: '#3178c6', lua: '#2554C7', python: '#f0c040', cpp: '#6366f1' };
</script>

<section class="chart-field" aria-labelledby="chart-field-title">
	<header>
		<div>
			<p>All benchmarks</p>
			<h2 id="chart-field-title">Speed</h2>
		</div>
		<div class="legend" aria-label="Language colors">
			{#each visible as score (score.language.id)}
				<span><i style:background={colors[score.language.id] ?? '#8c9aa5'}></i>{score.language.name}</span>
			{/each}
		</div>
	</header>

	<div class="bars">
		{#each visible as score (score.language.id)}
			<div class="bar-row">
				<div
					class="track"
					aria-label={`${score.language.name} speed score ${Math.round(score.performance ?? 0)}`}
				>
					<i
						style:--score={`${score.performance ?? 0}%`}
						style:--color={colors[score.language.id] ?? '#8c9aa5'}
					></i>
				</div>
				<code>{score.performance === null ? '—' : Math.round(score.performance)}</code>
			</div>
		{/each}
	</div>
</section>

<style>
	.chart-field { padding-block: 1rem 2.5rem; }
	header { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding-bottom: 2.5rem; }
	header p, header h2 { margin: 0; }
	header p { color: var(--muted); font: 600 .62rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
	header h2 { margin-top: .3rem; font-size: clamp(1.8rem, 3vw, 2.6rem); letter-spacing: -.035em; }
	.legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .7rem 1.2rem; }
	.legend span { display: inline-flex; align-items: center; gap: .5rem; color: var(--muted); font: 600 .72rem var(--mono); }
	.legend i { width: .65rem; height: .65rem; border-radius: 50%; }
	.bars { display: grid; gap: 1rem; }
	.bar-row { display: grid; grid-template-columns: 1fr 3.25rem; gap: 1rem; align-items: center; }
	.track { height: clamp(1.7rem, 2.5vw, 2.25rem); overflow: hidden; border-radius: .28rem; background: #0d1419; }
	.track i { display: block; width: var(--score); height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--color) 58%, #0d1419), var(--color)); }
	code { text-align: right; font: 750 1rem var(--mono); }
	@media (max-width: 620px) {
		header { align-items: start; flex-direction: column; gap: 1rem; }
		.legend { justify-content: flex-start; }
		.chart-field { padding-bottom: 1.5rem; }
		header { padding-bottom: 2rem; }
		.track { height: 1.45rem; }
		code { font-size: .84rem; }
	}
</style>
