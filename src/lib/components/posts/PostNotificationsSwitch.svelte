<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Comments/CommentListHeader.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
The Notifications switch beside a post's comments heading: on, new comments on the post reach
your inbox. `s` flips it, as in Campsite, unless you're typing.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { typingIn } from '#lib/keyboard.js';
	import { posts } from '#lib/strings/posts.js';

	let { subscribed }: { subscribed: boolean } = $props();

	// What the switch shows until the server's answer reloads the page's data.
	let on = $derived(subscribed);
	let form: HTMLFormElement;

	async function send() {
		// The form's action follows `on`: wait for it to re-render before submitting.
		await tick();
		form.requestSubmit();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 's' || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.defaultPrevented || event.isComposing || typingIn(event.target)) return;
		event.preventDefault();
		on = !on;
		send();
	}
</script>

<svelte:window {onkeydown} />

<form
	bind:this={form}
	method="POST"
	action={on ? '?/subscribe' : '?/unsubscribe'}
	use:enhance={() =>
		({ update }) =>
			update({ reset: false })}
>
	<Switch
		checked={on}
		label={posts.comments.notifications}
		onCheckedChange={(checked) => {
			on = checked;
			send();
		}}
	/>
</form>
