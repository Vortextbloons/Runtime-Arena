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
	let cardEl: HTMLElement | undefined = $state();
	let tiltX = $state(0);
	let tiltY = $state(0);

	const categories = [
		{ key: 'performance', label: 'PERF', weight: SCORE_WEIGHTS.performance },
		{ key: 'consistency', label: 'CONS', weight: SCORE_WEIGHTS.consistency },
		{ key: 'scalability', label: 'SCAL', weight: SCORE_WEIGHTS.scalability }
	] as const;

	function tier(overall: number): {
		name: string;
		sub: string;
		tag: string;
		class: string;
		gradient: string;
		glow: string;
	} {
		if (overall >= 95) return { name: 'UNTOUCHABLE', sub: 'Galaxy Opal', tag: 'GO', class: 'galaxy-opal', gradient: 'linear-gradient(135deg, #ff2bd6 0%, #b13bd6 45%, #6a1bd6 100%)', glow: '#ff2bd6' };
		if (overall >= 90) return { name: 'INVINCIBLE', sub: 'Pink Diamond', tag: 'PD', class: 'pink-diamond', gradient: 'linear-gradient(135deg, #ff6db5 0%, #d6388a 50%, #6a1d4f 100%)', glow: '#ff5fa8' };
		if (overall >= 80) return { name: 'DOMINANT', sub: 'Diamond', tag: 'DIA', class: 'diamond', gradient: 'linear-gradient(135deg, #5ce6ff 0%, #2d9fd6 50%, #103a5e 100%)', glow: '#5ce6ff' };
		if (overall >= 70) return { name: 'ELITE', sub: 'Amethyst', tag: 'AME', class: 'amethyst', gradient: 'linear-gradient(135deg, #b794ff 0%, #7a4ed6 50%, #2a1850 100%)', glow: '#b794ff' };
		if (overall >= 60) return { name: 'STANDARD', sub: 'Ruby', tag: 'RUB', class: 'ruby', gradient: 'linear-gradient(135deg, #ff5a5a 0%, #b32d2d 50%, #4a0e0e 100%)', glow: '#ff5a5a' };
		if (overall >= 45) return { name: 'ROOKIE', sub: 'Sapphire', tag: 'SAP', class: 'sapphire', gradient: 'linear-gradient(135deg, #6a8cff 0%, #2d4fb8 50%, #0e1a4a 100%)', glow: '#6a8cff' };
		return { name: 'COMMON', sub: 'Emerald', tag: 'EME', class: 'emerald', gradient: 'linear-gradient(135deg, #6affb8 0%, #2db87a 50%, #0e4a2a 100%)', glow: '#6affb8' };
	}

	const tierInfo = $derived(
		score.overall !== null ? tier(score.overall) : { name: 'UNVERIFIED', sub: 'No Rank', tag: '—', class: 'unranked', gradient: 'linear-gradient(135deg, #4a5560 0%, #2a323a 50%, #0e141a 100%)', glow: '#4a5560' }
	);

	const monogram = $derived((score.language.name[0] ?? '?').toUpperCase());
	const versionTag = $derived(score.language.version.split(' ')[0] ?? score.language.id);
	const teamLabel = $derived(score.benchmarkId === 'overall' ? 'ARENA' : score.benchmarkId.replace(/_/g, ' '));
	const nameParts = $derived(score.language.name.split(/\s+/).filter(Boolean));
	const firstName = $derived(nameParts[0] ?? score.language.name);
	const restName = $derived(nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

	function onMove(e: MouseEvent) {
		if (!cardEl) return;
		const rect = cardEl.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width - 0.5;
		const y = (e.clientY - rect.top) / rect.height - 0.5;
		tiltX = y * -6;
		tiltY = x * 6;
	}

	function onLeave() {
		tiltX = 0;
		tiltY = 0;
	}
</script>

<div
	bind:this={cardEl}
	class="card-2k {tierInfo.class}"
	onclick={onexpand}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onexpand?.(); }}
	onmousemove={onMove}
	onmouseleave={onLeave}
	role="button"
	tabindex="0"
	style:--tier-gradient={tierInfo.gradient}
	style:--tier-glow={tierInfo.glow}
	style:--tilt-x={`${tiltX}deg`}
	style:--tilt-y={`${tiltY}deg`}
