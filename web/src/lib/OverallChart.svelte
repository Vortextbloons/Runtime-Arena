<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BenchmarkScore } from './types';

	let { scores, languageId }: { scores: BenchmarkScore[]; languageId?: string } = $props();
	const visible = $derived(
		(languageId ? scores.filter((score) => score.language.id === languageId) : scores)
			.toSorted((a, b) => (b.performance ?? -1) - (a.performance ?? -1) || a.language.name.localeCompare(b.language.name))
	);
	const colors: Record<string, string> = { rust: '#d97852', go: '#58b7d6', java: '#f89820', javascript: '#f7df1e', typescript: '#3178c6', lua: '#2554C7', 'lua-interpreted': '#3d8b37', 'c-sharp': '#68217a', python: '#f0c040', cpp: '#6366f1', c: '#555555' };

	function statusLabel(score: BenchmarkScore): string {
		if (!score.eligible) return 'Unranked';
		if (score.diagnostics.length) return 'Partial';
		return 'Accepted';
	}

	function statusClass(score: BenchmarkScore): string {
		if (!score.eligible) return 'unranked';
		if (score.diagnostics.length) return 'partial';
		return 'accepted';
	}
</script>

<section class="chart-field" aria-label="Overall speed comparison">
	<div class="chart-head" aria-hidden="true">
		<span>Language</span>
		<span>Speed score</span>
		<span>Status</span>
		<span>Score</span>
	</div>
	<div class="bars">
		{#each visible as score (score.language.id)}
			{#if languageId}
				<div
					class="bar-row"
					aria-label={`${score.language.name} speed score ${score.performance === null ? 'unavailable' : Math.round(score.performance)}, ${statusLabel(score)}`}
				>
					<div class="language">
						<i style:background={colors[score.language.id] ?? '#8c9aa5'}></i>
						<strong>{score.language.name}</strong>
					</div>
					<div class="track">
						<span
							style:--score={`${score.performance ?? 0}%`}
							style:--color={colors[score.language.id] ?? '#8c9aa5'}
						></span>
					</div>
					<span class="status {statusClass(score)}">{statusLabel(score)}</span>
					<code>{score.performance === null ? '—' : Math.round(score.performance)}</code>
				</div>
			{:else}
				<a
					class="bar-row linked"
					href={resolve(`/languages/${score.language.id}`)}
					aria-label={`${score.language.name} speed score ${score.performance === null ? 'unavailable' : Math.round(score.performance)}, ${statusLabel(score)}`}
				>
					<div class="language">
						<i style:background={colors[score.language.id] ?? '#8c9aa5'}></i>
						<strong>{score.language.name}</strong>
					</div>
					<div class="track">
						<span
							style:--score={`${score.performance ?? 0}%`}
							style:--color={colors[score.language.id] ?? '#8c9aa5'}
						></span>
					</div>
					<span class="status {statusClass(score)}">{statusLabel(score)}</span>
					<code>{score.performance === null ? '—' : Math.round(score.performance)}</code>
				</a>
			{/if}
		{/each}
	</div>
</section>

<style>
	.chart-field { padding-block: 0.5rem 2rem; }
	.chart-head, .bar-row {
		display: grid;
		grid-template-columns: minmax(7.5rem, 0.9fr) minmax(12rem, 2.4fr) 5.5rem 3.25rem;
		gap: 1rem;
		align-items: center;
	}
	.chart-head {
		padding: 0 0 0.7rem;
		color: var(--muted);
		font: 600 0.62rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.chart-head span:nth-child(3),
	.chart-head span:nth-child(4) { text-align: right; }
	.bars { display: grid; gap: 0.55rem; }
	.bar-row {
		padding: 0.55rem 0.7rem;
		border: 1px solid transparent;
		border-radius: 0.45rem;
		text-decoration: none;
		color: inherit;
	}
	.bar-row.linked {
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.bar-row.linked:hover,
	.bar-row.linked:focus-visible {
		background: color-mix(in srgb, var(--panel) 80%, transparent);
		border-color: var(--rule);
	}
	.language { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
	.language i { width: 0.28rem; height: 1.5rem; border-radius: 1rem; flex-shrink: 0; }
	.language strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 650 0.92rem var(--body); }
	.track { height: clamp(1.35rem, 2vw, 1.7rem); overflow: hidden; border-radius: 0.28rem; background: #0d1419; }
	.track span { display: block; width: var(--score); height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--color) 58%, #0d1419), var(--color)); }
	.status {
		justify-self: end;
		font: 650 0.62rem var(--mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.status.accepted { color: var(--accepted); }
	.status.partial { color: var(--accent); }
	.status.unranked { color: var(--warning); }
	code { text-align: right; font: 750 1rem var(--mono); }
	@media (max-width: 700px) {
		.chart-head { display: none; }
		.bar-row {
			grid-template-columns: 1fr auto;
			gap: 0.45rem 0.8rem;
			padding: 0.7rem 0.55rem;
		}
		.track { grid-column: 1 / -1; grid-row: 2; }
		.status { grid-column: 1; grid-row: 3; justify-self: start; }
		code { grid-column: 2; grid-row: 1 / 2; align-self: center; font-size: 0.84rem; }
	}
</style>
