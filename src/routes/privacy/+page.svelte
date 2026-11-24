<script lang="ts">
	import LegalPage from '#lib/components/shell/LegalPage.svelte';
	import { legal } from '#lib/strings/legal.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<LegalPage document={legal.privacy(data.operator)} />
