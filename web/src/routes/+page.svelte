<script lang="ts">
	import type { ArenaResult } from '$lib/types';
	let { data } = $props();
	let benchmark = $state('all');
	let sort = $state<'time' | 'language'>('time');
	const benchmarks = $derived(data.run ? [...new Set(data.run.results.map((r: ArenaResult) => r.benchmark.id))] : []);
	const visible = $derived.by(() => {
		if (!data.run) return [];
		const rows = data.run.results.filter((r: ArenaResult) => benchmark === 'all' || r.benchmark.id === benchmark);
		return rows.toSorted((a: ArenaResult, b: ArenaResult) =>
			sort === 'time'
				? a.execution.summary.medianWallTimeNanoseconds - b.execution.summary.medianWallTimeNanoseconds
				: a.language.name.localeCompare(b.language.name)
		);
	});
	const maximum = $derived(Math.max(1, ...visible.map((r: ArenaResult) => r.execution.summary.medianWallTimeNanoseconds)));
	const accepted = $derived(visible.filter((r: ArenaResult) => r.checker.status === 'accepted').length);
	const formatTime = (ns: number) => ns < 1e6 ? `${(ns / 1e3).toFixed(1)} μs` : ns < 1e9 ? `${(ns / 1e6).toFixed(2)} ms` : `${(ns / 1e9).toFixed(3)} s`;
</script>

