<script lang="ts">
	import { cardTierLabel, type LanguageCardData } from './cards';
	import { formatBenchmarkLabel, getScoreTier, languageMonogram } from './tiers';
	import type { BenchmarkScore } from './types';

	let {
		score,
		card = undefined,
		expanded = false,
		onexpand
	}: {
		score: BenchmarkScore;
		card?: LanguageCardData;
		expanded?: boolean;
		onexpand?: () => void;
	} = $props();

	let showBenchmarks = $state(false);
	let cardEl: HTMLElement | undefined = $state();
	let tiltX = $state(0);
	let tiltY = $state(0);

	const categories = [
		{ key: 'performance', label: 'SPEED', icon: 'speed' },
		{ key: 'consistency', label: 'STABLE', icon: 'stable' },
		{ key: 'versatility', label: 'FLEX', icon: 'flex' }
	] as const;

	const tierInfo = $derived(getScoreTier(score.overall));
	const versionTag = $derived(score.language.version.split(' ')[0] ?? score.language.id);
	const teamLabel = $derived(card?.buildName ?? formatBenchmarkLabel(score.benchmarkId));
	const cardLetter = $derived(card ? cardTierLabel(card.cardTier) : null);
	const faceAttributes = $derived(card?.attributes.slice(0, 6) ?? []);
	const featuredBadges = $derived.by(() => {
		const current = card;
		if (!current) return [];
		return current.featuredBadgeIds
			.map((id) => current.badges.find((badge) => badge.badgeId === id))
			.filter((badge): badge is NonNullable<typeof badge> => Boolean(badge));
	});
	const expandedBadges = $derived(card && expanded ? card.badges : featuredBadges);
	const nameParts = $derived(score.language.name.split(/\s+/).filter(Boolean));
	const firstName = $derived(nameParts[0] ?? score.language.name);
	const restName = $derived(nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
	const monogram = $derived(languageMonogram(score.language));
	const overallDisplay = $derived(score.overall === null ? '—' : Math.round(score.overall));
	const overallDigits = $derived(String(overallDisplay).padStart(2, '0').split(''));
	const isHighTier = $derived(tierInfo.tierLevel >= 5);
	const ovrCopy = $derived(score.overall === null ? '—' : String(Math.round(score.overall)));
	const issueCount = $derived(score.diagnostics.length);
	const issueLabel = $derived(
		issueCount === 1 ? 'UNVERIFIED · 1 issue' : `UNVERIFIED · ${issueCount} issues`
	);

	function filled(value: number | null): number {
		if (value === null) return 0;
		return Math.max(0, Math.min(10, Math.round(value / 10)));
	}

	function prefersReducedMotion(): boolean {
		return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function onMove(e: MouseEvent) {
		if (!cardEl || prefersReducedMotion()) return;
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

	function badgeTierLabel(tier: string): string {
		return tier.replace(/-/g, ' ').toUpperCase();
	}
</script>

<div
	bind:this={cardEl}
	class="card-2k tier-{tierInfo.class} {isHighTier ? 'high-tier' : ''}"
	class:expanded
	class:card-v1={Boolean(card)}
	onclick={expanded ? undefined : onexpand}
	onmousedown={expanded ? undefined : (e) => e.preventDefault()}
	onkeydown={expanded ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onexpand?.(); } }}
	onmousemove={onMove}
	onmouseleave={onLeave}
	role={expanded ? 'group' : 'button'}
	tabindex={expanded ? undefined : 0}
	style:--tier-gradient={tierInfo.gradient}
	style:--tier-glow={tierInfo.glow}
	style:--tier-level={tierInfo.tierLevel}
	style:--tilt-x={`${tiltX}deg`}
	style:--tilt-y={`${tiltY}deg`}
>
	<div class="card-shard card-shard-tl" aria-hidden="true"></div>
	<div class="card-shard card-shard-br" aria-hidden="true"></div>
	<div class="card-edge"></div>
	<div class="card-pattern"></div>
	<div class="card-shimmer"></div>
	<div class="card-vignette"></div>

	<div class="card-frame">
		<!-- Collectible layer: rating, language identity, art, tier -->
		<header class="card-top">
			<div class="ovr-block">
				<span class="ovr-label">SCORE</span>
				<div class="ovr-number">
					{#each overallDigits as digit, i (i)}
						<span class="ovr-digit" class:dash={digit === '—'}>{digit}</span>
					{/each}
				</div>
			</div>
			<div class="tier-stack">
				<div class="tier-gem" aria-hidden="true">
					<svg viewBox="0 0 24 24">
						<polygon points="12,2 22,9 18,22 6,22 2,9" fill="url(#gem-grad-{tierInfo.class})" />
						<polygon points="12,2 22,9 12,12" fill="rgba(255,255,255,0.45)" />
						<polygon points="2,9 12,12 6,22" fill="rgba(0,0,0,0.35)" />
					</svg>
				</div>
				{#if cardLetter}
					<div class="tier-name" title={`Card tier ${cardLetter}`}>{cardLetter}</div>
					<div class="tier-rank">{tierInfo.tag}</div>
				{:else}
					<div class="tier-name">{tierInfo.sub.toUpperCase()}</div>
					<div class="tier-rank">{tierInfo.tag}</div>
				{/if}
			</div>
		</header>

		<div class="art-stage">
			<div class="art-grid" aria-hidden="true"></div>
			<div class="art-particles" aria-hidden="true">
				<span class="particle p1" style:--delay="0s">{`{`}</span>
				<span class="particle p2" style:--delay="0.6s">{`<`}</span>
				<span class="particle p3" style:--delay="1.2s">{`/>`}</span>
				<span class="particle p4" style:--delay="1.8s">{`}`}</span>
				<span class="particle p5" style:--delay="2.4s">{`;`}</span>
				<span class="particle p6" style:--delay="3.0s">{`()`}</span>
			</div>
			<div class="art-emblem">
				<div class="emblem-halo"></div>
				<span class="monogram">{monogram}</span>
				<div class="emblem-floor"></div>
			</div>
		</div>

		<div class="identity">
			<div class="lang-name">
				<span class="lang-first">{firstName.toUpperCase()}</span>
				{#if restName}
					<span class="lang-rest">{restName.toUpperCase()}</span>
				{/if}
			</div>
			<div class="archetype">
				<span class="archetype-marker" aria-hidden="true"></span>
				<span class="archetype-text">{teamLabel}</span>
				<span class="archetype-marker" aria-hidden="true"></span>
			</div>
			{#if card?.displayClassifications?.length}
				<div class="class-chips" aria-label="Classifications">
					{#each card.displayClassifications as chip (chip)}
						<span class="class-chip">{chip}</span>
					{/each}
				</div>
			{/if}
		</div>

		<div class="tier-band">
			<span class="tier-band-shine" aria-hidden="true"></span>
			<span class="tier-band-text">{tierInfo.name}</span>
			<span class="tier-band-rivets" aria-hidden="true">
				<span></span><span></span>
			</span>
		</div>

		<!-- Benchmark layer: attributes, runtime, expandable details -->
		{#if card}
			<div class="attribute-grid attribute-grid-v1">
				{#each faceAttributes as attribute (attribute.id)}
					{@const value = attribute.rating}
					{@const segs = filled(value)}
					<div class="attribute" data-stat={attribute.abbreviation.toLowerCase()} class:unavailable={!attribute.available}>
						<div class="attribute-head">
							<span class="attribute-label">{attribute.abbreviation}</span>
							<span class="attribute-value">{value === null ? '—' : Math.round(value)}</span>
						</div>
						<div
							class="attribute-bar"
							role="meter"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={value ?? 0}
							aria-label={`${attribute.label} ${value === null ? 'unavailable' : Math.round(value)}`}
						>
							{#each Array(10) as _, i (i)}
								<span class="seg" class:on={i < segs}></span>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="takeover-block">
				<span class="takeover-label">Primary takeover</span>
				<strong class="takeover-value">{card.takeover.primary}</strong>
			</div>

			{#if expandedBadges.length}
				<ul class="badge-list" aria-label={expanded ? 'All badges' : 'Featured badges'}>
					{#each expandedBadges as badge (badge.badgeId)}
						<li class="badge-row tier-{badge.tier}">
							<span class="badge-name">{badge.name}</span>
							<span class="badge-tier">{badgeTierLabel(badge.tier)}</span>
							{#if expanded}
								<p class="badge-reason">{badge.reason}</p>
								{#if badge.nextTier}
									<p class="badge-next">
										Next {badgeTierLabel(badge.nextTier.tier)}:
										{badge.nextTier.requirements.join('; ')}
									</p>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if card.featuredDivisionRank}
				<p class="division-rank">
					#{card.featuredDivisionRank.rank}
					{card.featuredDivisionRank.divisionName.toUpperCase()} DIVISION
					<span class="division-field">of {card.featuredDivisionRank.fieldSize}</span>
				</p>
			{/if}
		{:else}
			<div class="attribute-grid">
				{#each categories as cat (cat.key)}
					{@const value = score[cat.key]}
					{@const segs = filled(value)}
					<div class="attribute" data-stat={cat.key}>
						<div class="attribute-head">
							<span class="attribute-icon" aria-hidden="true">
								{#if cat.icon === 'speed'}
									<svg viewBox="0 0 16 16"><path d="M9 1 L3 9 L7 9 L6 15 L13 6 L9 6 Z" fill="currentColor" /></svg>
								{:else if cat.icon === 'stable'}
									<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4" /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>
								{:else if cat.icon === 'flex'}
									<svg viewBox="0 0 16 16"><path d="M3 12 L5 7 L8 9 L13 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /><circle cx="3" cy="12" r="1.4" fill="currentColor" /><circle cx="13" cy="3" r="1.4" fill="currentColor" /></svg>
								{:else}
									<svg viewBox="0 0 16 16"><path d="M2 13 L6 7 L9 10 L14 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /><path d="M10 2 L14 2 L14 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
								{/if}
							</span>
							<span class="attribute-label">{cat.label}</span>
							<span class="attribute-value">{value === null ? '—' : Math.round(value)}</span>
						</div>
						<div class="attribute-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={value ?? 0} aria-label={`${cat.label} ${value === null ? 'unavailable' : Math.round(value)}`}>
							{#each Array(10) as _, i (i)}
								<span class="seg" class:on={i < segs}></span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

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
								<span class="bench-name">{formatBenchmarkLabel(bench.benchmarkId)}</span>
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

		<footer class="card-foot">
			<span class="runtime-info">
				<span class="runtime-glyph" aria-hidden="true">⌬</span>
				<span class="runtime-text">{score.language.id} · {versionTag}</span>
			</span>
			<span class="ovr-mini" aria-label="Weighted overall score">{ovrCopy}</span>
		</footer>

		{#if issueCount}
			<div class="diagnostics" class:coverage={score.eligible}>
				<div class="diagnostics-head">
					{#if score.eligible}
						PARTIAL · {issueCount === 1 ? '1 note' : `${issueCount} notes`}
					{:else}
						{issueLabel}
					{/if}
				</div>
				{#if expanded}
					<ul class="diagnostics-list">
						{#each score.diagnostics as diagnostic, diagnosticIndex (`${diagnosticIndex}-${diagnostic}`)}
							<li>{diagnostic}</li>
						{/each}
					</ul>
				{:else}
					<p class="diagnostics-preview">{score.diagnostics[0]}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* --- Outer wrapper: 3D tilt + hover lift --- */
	.card-2k {
		--tier-gradient: linear-gradient(135deg, #4a5560 0%, #2a323a 50%, #0e141a 100%);
		--tier-glow: #4a5560;
		--tier-level: 0;
		--tilt-x: 0deg;
		--tilt-y: 0deg;
		position: relative;
		display: block;
		width: 100%;
		max-width: 320px;
		margin: 0 auto;
		color: #fff;
		font-family: var(--body);
		cursor: pointer;
		transform-style: preserve-3d;
		transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
		transition: transform 0.18s ease, filter 0.2s ease;
		filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
		text-align: left;
		isolation: isolate;
	}

	/* Legacy three-meter cards keep the collectible silhouette. */
	.card-2k:not(.card-v1) {
		aspect-ratio: 5 / 8.2;
	}

	.card-2k:hover {
		filter: drop-shadow(0 18px 36px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 18px var(--tier-glow));
	}

	.card-2k.expanded {
		cursor: default;
		max-width: 340px;
		transform: none;
	}

	.card-2k.expanded:hover {
		transform: none;
	}

	/* --- Aggressive silhouette: large top-right, smaller bottom-left, plus tier-driven extensions --- */
	.card-edge {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
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
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
		);
	}

	.card-frame {
		position: absolute;
		inset: 0;
		padding: 14px 12px 12px;
		clip-path: polygon(
			0 0,
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
		);
		background:
			radial-gradient(ellipse 80% 60% at 50% 8%, color-mix(in srgb, var(--tier-glow) 32%, transparent), transparent 65%),
			linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 18%, #0a0e14) 0%, #060a10 65%, #03060a 100%);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	/* V1 cards grow with content; absolute frame would collapse without aspect-ratio. */
	.card-2k.card-v1 .card-frame {
		position: relative;
		inset: auto;
	}

	.card-2k.card-v1 .art-stage {
		flex: 0 0 auto;
		min-height: 4.5rem;
		padding: 0.35rem 0.1rem 0.2rem;
	}

	.card-2k.card-v1 .monogram {
		font-size: clamp(2.6rem, 10vw, 4.2rem);
	}

	/* Shards: small angular extensions on top-left and bottom-right corners */
	.card-shard {
		position: absolute;
		width: 14px;
		height: 14px;
		background: var(--tier-gradient);
		clip-path: polygon(0 0, 100% 0, 0 100%);
		pointer-events: none;
		filter: drop-shadow(0 0 6px color-mix(in srgb, var(--tier-glow) 60%, transparent));
	}
	.card-shard-tl { top: -2px; left: -2px; }
	.card-shard-br {
		bottom: -2px;
		right: -2px;
		transform: rotate(180deg);
		opacity: 0.85;
	}

	/* Subtle pattern: diagonal scanlines + grid */
	.card-pattern {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
		);
		background:
			repeating-linear-gradient(
				115deg,
				transparent 0 9px,
				color-mix(in srgb, var(--tier-glow) 4%, transparent) 9px 10px
			),
			repeating-linear-gradient(
				90deg,
				transparent 0 24px,
				color-mix(in srgb, var(--tier-glow) 3%, transparent) 24px 25px
			);
		mix-blend-mode: screen;
		opacity: 0.7;
		pointer-events: none;
	}

	/* Holographic shimmer, intensity scales with tier level */
	.card-shimmer {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
		);
		background:
			linear-gradient(
				115deg,
				transparent calc(30% - 12% * var(--tier-level) / 7),
				color-mix(in srgb, var(--tier-glow) calc(8% + 5% * var(--tier-level) / 7), transparent) 50%,
				transparent calc(70% + 12% * var(--tier-level) / 7)
			);
		mix-blend-mode: screen;
		opacity: calc(0.25 + 0.55 * var(--tier-level) / 7);
		pointer-events: none;
	}

	.card-vignette {
		position: absolute;
		inset: 0;
		clip-path: polygon(
			0 0,
			calc(100% - 34px) 0,
			100% 34px,
			100% 100%,
			24px 100%,
			0 calc(100% - 24px)
		);
		background:
			radial-gradient(ellipse 100% 80% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.45) 100%);
		pointer-events: none;
	}

	/* --- Tier glow palette --- */
	.galaxy-opal { --tier-glow: #ff2bd6; }
	.pink-diamond { --tier-glow: #ff5fa8; }
	.diamond { --tier-glow: #5ce6ff; }
	.amethyst { --tier-glow: #b794ff; }
	.ruby { --tier-glow: #ff5a5a; }
	.sapphire { --tier-glow: #6a8cff; }
	.emerald { --tier-glow: #6affb8; }
	.unranked { --tier-glow: #4a5560; }

	/* --- Top: OVR + tier gem + tier name --- */
	.card-top {
		position: relative;
		z-index: 3;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.15rem;
	}

	.ovr-block { display: flex; flex-direction: column; align-items: flex-start; line-height: 0.78; }

	.ovr-label {
		font: 800 0.58rem var(--mono);
		letter-spacing: 0.22em;
		color: color-mix(in srgb, var(--tier-glow) 90%, #fff);
		text-shadow: 0 0 8px color-mix(in srgb, var(--tier-glow) 50%, transparent);
	}

	.ovr-number {
		display: flex;
		font: 900 clamp(2.6rem, 9vw, 3.7rem) / 0.78 var(--display);
		letter-spacing: -0.07em;
		background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--tier-glow) 80%, #fff) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 12px color-mix(in srgb, var(--tier-glow) 60%, transparent);
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.55));
	}

	.ovr-digit {
		min-width: 0.55em;
		display: inline-block;
	}
	.ovr-digit.dash { color: color-mix(in srgb, var(--tier-glow) 60%, #fff); }

	.tier-stack {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.tier-gem {
		width: 26px;
		height: 26px;
		filter: drop-shadow(0 0 8px color-mix(in srgb, var(--tier-glow) 70%, transparent));
	}
	.tier-gem svg { width: 100%; height: 100%; }

	.tier-name {
		font: 900 0.78rem var(--display);
		letter-spacing: 0.18em;
		color: #fff;
		text-shadow: 0 0 8px color-mix(in srgb, var(--tier-glow) 70%, transparent);
	}

	.tier-rank {
		padding: 0.1rem 0.4rem;
		font: 800 0.5rem var(--mono);
		letter-spacing: 0.16em;
		color: #fff;
		background: color-mix(in srgb, var(--tier-glow) 30%, #060a10);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 70%, transparent);
		clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
	}

	/* --- Art stage: dimensional monogram with subtle code-particle background --- */
	.art-stage {
		position: relative;
		z-index: 2;
		flex: 1 1 auto;
		min-height: 6.5rem;
		display: grid;
		place-items: center;
		overflow: hidden;
		padding: 0.6rem 0.1rem 0.4rem;
		isolation: isolate;
	}

	.art-grid {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 22%, transparent) 0%, transparent 35%, transparent 70%, color-mix(in srgb, var(--tier-glow) 18%, transparent) 100%),
			repeating-linear-gradient(
				0deg,
				transparent 0 16px,
				color-mix(in srgb, var(--tier-glow) 6%, transparent) 16px 17px
			),
			repeating-linear-gradient(
				90deg,
				transparent 0 16px,
				color-mix(in srgb, var(--tier-glow) 6%, transparent) 16px 17px
			);
		opacity: 0.55;
		pointer-events: none;
		mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, #000 25%, transparent 85%);
		-webkit-mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, #000 25%, transparent 85%);
	}

	.art-particles {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.particle {
		position: absolute;
		font: 700 0.7rem var(--mono);
		color: color-mix(in srgb, var(--tier-glow) 60%, #fff);
		opacity: 0;
		animation: float 7s linear infinite;
		animation-delay: var(--delay);
		text-shadow: 0 0 6px color-mix(in srgb, var(--tier-glow) 60%, transparent);
		letter-spacing: 0.05em;
	}

	.particle.p1 { left: 8%;  top: 20%; }
	.particle.p2 { left: 18%; top: 78%; animation-duration: 8s; }
	.particle.p3 { left: 82%; top: 22%; animation-duration: 6.5s; }
	.particle.p4 { left: 90%; top: 72%; animation-duration: 7.5s; }
	.particle.p5 { left: 6%;  top: 55%; animation-duration: 9s; }
	.particle.p6 { left: 92%; top: 50%; animation-duration: 6.8s; }

	@keyframes float {
		0%   { transform: translateY(6px) scale(0.85); opacity: 0; }
		15%  { opacity: 0.55; }
		85%  { opacity: 0.35; }
		100% { transform: translateY(-30px) scale(1.1); opacity: 0; }
	}

	.art-emblem {
		position: relative;
		width: 100%;
		display: grid;
		place-items: center;
		padding: 0 0.5rem;
	}

	.emblem-halo {
		position: absolute;
		inset: -25% -10%;
		background:
			radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--tier-glow) 65%, transparent) 0%, transparent 55%),
			radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--tier-glow) 35%, transparent) 0%, transparent 70%);
		filter: blur(8px);
		pointer-events: none;
	}

	.emblem-floor {
		position: absolute;
		left: 15%;
		right: 15%;
		bottom: -10%;
		height: 16%;
		background: radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--tier-glow) 45%, transparent) 0%, transparent 70%);
		filter: blur(8px);
		pointer-events: none;
	}

	.monogram {
		position: relative;
		z-index: 1;
		font: 900 clamp(3.4rem, 12vw, 5.6rem) / 0.85 var(--display);
		letter-spacing: -0.04em;
		background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--tier-glow) 100%, #fff 0%) 50%, color-mix(in srgb, var(--tier-glow) 80%, #0a0e14 20%) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 28px color-mix(in srgb, var(--tier-glow) 55%, transparent);
		filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.6));
	}

	/* --- Identity: language name + archetype --- */
	.identity {
		position: relative;
		z-index: 2;
		padding: 0.2rem 0.15rem 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: center;
	}

	.lang-name {
		display: flex;
		flex-direction: column;
		gap: 0;
		line-height: 0.9;
	}

	.lang-first {
		font: 900 clamp(1.4rem, 5.2vw, 2.1rem) / 0.88 var(--display);
		letter-spacing: -0.015em;
		color: #fff;
		text-shadow:
			0 2px 0 rgba(0, 0, 0, 0.6),
			0 0 14px color-mix(in srgb, var(--tier-glow) 50%, transparent);
	}

	.lang-rest {
		font: 800 clamp(0.8rem, 2.8vw, 1rem) / 1 var(--display);
		letter-spacing: 0.12em;
		color: color-mix(in srgb, var(--tier-glow) 70%, #fff);
		text-shadow: 0 0 8px color-mix(in srgb, var(--tier-glow) 40%, transparent);
		text-transform: uppercase;
	}

	.archetype {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font: 800 0.58rem var(--mono);
		letter-spacing: 0.22em;
		color: color-mix(in srgb, var(--tier-glow) 80%, #fff);
		text-transform: uppercase;
	}

	.archetype-marker {
		flex: 0 0 18px;
		height: 1px;
		background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 70%, transparent) 100%);
	}
	.archetype-marker:last-child {
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 70%, transparent) 0%, transparent 100%);
	}

	/* --- Tier band --- */
	.tier-band {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.3rem;
		margin: 0.05rem -0.2rem 0;
		background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 30%, #060a10) 100%);
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 70%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--tier-glow) 25%, transparent);
		isolation: isolate;
	}

	.tier-band-shine {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--tier-glow) 50%, transparent) 50%, transparent 100%);
		filter: blur(6px);
		opacity: 0.7;
		pointer-events: none;
	}

	.tier-band-text {
		position: relative;
		font: 900 0.92rem var(--display);
		letter-spacing: 0.28em;
		color: #fff;
		text-shadow: 0 0 8px var(--tier-glow), 0 0 16px color-mix(in srgb, var(--tier-glow) 80%, transparent);
	}

	.tier-band-rivets {
		display: flex;
		gap: 4px;
		position: relative;
	}
	.tier-band-rivets span {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, #fff, color-mix(in srgb, var(--tier-glow) 60%, #0a0e14));
		box-shadow: 0 0 4px color-mix(in srgb, var(--tier-glow) 70%, transparent);
	}

	/* --- Attribute badges: speed / stability / scale --- */
	.attribute-grid {
		position: relative;
		z-index: 2;
		display: grid;
		gap: 0.32rem;
		padding: 0.4rem 0.2rem 0.35rem;
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 30%, transparent);
	}

	.attribute-grid-v1 {
		grid-template-columns: 1fr 1fr;
		gap: 0.28rem;
	}

	.attribute.unavailable {
		opacity: 0.55;
	}

	.class-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem;
		margin-top: 0.15rem;
	}

	.class-chip {
		font: 700 0.52rem var(--mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--tier-glow) 75%, #fff);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 45%, transparent);
		padding: 0.18rem 0.4rem;
		background: rgba(0, 0, 0, 0.35);
	}

	.takeover-block {
		display: grid;
		gap: 0.12rem;
		padding: 0.35rem 0.45rem;
		margin: 0 0.15rem 0.25rem;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 35%, transparent);
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 12%, rgba(0, 0, 0, 0.45)), rgba(0, 0, 0, 0.3));
	}

	.takeover-label {
		font: 700 0.5rem var(--mono);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--tier-glow) 70%, #fff);
	}

	.takeover-value {
		font: 800 0.72rem / 1.1 var(--display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
	}

	.badge-list {
		list-style: none;
		margin: 0 0.15rem 0.3rem;
		padding: 0;
		display: grid;
		gap: 0.22rem;
	}

	.badge-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.1rem 0.5rem;
		padding: 0.28rem 0.4rem;
		border: 1px solid color-mix(in srgb, var(--tier-glow) 30%, transparent);
		background: rgba(0, 0, 0, 0.35);
		font: 700 0.55rem var(--mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
	}

	.badge-tier {
		color: color-mix(in srgb, var(--tier-glow) 85%, #fff);
	}

	.badge-row.tier-legend .badge-tier { color: #f6e27a; }
	.badge-row.tier-hall-of-fame .badge-tier { color: #d7b4ff; }
	.badge-row.tier-gold .badge-tier { color: #f0c14b; }
	.badge-row.tier-silver .badge-tier { color: #d0d7de; }
	.badge-row.tier-bronze .badge-tier { color: #c48a5a; }

	.badge-reason,
	.badge-next {
		grid-column: 1 / -1;
		margin: 0;
		font: 500 0.58rem / 1.35 var(--mono);
		letter-spacing: 0.02em;
		text-transform: none;
		color: rgba(255, 255, 255, 0.72);
	}

	.badge-next {
		color: color-mix(in srgb, var(--tier-glow) 70%, #fff);
	}

	.division-rank {
		margin: 0 0.2rem 0.35rem;
		text-align: center;
		font: 800 0.58rem var(--mono);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--tier-glow) 80%, #fff);
	}

	.division-field {
		display: block;
		margin-top: 0.1rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		opacity: 0.75;
	}

	.attribute {
		display: grid;
		gap: 0.18rem;
		padding: 0.32rem 0.4rem 0.3rem;
		background: linear-gradient(90deg, color-mix(in srgb, var(--tier-glow) 8%, rgba(0, 0, 0, 0.4)) 0%, rgba(0, 0, 0, 0.3) 100%);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 30%, transparent);
		clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
	}

	.attribute-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.attribute-icon {
		display: grid;
		place-items: center;
		width: 14px;
		height: 14px;
		color: var(--tier-glow);
		filter: drop-shadow(0 0 4px color-mix(in srgb, var(--tier-glow) 70%, transparent));
	}
	.attribute-icon svg { width: 100%; height: 100%; }

	.attribute-label {
		flex: 1 1 auto;
		font: 800 0.55rem var(--mono);
		letter-spacing: 0.16em;
		color: #fff;
		text-shadow: 0 0 6px color-mix(in srgb, var(--tier-glow) 50%, transparent);
	}

	.attribute-value {
		min-width: 1.6rem;
		text-align: right;
		font: 900 0.85rem / 1 var(--mono);
		font-variant-numeric: tabular-nums;
		color: #fff;
		text-shadow: 0 0 8px color-mix(in srgb, var(--tier-glow) 70%, transparent);
		letter-spacing: 0;
	}

	.attribute-bar {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 2px;
		padding: 1px;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 25%, transparent);
		clip-path: polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%);
	}

	.seg {
		height: 6px;
		background: rgba(255, 255, 255, 0.06);
	}

	.seg.on {
		background: linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 90%, #fff) 0%, var(--tier-glow) 100%);
		box-shadow: 0 0 4px color-mix(in srgb, var(--tier-glow) 80%, transparent);
	}

	/* --- Benchmarks strip --- */
	.benchmarks-strip {
		position: relative;
		z-index: 2;
		padding: 0.35rem 0.2rem 0.1rem;
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 30%, transparent);
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

	/* --- Footer: runtime / compiler, no longer debug-looking --- */
	.card-foot {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.3rem 0.35rem;
		margin: 0.05rem -0.2rem -0.15rem;
		background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.55) 100%);
		border-top: 1px solid color-mix(in srgb, var(--tier-glow) 25%, transparent);
	}

	.runtime-info {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font: 700 0.55rem var(--mono);
		letter-spacing: 0.08em;
		color: color-mix(in srgb, var(--tier-glow) 70%, #fff);
		text-transform: uppercase;
	}

	.runtime-glyph {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		font-size: 0.85rem;
		color: var(--tier-glow);
		filter: drop-shadow(0 0 4px color-mix(in srgb, var(--tier-glow) 70%, transparent));
	}

	.runtime-text {
		opacity: 0.85;
	}

	.ovr-mini {
		padding: 0.18rem 0.5rem;
		font: 900 0.7rem var(--display);
		letter-spacing: 0.05em;
		color: #fff;
		background: color-mix(in srgb, var(--tier-glow) 30%, #060a10);
		border: 1px solid color-mix(in srgb, var(--tier-glow) 60%, transparent);
		clip-path: polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%);
	}

	/* --- Diagnostics (only when not eligible) --- */
	.diagnostics {
		position: relative;
		z-index: 2;
		padding: 0.4rem 0.3rem 0.35rem;
		margin: 0 -0.2rem -0.2rem;
		font: 600 0.55rem var(--mono);
		color: #ffd9a0;
		background: rgba(255, 130, 80, 0.08);
		border-top: 1px solid rgba(255, 130, 80, 0.35);
		letter-spacing: 0.04em;
	}

	.diagnostics.coverage {
		color: color-mix(in srgb, var(--tier-glow) 70%, #c8d0d8);
		background: color-mix(in srgb, var(--tier-glow) 8%, rgba(0, 0, 0, 0.35));
		border-top-color: color-mix(in srgb, var(--tier-glow) 35%, transparent);
	}

	.diagnostics-preview {
		margin: 0;
		opacity: 0.9;
		line-height: 1.35;
	}

	.diagnostics-list {
		margin: 0.2rem 0 0;
		padding-left: 1rem;
		display: grid;
		gap: 0.2rem;
		line-height: 1.35;
	}

	/* High-tier cards get a stronger gem and a faint top-light */
	.high-tier .card-frame {
		background:
			radial-gradient(ellipse 80% 60% at 50% 4%, color-mix(in srgb, var(--tier-glow) 50%, transparent), transparent 65%),
			linear-gradient(180deg, color-mix(in srgb, var(--tier-glow) 28%, #0a0e14) 0%, #060a10 60%, #03060a 100%);
	}

	@media (max-width: 600px) {
		.card-2k { max-width: 280px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.card-2k,
		.card-shimmer,
		.shimmer,
		.particle {
			animation: none !important;
			transition: none !important;
			transform: none !important;
		}

		.card-2k:hover {
			filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
		}
	}
</style>