>
	<div class="card-holo"></div>
	<div class="card-edge"></div>
	<div class="card-frame">
		<header class="card-top">
			<div class="ovr-block">
				<div class="ovr-number">
					<span class="ovr-digit">{score.overall === null ? '—' : String(Math.round(score.overall)).padStart(2, '0').split('')[0]}</span>
					<span class="ovr-digit">{score.overall === null ? '—' : String(Math.round(score.overall)).padStart(2, '0').split('')[1]}</span>
				</div>
				<div class="ovr-label">OVR</div>
			</div>
			<div class="meta-stack">
				<div class="tier-tag">{tierInfo.sub}</div>
				<div class="position-tag">{versionTag}</div>
			</div>
		</header>

		<div class="headshot">
			<div class="headshot-glow"></div>
			<div class="headshot-portrait">
				<span class="monogram">{monogram}</span>
				<div class="monogram-shadow"></div>
			</div>
			<div class="team-strip">
				<span class="team-text">{teamLabel.toUpperCase()}</span>
			</div>
		</div>

		<div class="name-block" class:solo={!restName}>
			<div class="first-name">{firstName.toUpperCase()}</div>
			{#if restName}
				<div class="last-name">{restName.toUpperCase()}</div>
			{/if}
		</div>

		<div class="tier-band">
			<span class="tier-band-glow" aria-hidden="true"></span>
			<span class="tier-band-text">{tierInfo.name}</span>
		</div>

		<div class="stat-rails">
			{#each categories as cat (cat.key)}
				{@const value = score[cat.key]}
				<div class="rail">
					<div class="rail-head">
						<span class="rail-label">{cat.label}</span>
						<span class="rail-value">{value === null ? '—' : Math.round(value ?? 0)}</span>
					</div>
					<div class="rail-track">
						<div class="rail-fill" style:--pct={`${value ?? 0}%`}></div>
						<div class="rail-ticks" aria-hidden="true"></div>
					</div>
				</div>
			{/each}
		</div>

		{#if score.benchmarks && score.benchmarks.length}
			<div class="benchmarks-strip">
				<button
					class="benchmarks-toggle"
					onclick={(e) => { e.stopPropagation(); showBenchmarks = !showBenchmarks; }}
					type="button"
				>
					<span class="chevron" class:open={showBenchmarks}>▸</span>
					<span>{showBenchmarks ? 'Hide' : 'Show'} benchmark breakdown</span>
				</button>
				{#if showBenchmarks}
					<div class="benchmarks-list">
						{#each score.benchmarks as bench (bench.benchmarkId)}
							<div class="bench-row">
								<span class="bench-name">{bench.benchmarkId.replace(/_/g, ' ')}</span>
								<div class="bench-rail">
									<div class="bench-rail-fill" style:--pct={`${bench.overall}%`}></div>
								</div>
								<span class="bench-score">{Math.round(bench.overall)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if !score.eligible && score.diagnostics.length}
			<div class="diagnostics">
				{score.diagnostics[0]}
			</div>
		{/if}
	</div>
</div>

<style>
	.card-2k {
		--tier-gradient: linear-gradient(135deg, #4a5560 0%, #2a323a 50%, #0e141a 100%);
		--tier-glow: #4a5560;
		position: relative;
		display: block;
		width: 100%;
		max-width: 320px;
		aspect-ratio: 5 / 8.2;
		margin: 0 auto;
		color: #fff;
		font-family: var(--body);
		cursor: pointer;
		transform-style: preserve-3d;
		transform: perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
		transition: transform 0.18s ease, filter 0.2s ease;
		filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
		text-align: left;
	}

	.card-2k:hover {
		filter: drop-shadow(0 18px 36px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 18px var(--tier-glow));
	}

	/* The signature 2K card silhouette: angular top-right and bottom-right cuts. */
	.card-frame {
		position: absolute;
		inset: 0;
		padding: 14px 12px 12px;
		clip-path: polygon(
			0 0,
			calc(100% - 28px) 0,
			100% 28px,
			100% 100%,
			22px 100%,
			0 calc(100% - 22px)
		);
		background:
			radial-gradient(ellipse 80% 60% at 50% 8%, color-mix(in srgb, var(--tier-glow) 32%, transparent), transparent 65%),
			linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 18%, #0a0e14) 0%, #060a10 65%, #03060a 100%);
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.card-edge {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 28px) 0,
			100% 28px,
			100% 100%,
			22px 100%,
			0 calc(100% - 22px)
		);
		padding: 2px;
		background: var(--tier-gradient);
		pointer-events: none;
	}

	.card-edge::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 60% at 50% 8%, color-mix(in srgb, var(--tier-glow) 60%, transparent), transparent 60%),
			linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 28%, #060a10) 0%, #03060a 100%);
		clip-path: polygon(
			0 0,
			calc(100% - 28px) 0,
			100% 28px,
			100% 100%,
			22px 100%,
			0 calc(100% - 22px)
		);
	}

	.card-holo {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 28px) 0,
			100% 28px,
			100% 100%,
			22px 100%,
			0 calc(100% - 22px)
		);
		background:
			repeating-linear-gradient(
				115deg,
				transparent 0 8px,
				color-mix(in srgb, var(--tier-glow) 4%, transparent) 8px 9px
			),
			repeating-linear-gradient(
				125deg,
				transparent 0 12px,
				color-mix(in srgb, var(--tier-glow) 3%, transparent) 12px 13px
			);
		mix-blend-mode: screen;
		opacity: 0.55;
		pointer-events: none;
	}

	/* --- Top: OVR + position tags --- */
	.card-top {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.15rem;
	}

	.ovr-block { display: flex; flex-direction: column; align-items: flex-start; line-height: 0.78; }

	.ovr-number {
		display: flex;
		font: 800 clamp(2.6rem, 9vw, 3.6rem) / 0.78 var(--display);
		letter-spacing: -0.07em;
		background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--tier-glow) 80%, #fff) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 12px color-mix(in srgb, var(--tier-glow) 60%, transparent);
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.55));
	}

	.ovr-label {
		margin-top: 0.15rem;
		font: 800 0.6rem var(--mono);
		letter-spacing: 0.18em;
		color: color-mix(in srgb, var(--tier-glow) 90%, #fff);
	}

	.meta-stack {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
	}

	.tier-tag, .position-tag {
		padding: 0.18rem 0.45rem;
		font: 800 0.55rem var(--mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--tier-glow) 22%, #060a10);
		color: #fff;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 70%, transparent);
		clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
		text-align: right;
	}

	/* --- Headshot / "player image" zone --- */
	.headshot {
		position: relative;
		z-index: 2;
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 0.4rem 0.1rem 0.2rem;
	}

	.headshot-glow {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 60% 80% at 50% 30%, color-mix(in srgb, var(--tier-glow) 55%, transparent) 0%, transparent 65%),
			radial-gradient(ellipse 100% 30% at 50% 100%, color-mix(in srgb, var(--tier-glow) 35%, transparent) 0%, transparent 70%);
		filter: blur(4px);
		opacity: 0.85;
		pointer-events: none;
	}

	.headshot-portrait {
		position: relative;
		z-index: 1;
		flex: 1 1 auto;
		min-height: 4.5rem;
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.monogram {
		font: 900 clamp(3.2rem, 14vw, 5.5rem) / 0.82 var(--display);
		letter-spacing: -0.08em;
		background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--tier-glow) 100%, #fff 0%) 60%, color-mix(in srgb, var(--tier-glow) 70%, #0a0e14 30%) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 18px color-mix(in srgb, var(--tier-glow) 50%, transparent);
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
		position: relative;
		z-index: 2;
	}

	.monogram-shadow {
		position: absolute;
		inset: auto 0 -10% 0;
		height: 20%;
		background: radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--tier-glow) 50%, transparent) 0%, transparent 70%);
		filter: blur(10px);
		pointer-events: none;
	}

	.team-strip {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.35rem 0.2rem 0.25rem;
		margin-top: 0.35rem;
		background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 25%, transparent) 50%, transparent 100%);
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 60%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--tier-glow) 60%, transparent);
	}

	.team-text {
		font: 900 clamp(0.95rem, 3.4vw, 1.3rem) var(--display);
		letter-spacing: 0.18em;
		color: #fff;
		text-shadow: 0 0 10px color-mix(in srgb, var(--tier-glow) 70%, transparent), 0 1px 0 rgba(0, 0, 0, 0.6);
		text-transform: uppercase;
	}

	/* --- Name block --- */
	.name-block {
		position: relative;
		z-index: 2;
		padding: 0.3rem 0.15rem 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		text-align: center;
	}

	.name-block.solo {
		padding: 0.7rem 0.15rem 0.8rem;
	}

	.first-name {
		font: 900 clamp(1.2rem, 4.6vw, 1.85rem) / 0.9 var(--display);
		letter-spacing: -0.02em;
		color: #fff;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55), 0 0 8px color-mix(in srgb, var(--tier-glow) 40%, transparent);
	}

	.name-block.solo .first-name {
		font-size: clamp(1.6rem, 6vw, 2.4rem);
		letter-spacing: 0.04em;
	}

	.last-name {
		font: 900 clamp(1.4rem, 5.4vw, 2.2rem) / 0.88 var(--display);
		letter-spacing: -0.03em;
		color: #fff;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55), 0 0 10px color-mix(in srgb, var(--tier-glow) 45%, transparent);
	}

	/* --- Tier band (the "UNTOUCHABLE" footer) --- */
	.tier-band {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.5rem 0.3rem;
		margin: 0.1rem -0.2rem -0.1rem;
		background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 30%, #060a10) 100%);
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 70%, transparent);
	}

	.tier-band-glow {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 50%, transparent) 50%, transparent 100%);
		filter: blur(6px);
		opacity: 0.6;
		pointer-events: none;
	}

	.tier-band-text {
		position: relative;
		font: 900 0.95rem var(--display);
		letter-spacing: 0.22em;
		color: #fff;
		text-shadow: 0 0 8px var(--tier-glow), 0 0 14px color-mix(in srgb, var(--tier-glow) 80%, transparent);
	}

	/* --- Stat rails --- */
	.stat-rails {
		position: relative;
		z-index: 2;
		display: grid;
		gap: 0.32rem;
		padding: 0.45rem 0.2rem 0.4rem;
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 35%, transparent);
	}

	.rail-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.18rem;
	}

	.rail-label {
		font: 800 0.55rem var(--mono);
		letter-spacing: 0.12em;
		color: color-mix(in srgb, var(--tier-glow) 80%, #fff);
	}

	.rail-value {
		font: 800 0.7rem var(--mono);
		color: #fff;
		text-shadow: 0 0 6px color-mix(in srgb, var(--tier-glow) 60%, transparent);
	}

	.rail-track {
		position: relative;
		height: 0.32rem;
		background: rgba(0, 0, 0, 0.55);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 35%, transparent);
		border-radius: 2px;
		overflow: hidden;
	}

	.rail-fill {
		position: relative;
		z-index: 1;
		width: var(--pct);
		height: 100%;
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 70%, #060a10) 0%, var(--tier-glow) 100%);
		box-shadow: 0 0 8px color-mix(in srgb, var(--tier-glow) 80%, transparent);
		transition: width 0.4s ease;
	}

	.rail-ticks {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(0, 0, 0, 0.4) calc(10% - 1px) 10%);
		pointer-events: none;
	}

	/* --- Benchmarks strip --- */
	.benchmarks-strip {
		position: relative;
		z-index: 2;
		padding: 0.4rem 0.2rem 0.1rem;
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 35%, transparent);
	}

	.benchmarks-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		border: 0;
		background: transparent;
		color: color-mix(in srgb, var(--tier-glow) 80%, #fff);
		cursor: pointer;
		padding: 0;
		font: 700 0.55rem var(--mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.benchmarks-toggle:hover { color: #fff; }

	.chevron {
		display: inline-block;
		transition: transform 0.15s ease;
		font-size: 0.65rem;
	}

	.chevron.open { transform: rotate(90deg); }

	.benchmarks-list {
		display: grid;
		gap: 0.3rem;
		margin-top: 0.4rem;
	}

	.bench-row {
		display: grid;
		grid-template-columns: 1fr 1.2rem auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.4rem;
		background: rgba(0, 0, 0, 0.45);
		border-radius: 3px;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 25%, transparent);
	}

	.bench-name {
		font: 600 0.58rem var(--mono);
		text-transform: capitalize;
		color: #fff;
	}

	.bench-rail {
		height: 0.22rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 1rem;
		overflow: hidden;
	}

	.bench-rail-fill {
		width: var(--pct);
		height: 100%;
		background: var(--tier-glow);
		box-shadow: 0 0 6px var(--tier-glow);
	}

	.bench-score {
		font: 800 0.65rem var(--mono);
		color: #fff;
		text-shadow: 0 0 4px var(--tier-glow);
	}

	/* --- Diagnostics --- */
	.diagnostics {
		position: relative;
		z-index: 2;
		padding: 0.45rem 0.3rem 0.2rem;
		margin: 0 -0.2rem -0.2rem;
		font: 600 0.58rem var(--mono);
		color: #ffd9a0;
		background: rgba(255, 130, 80, 0.08);
		border-top: 1px solid rgba(255, 130, 80, 0.35);
		letter-spacing: 0.04em;
	}

	/* --- Tier glow variations --- */
	.galaxy-opal { --tier-glow: #ff2bd6; }
	.pink-diamond { --tier-glow: #ff5fa8; }
	.diamond { --tier-glow: #5ce6ff; }
	.amethyst { --tier-glow: #b794ff; }
	.ruby { --tier-glow: #ff5a5a; }
	.sapphire { --tier-glow: #6a8cff; }
	.emerald { --tier-glow: #6affb8; }
	.unranked { --tier-glow: #4a5560; }

	@media (max-width: 600px) {
		.card-2k { max-width: 280px; }
	}
</style>