<section class="hero">
	<div>
		<p class="eyebrow">Latest verified run</p>
		<h1>Every runtime<br /><span>on the same clock.</span></h1>
	</div>
	{#if data.run}
		<div class="run-stamp">
			<span>RUN</span>
			<strong>{data.run.runId}</strong>
			<small>{new Date(data.run.createdAt).toLocaleString()}</small>
		</div>
	{/if}
</section>

{#if data.run}
	<section class="instrument">
		<div class="controls">
			<label>Workload
				<select bind:value={benchmark}>
					<option value="all">All benchmarks</option>
					{#each benchmarks as item (item)}<option value={item}>{item}</option>{/each}
				</select>
			</label>
			<label>Order
				<select bind:value={sort}>
					<option value="time">Fastest first</option>
					<option value="language">Language</option>
				</select>
			</label>
			<p><strong>{accepted}/{visible.length}</strong> accepted</p>
		</div>

		<div class="rail-header"><span>Implementation</span><span>Median / sample distribution</span><span>Result</span></div>
		<div class="rails">
			{#each visible as result (`${result.benchmark.id}-${result.benchmark.size}-${result.language.id}`)}
				{@const median = result.execution.summary.medianWallTimeNanoseconds}
				<article class:invalid={result.checker.status !== 'accepted'}>
					<div class="identity">
						<strong>{result.language.name}</strong>
						<span>{result.benchmark.id} · {result.benchmark.size}</span>
					</div>
					<div class="track" aria-label={`${result.language.name} median ${formatTime(median)}`}>
						<div class="bar" style:--width={`${Math.max(2, median / maximum * 100)}%`}></div>
						{#each result.execution.samples as sample (sample.iteration)}
							<i style:--position={`${sample.wallTimeNanoseconds / maximum * 100}%`}></i>
						{/each}
					</div>
					<div class="reading">
						<strong>{formatTime(median)}</strong>
						<span class:ok={result.checker.status === 'accepted'}>{result.checker.status}</span>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="machine">
		<p class="eyebrow">Test bench</p>
		<h2>{data.run.environment.cpu.model.trim()}</h2>
		<dl>
			<div><dt>Logical cores</dt><dd>{data.run.environment.cpu.logicalCores}</dd></div>
			<div><dt>Memory</dt><dd>{(data.run.environment.memoryBytes / 2**30).toFixed(1)} GiB</dd></div>
			<div><dt>System</dt><dd>{data.run.environment.operatingSystem.platform} {data.run.environment.operatingSystem.release}</dd></div>
			<div><dt>Revision</dt><dd><code>{data.run.gitCommit?.slice(0, 10) ?? 'unknown'}</code></dd></div>
		</dl>
	</section>
{:else}
	<section class="empty">
		<p>{data.message}</p>
		<code>npm run arena -- run</code>
	</section>
{/if}

<style>
	.hero, .instrument, .machine, .empty { max-width: 1440px; margin: auto; padding-inline: clamp(1rem, 4vw, 4rem); }
	.hero { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 2rem; padding-block: clamp(4rem, 10vw, 9rem) 3rem; }
	.eyebrow { color: #66b2ff; font: 700 .72rem "Cascadia Code", ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; }
	h1 { margin: .7rem 0 0; font-size: clamp(3.2rem, 8vw, 8.5rem); line-height: .82; letter-spacing: -.075em; font-weight: 720; }
	h1 span { color: #738291; }
	.run-stamp { display: grid; justify-items: end; border-right: 3px solid #66b2ff; padding-right: 1rem; font-family: "Cascadia Code", monospace; }
	.run-stamp span, .run-stamp small { color: #768593; font-size: .68rem; }
	.run-stamp strong { font-size: .9rem; margin: .25rem 0; }
	.instrument { padding-bottom: 5rem; }
	.controls { display: flex; align-items: end; gap: 2rem; padding: 1rem 0; border-block: 1px solid #27313a; }
	label { display: grid; gap: .4rem; color: #768593; font: .68rem "Cascadia Code", monospace; text-transform: uppercase; letter-spacing: .08em; }
	select { min-width: 12rem; border: 0; border-bottom: 1px solid #52616f; border-radius: 0; background: transparent; color: #e8edf2; padding: .45rem 1.5rem .45rem 0; font: 500 .9rem inherit; }
	select option { background: #151b21; }
	.controls p { margin-left: auto; color: #8d9aa6; }
	.controls p strong { color: #e8edf2; }
	.rail-header, article { display: grid; grid-template-columns: minmax(10rem, 1fr) minmax(14rem, 3fr) minmax(9rem, .8fr); gap: 2rem; align-items: center; }
	.rail-header { padding: 1.5rem 0 .6rem; color: #647380; font: .65rem "Cascadia Code", monospace; text-transform: uppercase; letter-spacing: .09em; }
	article { min-height: 5.5rem; border-top: 1px solid #202a32; }
	.identity, .reading { display: grid; gap: .25rem; }
	.identity span, .reading span { color: #738291; font-size: .72rem; }
	.track { position: relative; height: 1.2rem; background: #151d24; overflow: visible; }
	.bar { width: var(--width); height: 100%; background: linear-gradient(90deg, #277dcc, #66b2ff); transition: width .45s cubic-bezier(.2,.8,.2,1); }
	.track i { position: absolute; left: var(--position); top: -.3rem; height: 1.8rem; width: 1px; background: #dbeeff; opacity: .65; }
	.reading { justify-items: end; font-family: "Cascadia Code", monospace; }
	.reading .ok { color: #7bd6ad; }
	article.invalid { opacity: .5; }
	.machine { display: grid; grid-template-columns: .5fr 1.5fr; gap: 2rem; padding-block: 3rem 5rem; border-top: 1px solid #27313a; }
	.machine h2 { margin: 0; font-size: clamp(1.5rem, 3vw, 3rem); letter-spacing: -.04em; }
	dl { grid-column: 2; display: grid; grid-template-columns: repeat(4, 1fr); margin: 1rem 0 0; }
	dl div { padding: 1rem; border-left: 1px solid #27313a; }
	dt { color: #738291; font-size: .7rem; } dd { margin: .4rem 0 0; font-weight: 650; }
	.empty { padding-block: 8rem; text-align: center; color: #8d9aa6; }
	.empty code { display: inline-block; margin-top: 1rem; color: #e8edf2; background: #151d24; padding: .8rem 1rem; }
	@media (max-width: 760px) {
		.hero { grid-template-columns: 1fr; }
		.run-stamp { justify-items: start; border-left: 3px solid #66b2ff; border-right: 0; padding-left: 1rem; }
		.controls { align-items: stretch; flex-direction: column; gap: 1rem; }
		.controls p { margin: 0; }
		.rail-header { display: none; }
		article { grid-template-columns: 1fr auto; gap: 1rem; padding-block: 1rem; }
		.track { grid-column: 1 / -1; grid-row: 2; }
		.machine { grid-template-columns: 1fr; }
		dl { grid-column: 1; grid-template-columns: 1fr 1fr; }
	}
	@media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
