<script lang="ts">
	import { core } from '#lib/strings/core.js';
	import { chat as s } from '#lib/strings/chat.js';
</script>

<svelte:head>
	<title>{s.list.title} · {core.appName}</title>
</svelte:head>

<!-- The list lives in the layout. On a wide screen this is the empty pane beside it; Campsite
     leaves one quiet line there until a conversation is opened. On a phone it isn't shown. -->
<p class="pick">{s.list.pick}</p>

<style>
	.pick {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		min-block-size: 100dvb;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}
</style>
