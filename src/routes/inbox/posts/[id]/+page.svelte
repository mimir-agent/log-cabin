<script lang="ts">
	import { resolve } from '$app/paths';
	import PostView from '../../../posts/[id]/PostView.svelte';
	import type { ActionData, PageData } from '../../../posts/[id]/$types';
	import type { LayoutData } from '../../$types';

	// The post page's own load and actions run here (see +page.server.ts), so its types apply.
	const { data, form }: { data: PageData & LayoutData; form: ActionData } = $props();
</script>

<!-- Campsite's split view: the post slides in from the right the first time the pane opens. -->
<div class="pane">
	<PostView {data} {form} closeHref={`${resolve('/inbox')}?tab=${data.tab}`} />
</div>

<style>
	.pane {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	@media (min-width: 64rem) and (prefers-reduced-motion: no-preference) {
		.pane {
			animation: slide-in var(--motion-slow) var(--motion-ease-out);
		}
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			translate: 100% 0;
		}
	}
</style>
