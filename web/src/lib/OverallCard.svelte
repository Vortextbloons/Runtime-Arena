<script lang="ts">
	import { SCORE_WEIGHTS } from './scoring';
	import type { BenchmarkScore } from './types';

	let {
		score,
		onexpand
	}: {
		score: BenchmarkScore;
		onexpand?: () => void;
	} = $props();

	let showBenchmarks = $state(false);

	const categories = [
		{ key: 'performance', label: 'PERF', weight: SCORE_WEIGHTS.performance },
		{ key: 'consistency', label: 'CONS', weight: SCORE_WEIGHTS.consistency },
		{ key: 'scalability', label: 'SCAL', weight: SCORE_WEIGHTS.scalability }
	] as const;

	function tier(overall: number): { name: string; class: string } {
		if (overall >= 90) return { name: 'DIAMOND', class: 'diamond' };
		if (overall >= 75) return { name: 'GOLD', class: 'gold' };
		if (overall >= 60) return { name: 'SILVER', class: 'silver' };
		return { name: 'BRONZE', class: 'bronze' };
	}

	const tierInfo = $derived(score.overall !== null ? tier(score.overall) : { name: 'UNRANKED', class: 'unranked' });
</script>

<div class="card {tierInfo.class}" onclick={onexpand} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onexpand?.(); }} role="button" tabindex="0">
	<div class="card-inner">
		<div class="card-header">
			<span class="tier-badge">{tierInfo.name}</span>
			<div class="ovr">
				<strong>{score.overall === null ? '—' : Math.round(score.overall)}</strong>
				<span>OVR</span>
			</div>
		</div>

		<div class="card-identity">
			<h3>{score.language.name}</h3>
			<p>{score.language.version.split(' ')[0] ?? ''}</p>
		</div>

		<div class="card-stats">
			{#each categories as cat (cat.key)}
				{@const value = score[cat.key]}
				<div class="stat-row">
					<span class="stat-label">{cat.label}</span>
					<div class="stat-bar-track">
						<div class="stat-bar-fill" style:--pct={`${value ?? 0}%`}></div>
					</div>
					<span class="stat-value">{value === null ? '—' : Math.round(value)}</span>
				</div>
			{/each}
		</div>

		{#if score.benchmarks && score.benchmarks.length}
			<div class="card-benchmarks">
				<button
					class="benchmarks-toggle"
					onclick={(e) => { e.stopPropagation(); showBenchmarks = !showBenchmarks; }}
					type="button"
				>
					<span class="chevron" class:open={showBenchmarks}>▸</span>
					Benchmarks
				</button>
				{#if showBenchmarks}
					<div class="benchmarks-list">
						{#each score.benchmarks as bench (bench.benchmarkId)}
							<div class="bench-row">
								<span class="bench-name">{bench.benchmarkId}</span>
								<span class="bench-score">{Math.round(bench.overall)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		border: 2px solid var(--tier-border, var(--rule));
		border-radius: 1rem;
		background: var(--panel);
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
		overflow: hidden;
		text-align: left;
		color: var(--text);
		font-family: var(--body);
		padding: 0;
	}

	.card:hover {
		transform: translateY(-4px) scale(1.02);
		box-shadow: 0 0 28px var(--tier-glow, transparent), 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	.card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 30% 0%, var(--tier-glow) 0%, transparent 60%);
		opacity: 0.08;
		pointer-events: none;
	}

	.card-inner {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.4rem 1.3rem 1.2rem;
	}

	/* --- Tier colors --- */
	.diamond {
		--tier-border: #2dd4bf;
		--tier-glow: #2dd4bf;
		--tier-accent: #2dd4bf;
	}
	.gold {
		--tier-border: #f59e0b;
		--tier-glow: #f59e0b;
		--tier-accent: #f59e0b;
	}
	.silver {
		--tier-border: #94a3b8;
		--tier-glow: #94a3b8;
		--tier-accent: #94a3b8;
	}
	.bronze {
		--tier-border: #a16207;
		--tier-glow: #a16207;
		--tier-accent: #a16207;
	}
	.unranked {
		--tier-border: var(--rule);
		--tier-glow: transparent;
		--tier-accent: var(--muted);
	}

	/* --- Header: tier badge + OVR --- */
	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.tier-badge {
		display: inline-block;
		padding: 0.2rem 0.55rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--tier-accent) 18%, transparent);
		color: var(--tier-accent);
		font: 700 0.58rem var(--mono);
		letter-spacing: 0.12em;
	}

	.ovr {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.ovr strong {
		font: 700 3rem/0.85 var(--display);
		color: var(--tier-accent);
		letter-spacing: -0.06em;
	}

	.ovr span {
		margin-top: 0.2rem;
		color: var(--muted);
		font: 600 0.6rem var(--mono);
		letter-spacing: 0.1em;
	}

	/* --- Identity --- */
	.card-identity h3 {
		margin: 0;
		font: 640 1.6rem var(--display);
		letter-spacing: -0.03em;
	}

	.card-identity p {
		margin: 0.15rem 0 0;
		color: var(--muted);
		font: 500 0.68rem var(--mono);
	}

	/* --- Stat bars --- */
	.card-stats {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.stat-row {
		display: grid;
		grid-template-columns: 2.8rem 1fr 2rem;
		gap: 0.6rem;
		align-items: center;
	}

	.stat-label {
		color: var(--muted);
		font: 700 0.58rem var(--mono);
		letter-spacing: 0.06em;
	}

	.stat-bar-track {
		height: 0.4rem;
		background: #0d1419;
		border-radius: 1rem;
		overflow: hidden;
	}

	.stat-bar-fill {
		width: var(--pct);
		height: 100%;
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-accent) 50%, #0d1419), var(--tier-accent));
		border-radius: inherit;
		transition: width 0.4s ease;
	}

	.stat-value {
		text-align: right;
		font: 700 0.72rem var(--mono);
		color: var(--text);
	}

	/* --- Benchmarks expandable --- */
	.card-benchmarks {
		border-top: 1px solid var(--rule);
		padding-top: 0.7rem;
	}

	.benchmarks-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: pointer;
		padding: 0;
		font: 650 0.62rem var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.benchmarks-toggle:hover {
		color: var(--text);
	}

	.chevron {
		display: inline-block;
		transition: transform 0.15s ease;
		font-size: 0.7rem;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.benchmarks-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	.bench-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
		background: #0d1419;
		border-radius: 0.3rem;
	}

	.bench-name {
		font: 500 0.68rem var(--mono);
		text-transform: capitalize;
	}

	.bench-score {
		font: 700 0.72rem var(--mono);
		color: var(--tier-accent);
	}

	/* --- Responsive --- */
	@media (max-width: 600px) {
		.card-inner {
			padding: 1.1rem 1rem 1rem;
		}

		.ovr strong {
			font-size: 2.4rem;
		}

		.card-identity h3 {
			font-size: 1.3rem;
		}
	}
</style>
