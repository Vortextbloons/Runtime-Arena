<script lang="ts">
	import { formatDuration, formatVariation, performanceLabel, scoreInterpretation } from './scoring';
	import { formatBenchmarkLabel, getScoreTier } from './tiers';
	import type { BenchmarkScore } from './types';

	let { scores }: { scores: BenchmarkScore[] } = $props();
	const categories = [
		{ key: 'performance', label: 'SPEED' },
		{ key: 'consistency', label: 'STABLE' },
		{ key: 'versatility', label: 'FLEX' }
	] as const;
</script>

<div class="score-list">
	{#each scores as score, index (`${score.benchmarkId}-${score.language.id}`)}
		{@const tierInfo = getScoreTier(score.overall)}
		<article
			class="row {tierInfo.class}"
			style:--tier-glow={tierInfo.glow}
			class:unranked={!score.eligible}
		>
			<div class="row-summary">
				<div class="rank-block">
					<span class="rank-label">RANK</span>
					<span class="rank-value">{score.eligible ? String(index + 1).padStart(2, '0') : '—'}</span>
				</div>

				<div class="identity">
					<p>{formatBenchmarkLabel(score.benchmarkId)}</p>
					<h2>{score.language.name}</h2>
					<div class="identity-meta">
						<span class="tier-chip">{tierInfo.sub}</span>
						<span class="version-chip">{score.language.version.split(' ')[0] ?? score.language.id}</span>
						<span class:accepted={score.eligible}>{score.eligible ? 'Accepted' : 'Unranked'}</span>
					</div>
				</div>

				<div class="overall">
					<span class="overall-label">SCORE</span>
					<strong>{score.overall === null ? '—' : Math.round(score.overall)}</strong>
				</div>

				<div class="score-rail" aria-label={score.overall === null ? 'Unranked' : `Weighted overall score ${Math.round(score.overall)} out of 100`}>
					<div class="ticks" aria-hidden="true"></div>
					<div class="fill" style:--score={`${score.overall ?? 0}%`}></div>
					{#if score.overall !== null}<i style:--score={`${score.overall}%`}></i>{/if}
				</div>

				<p class="interpretation">
					{#if score.overall === null}
						{#if score.diagnostics.length}
							<span class="issue-count">{score.diagnostics.length === 1 ? 'UNVERIFIED · 1 issue' : `UNVERIFIED · ${score.diagnostics.length} issues`}</span>
							{score.diagnostics[0]}
						{:else}
							This result is not eligible for ranking.
						{/if}
					{:else}
						{scoreInterpretation(score.overall)}
					{/if}
				</p>

				<div class="categories">
					{#each categories as category (category.key)}
						{@const value = category.key === 'versatility' && score.scoringModel === 'efficiency-v1' ? score.efficiency ?? null : score[category.key]}
						<div class="cat">
							<span class="cat-label">{category.key === 'versatility' && score.scoringModel === 'efficiency-v1' ? 'EFF' : category.label}{category.key === 'performance' ? ' · ranked' : category.key === 'versatility' ? score.scoringModel === 'efficiency-v1' ? ' · overall' : ' · Efficiency pending' : ' · diagnostic'}</span>
							<div class="category-track"><i style:--score={`${value ?? 0}%`}></i></div>
							<strong class="cat-value">{value === null ? '—' : Math.round(value)}</strong>
						</div>
					{/each}
				</div>
			</div>

			<details>
				<summary>{score.eligible ? 'Show calculation' : 'Show diagnostics'}</summary>
				{#if score.eligible}
					<div class="formula">
						<p><strong>Formula</strong> Geometric mean of fastest median ÷ this median. Stability is diagnostic; {score.scoringModel === 'efficiency-v1' ? 'Efficiency contributes 25% of overall.' : 'Efficiency is pending complete comparable resource data; FLEX remains in the ranking.'}</p>
						<p><strong>Cohort</strong> {formatBenchmarkLabel(score.benchmarkId)} · {score.expectedSizes.join(', ')} · accepted tiers with complete valid samples</p>
					</div>
					{#if score.benchmarks}
						<div class="size-table">
							<div class="table-head"><span>Benchmark</span><span>Overall</span><span>Speed</span><span>Stability</span><span>Flex</span></div>
							{#each score.benchmarks as benchmark (benchmark.benchmarkId)}
								<div class="size-row">
									<strong>{formatBenchmarkLabel(benchmark.benchmarkId)}</strong>
									<code>{benchmark.overall.toFixed(1)}</code>
									<code>{benchmark.performance.toFixed(1)}</code>
									<code>{benchmark.consistency.toFixed(1)}</code>
									<code>{benchmark.versatility != null ? benchmark.versatility.toFixed(1) : '—'}</code>
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
									<code>{size.performance.toFixed(1)} <span class="perf-label">{performanceLabel(size.medianNanoseconds / size.fastestMedianNanoseconds)}</span></code>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					{#if score.diagnostics.length}
						<p class="issue-count">{score.diagnostics.length === 1 ? 'UNVERIFIED · 1 issue' : `UNVERIFIED · ${score.diagnostics.length} issues`}</p>
					{/if}
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

	.row {
		--tier-glow: #4a5560;
		position: relative;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 45%, var(--rule));
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--tier-glow) 12%, var(--panel)) 0%, var(--panel) 60%);
		border-radius: 0.7rem;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--tier-glow) 18%, transparent) inset;
		transition: box-shadow 0.2s ease, transform 0.2s ease;
	}

	.row::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 18%, transparent) 0%, transparent 35%);
		pointer-events: none;
	}

	.row::after {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--tier-glow);
		box-shadow: 0 0 12px var(--tier-glow);
	}

	.row:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tier-glow) 35%, transparent) inset, 0 0 20px color-mix(in srgb, var(--tier-glow) 25%, transparent); }

	.row-summary {
		position: relative;
		display: grid;
		grid-template-columns: 3.5rem minmax(9rem, 1fr) auto minmax(15rem, 2.5fr);
		gap: 1rem 1.4rem;
		align-items: center;
		padding: 1.4rem 1.5rem;
	}

	.rank-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.4rem 0.5rem;
		background: color-mix(in srgb, var(--tier-glow) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 40%, transparent);
		border-radius: 0.35rem;
		clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
	}

	.rank-label {
		color: color-mix(in srgb, var(--tier-glow) 90%, #fff);
		font: 800 0.5rem var(--mono);
		letter-spacing: 0.18em;
	}

	.rank-value {
		color: #fff;
		font: 800 1.1rem var(--display);
		letter-spacing: -0.04em;
		text-shadow: 0 0 6px color-mix(in srgb, var(--tier-glow) 50%, transparent);
	}

	.identity p, .identity h2 { margin: 0; }
	.identity p { color: color-mix(in srgb, var(--tier-glow) 90%, #fff); font: 800 0.62rem var(--mono); text-transform: none; letter-spacing: 0.12em; }
	.identity h2 { margin: 0.25rem 0 0.45rem; font-size: 1.4rem; letter-spacing: -0.02em; }

	.identity-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.tier-chip, .version-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.45rem;
		font: 800 0.55rem var(--mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--tier-glow) 22%, transparent);
		color: #fff;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 60%, transparent);
	}

	.tier-chip {
		clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
	}

	.version-chip {
		border-radius: 0.2rem;
		color: color-mix(in srgb, var(--tier-glow) 80%, #fff);
	}

	.identity-meta span:last-child {
		font: 800 0.55rem var(--mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--warning);
	}

	.identity-meta span.accepted {
		color: var(--accepted);
	}

	.overall {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		min-width: 5.5rem;
		gap: 0.15rem;
	}

	.overall-label {
		color: color-mix(in srgb, var(--tier-glow) 90%, #fff);
		font: 800 0.5rem var(--mono);
		letter-spacing: 0.18em;
	}

	.overall strong {
		font: 800 2.6rem/0.85 var(--display);
		letter-spacing: -0.06em;
		color: #fff;
		text-shadow: 0 0 10px color-mix(in srgb, var(--tier-glow) 60%, transparent);
	}

	.score-rail {
		position: relative;
		height: 1.6rem;
		background: #0d1419;
		border-radius: 0.25rem;
		overflow: visible;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 30%, transparent);
	}

	.ticks { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), color-mix(in srgb, var(--muted) 28%, transparent) calc(10% - 1px) 10%); }
	.fill { width: var(--score); height: 100%; background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 60%, #0d1419) 0%, var(--tier-glow) 100%); border-radius: inherit; box-shadow: 0 0 10px color-mix(in srgb, var(--tier-glow) 60%, transparent); }
	.score-rail > i { position: absolute; left: var(--score); top: -0.35rem; width: 2px; height: 2.3rem; background: var(--text); box-shadow: 0 0 0 3px var(--panel), 0 0 6px var(--tier-glow); }

	.interpretation { grid-column: 2 / 4; margin: 0; color: var(--muted); font-size: 0.82rem; line-height: 1.5; }

	.categories { grid-column: 4; display: grid; gap: 0.55rem; }
	.categories .cat { display: grid; grid-template-columns: 7.2rem 1fr 2rem; gap: 0.75rem; align-items: center; }
	.categories span, .categories strong { font: 700 0.66rem var(--mono); }
	.categories .cat-value { text-align: right; font-variant-numeric: tabular-nums; }
	.category-track { height: 0.3rem; background: #0d1419; border-radius: 1rem; overflow: hidden; border: 1px solid color-mix(in srgb, var(--tier-glow) 20%, transparent); }
	.category-track i { display: block; width: var(--score); height: 100%; background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 50%, #0d1419), var(--tier-glow)); box-shadow: 0 0 6px color-mix(in srgb, var(--tier-glow) 60%, transparent); }

	.issue-count {
		display: block;
		margin-bottom: 0.35rem;
		color: var(--warning);
		font: 800 0.62rem var(--mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	details { border-top: 1px solid color-mix(in srgb, var(--tier-glow) 25%, var(--rule)); position: relative; }
	summary { padding: 0.8rem 1.5rem; color: color-mix(in srgb, var(--tier-glow) 90%, #fff); cursor: pointer; font: 800 0.66rem var(--mono); text-transform: uppercase; letter-spacing: 0.1em; }
	summary:hover { color: #fff; }

	.formula { display: flex; flex-wrap: wrap; gap: 0.6rem 2rem; padding: 0.5rem 1.5rem 1rem; color: var(--muted); font-size: 0.76rem; }
	.formula p { margin: 0; }
	.formula strong { color: #fff; margin-right: 0.35rem; }

	.size-table { margin: 0 1.5rem 1.5rem; border-top: 1px solid color-mix(in srgb, var(--tier-glow) 18%, var(--rule)); }
	.table-head, .size-row { display: grid; grid-template-columns: 1fr repeat(4, 1.2fr); gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid color-mix(in srgb, var(--tier-glow) 14%, var(--rule)); }
	.table-head { color: var(--muted); font: 600 0.6rem var(--mono); text-transform: uppercase; }
	.size-row { font-size: 0.75rem; }
	.size-row strong { text-transform: none; }
	.size-row code { font-family: var(--mono); }
	.perf-label { color: var(--muted); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; }

	ul { margin: 0.4rem 1.5rem 1.4rem; color: var(--warning); font-size: 0.78rem; }

	article.unranked { opacity: 0.78; }

	.dark-matter { --tier-glow: #00e5ff; }
	.prismatic-opal { --tier-glow: #e8c4ff; }
	.galaxy-opal { --tier-glow: #ff2bd6; }
	.pink-diamond { --tier-glow: #ff5fa8; }
	.diamond { --tier-glow: #5ce6ff; }
	.amethyst { --tier-glow: #b794ff; }
	.ruby { --tier-glow: #ff5a5a; }
	.sapphire { --tier-glow: #6a8cff; }
	.emerald { --tier-glow: #6affb8; }
	.unranked { --tier-glow: #4a5560; }

	@media (max-width: 800px) {
		.row-summary { grid-template-columns: 3rem 1fr auto; }
		.score-rail, .categories { grid-column: 2 / -1; }
		.interpretation { grid-column: 2 / -1; }
	}
	@media (max-width: 560px) {
		.row-summary { padding: 1.1rem; }
		.categories .cat { grid-template-columns: 6.4rem 1fr 1.6rem; }
		.table-head { display: none; }
		.size-row { grid-template-columns: 1fr 1fr; }
		.size-row strong { grid-column: 1 / -1; }
	}
</style>
