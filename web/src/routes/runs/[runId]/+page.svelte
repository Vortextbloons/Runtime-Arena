<script lang="ts">
	import ResultsExplorer from '$lib/ResultsExplorer.svelte';
	let { data } = $props();
</script>

<ResultsExplorer title="Run results" subtitle="Immutable run" run={data.run} />
