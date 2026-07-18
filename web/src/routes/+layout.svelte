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
	:global(html) { color-scheme: dark; background: #0d1115; }
	:global(body) {
		margin: 0;
		background:
			linear-gradient(90deg, rgba(97, 174, 255, 0.035) 1px, transparent 1px) 0 0 / 48px 48px,
			#0d1115;
		color: #e8edf2;
		font-family: "Segoe UI Variable", "Aptos", system-ui, sans-serif;
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
	header { border-bottom: 1px solid #27313a; }
	.brand { display: flex; align-items: center; gap: .8rem; text-decoration: none; font-weight: 680; letter-spacing: -.02em; }
	.mark {
		display: grid; place-items: center; width: 2rem; height: 2rem;
		background: #66b2ff; color: #07111a; font: 800 .7rem ui-monospace, monospace;
		clip-path: polygon(0 0, 100% 0, 100% 72%, 72% 100%, 0 100%);
	}
	nav { display: flex; gap: clamp(.8rem, 2.5vw, 2rem); color: #a8b5c1; font-size: .88rem; }
	nav a { text-decoration: none; }
	nav a:hover, nav a:focus-visible { color: #fff; }
	main { min-height: calc(100vh - 9rem); }
	footer { border-top: 1px solid #27313a; color: #768593; font-size: .78rem; }
	footer code { font-family: "Cascadia Code", ui-monospace, monospace; }
	:global(:focus-visible) { outline: 2px solid #66b2ff; outline-offset: 4px; }
	@media (max-width: 620px) {
		header { align-items: flex-start; gap: 1rem; }
		nav { flex-wrap: wrap; justify-content: flex-end; }
		.brand span:last-child { display: none; }
	}
</style>
