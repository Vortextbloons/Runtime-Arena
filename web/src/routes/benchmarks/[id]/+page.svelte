<script lang="ts">
	import FilteredResults from '$lib/FilteredResults.svelte';
	let { data } = $props();
</script>
<svelte:head><title>{data.id} · Runtime Arena</title></svelte:head>
<FilteredResults title={data.id} subtitle="Benchmark profile" run={data.run} results={data.results} />
