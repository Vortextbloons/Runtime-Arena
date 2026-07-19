<script lang="ts">
	import ResultsExplorer from '$lib/ResultsExplorer.svelte';
	let { data } = $props();
	const language = $derived(data.run.results.find((result) => result.language.id === data.id)?.language);
</script>

<ResultsExplorer title={language?.name ?? data.id} subtitle="Language profile" run={data.run} fixedLanguage={data.id} />
