<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
	const resultsActive = $derived(path === '/' || path.startsWith('/languages') || path.startsWith('/benchmarks'));
	const methodologyActive = $derived(path.startsWith('/methodology'));
</script>

<svelte:head>
	<title>Runtime Arena</title>
	<meta name="description" content="Cross-language benchmark results with correctness-first rankings." />
</svelte:head>

<header>
	<a class="brand" href={resolve('/')}>
		<img class="mark" src="/icon-192x192.png" alt="" width="32" height="32" />
		<span>Runtime Arena</span>
	</a>
	<nav aria-label="Primary">
		<a href={resolve('/')} aria-current={resultsActive ? 'page' : undefined} class:active={resultsActive}>Results</a>
		<a href={resolve('/methodology')} aria-current={methodologyActive ? 'page' : undefined} class:active={methodologyActive}>Methodology</a>
	</nav>
</header>

<main>{@render children()}</main>

<footer>
	<span>Correctness before ranking.</span>
	<span class="footer-meta">Verified measurements</span>
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
	:global(html) { color-scheme: dark; background: var(--background); scroll-behavior: smooth; }
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
		display: block; width: 2rem; height: 2rem; border-radius: 4px;
	}
	nav { display: flex; gap: clamp(.8rem, 2.5vw, 2rem); color: var(--muted); font-size: .84rem; }
	nav a {
		text-decoration: none;
		border-bottom: 1px solid transparent;
		padding-bottom: 0.1rem;
	}
	nav a:hover, nav a:focus-visible { color: #fff; }
	nav a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	main { min-height: calc(100vh - 9rem); }
	footer { border-top: 1px solid var(--rule); color: var(--muted); font-size: .75rem; }
	.footer-meta { font-family: var(--mono); font-size: 0.68rem; }
	:global(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
	@media (max-width: 620px) {
		header { align-items: flex-start; gap: 1rem; }
		nav { flex-wrap: wrap; justify-content: flex-end; }
		.brand span:last-child { display: none; }
	}
</style>
