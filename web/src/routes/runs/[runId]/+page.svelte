<script lang="ts">
	import FilteredResults from '$lib/FilteredResults.svelte';
	let { data } = $props();
</script>
<svelte:head><title>{data.run.runId} · Runtime Arena</title></svelte:head>
<FilteredResults title={data.run.runId} subtitle="Immutable run" run={data.run} results={data.run.results} />
