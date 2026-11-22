<!--
  Mark done in a page's header, when the inbox holds something about the page: the inbox's
  Archive, from the page itself. Opening the page has already read those notifications.
-->
<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { notifications } from '#lib/strings/notifications.js';

	type Props = {
		/** The page, as the inbox knows it: "/posts/p1". */
		path: string;
	};

	let { path }: Props = $props();

	// The form posts to /inbox from wherever the page is, and the page stays put.
	const stay: SubmitFunction =
		() =>
		({ update }) =>
			update({ navigate: false });
</script>

<form method="POST" action="/inbox?/doneAbout" use:enhance={stay}>
	<input type="hidden" name="path" value={path} />
	<Button type="submit" variant="ghost" aria-label={notifications.inbox.markDone}>
		<Icon name="check" />
		<span class="label">{notifications.inbox.markDone}</span>
	</Button>
</form>

<style>
	form {
		display: contents;
	}

	/* The icon alone on a phone, where the bar's title needs the room. */
	@media (max-width: 40rem) {
		.label {
			display: none;
		}
	}
</style>
