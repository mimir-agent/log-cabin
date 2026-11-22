<!--
@component
"Message" for a person, as on Campsite's profile and hover card: opens your DM with them,
starting it the first time. Show it only where `canMessage` said yes.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import { chat } from '#lib/strings/chat.js';

	let { userId, size }: { userId: string; size?: 'sm' } = $props();
</script>

<form method="POST" action="{resolve('/chat/new')}?/dm">
	<input type="hidden" name="person" value={userId} />
	<Button type="submit" {size}>{chat.start.message}</Button>
</form>

<style>
	form {
		display: contents;
	}
</style>
