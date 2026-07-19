<script lang="ts">
	import { resolve } from '$app/paths';
	let { children } = $props();
</script>

<svelte:head>
	<title>Runtime Arena</title>
	<meta name="description" content="Cross-language benchmark results with correctness-first rankings." />
</svelte:head>

<header>
	<a class="brand" href={resolve('/')}>
		<span class="mark" aria-hidden="true">RA</span>
		<span>Runtime Arena</span>
	</a>
	<nav aria-label="Primary">
		<a href={resolve('/')}>Latest</a>
		<a href={resolve('/runs')}>Runs</a>
		<a href={resolve('/compare')}>Compare</a>
		<a href={resolve('/methodology')}>Methodology</a>
	</nav>
</header>

<main>{@render children()}</main>

<footer>
	<span>Correctness before ranking.</span>
	<code>schema 1.0.0</code>
</footer>

<style>
	:global(*) { box-sizing: border-box; }
	:global(:root) {
		--background: #0b1015;
		--panel: #121a21;
		--rule: #26333d;
		--text: #eef3f6;
		--muted: #8c9aa5;
		--accent: #58b7d6;
		--accepted: #6fc89b;
		--warning: #e47d72;
		--display: "Bahnschrift", "Arial Narrow", "Segoe UI", sans-serif;
		--body: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
		--mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
	}
	:global(html) { color-scheme: dark; background: var(--background); }
	:global(body) {
		margin: 0;
		background: var(--background);
		color: var(--text);
		font-family: var(--body);
	}
	:global(a) { color: inherit; }
	header, footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 1440px;
		margin: auto;
		padding: 1.1rem clamp(1rem, 4vw, 4rem);
	}
	header { border-bottom: 1px solid var(--rule); }
	.brand { display: flex; align-items: center; gap: .8rem; text-decoration: none; font-weight: 680; letter-spacing: -.02em; }
	.mark {
		display: grid; place-items: center; width: 2rem; height: 2rem;
		background: var(--accent); color: #071217; font: 800 .7rem var(--mono);
		clip-path: polygon(0 0, 100% 0, 100% 72%, 72% 100%, 0 100%);
	}
	nav { display: flex; gap: clamp(.8rem, 2.5vw, 2rem); color: var(--muted); font-size: .84rem; }
	nav a { text-decoration: none; }
	nav a:hover, nav a:focus-visible { color: #fff; }
	main { min-height: calc(100vh - 9rem); }
	footer { border-top: 1px solid var(--rule); color: var(--muted); font-size: .75rem; }
	footer code { font-family: var(--mono); }
	:global(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
	@media (max-width: 620px) {
		header { align-items: flex-start; gap: 1rem; }
		nav { flex-wrap: wrap; justify-content: flex-end; }
		.brand span:last-child { display: none; }
	}
</style>
