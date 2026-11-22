<script lang="ts">
	import { enhance } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		/** From pinState(): the project it pins to and whether it is pinned now. */
		pin: { projectId: string; pinned: boolean };
		subjectType: 'post' | 'note' | 'call';
		subjectId: string;
		/** A row of a menu instead of a button of a bar. */
		item?: boolean;
	};

	const { pin, subjectType, subjectId, item = false }: Props = $props();
	const s = posts.pins;
	const icon = $derived(pin.pinned ? 'pin-tack-filled' : 'pin-tack');
	const label = $derived(pin.pinned ? s.unpin : s.pin);
</script>

<!-- The project page's own actions do the pinning, so the project's rule is the only one. Its
     result stays on this page: the default would follow the action to the project. -->
<form
	method="POST"
	action={`/projects/${pin.projectId}?/${pin.pinned ? 'unpin' : 'pin'}`}
	use:enhance={() =>
		({ update }) =>
			update({ navigate: false })}
>
	<input type="hidden" name="subjectType" value={subjectType} />
	<input type="hidden" name="subjectId" value={subjectId} />
	{#if item}
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<button {...props} type="submit">
					<Icon name={icon} />
					{label}
				</button>
			{/snippet}
		</DropdownMenu.Item>
	{:else}
		<IconButton type="submit" {icon} {label} aria-pressed={pin.pinned} />
	{/if}
</form>
