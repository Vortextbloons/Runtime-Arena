<script lang="ts">
	import ResultsExplorer from '$lib/ResultsExplorer.svelte';
	let { data } = $props();
</script>

<ResultsExplorer title={data.id} subtitle="Benchmark profile" run={data.run} fixedBenchmark={data.id} />
