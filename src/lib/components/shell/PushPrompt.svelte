<!--
  Offers to turn on push the first time the installed app opens. Only the installed app: iOS
  has no push in a browser tab, and asks for permission only from a tap inside the app. Once
  dismissed, or once the device is subscribed or has said no, it stays away.
-->
<script lang="ts" module>
	/** Where this browser remembers that the prompt was dismissed. */
	export const dismissedKey = 'campfire.push-prompt-dismissed';
</script>

<script lang="ts">
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { enablePush, pushStatus } from '#lib/push-client.js';
	import { notifications } from '#lib/strings/notifications.js';

	type Props = { vapidPublicKey: string | null };

	let { vapidPublicKey }: Props = $props();
	const s = notifications.push;

	// Shown only once this device has said it is the installed app and is not subscribed.
	// A device that blocked notifications reports `denied`, not `off`, so it is left alone.
	let shown = $state(false);
	let failure = $state<string | null>(null);

	$effect(() => {
		const installed =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as { standalone?: boolean }).standalone === true;
		if (!vapidPublicKey || !installed || localStorage.getItem(dismissedKey) !== null) return;
		pushStatus().then((status) => (shown = status === 'off'));
	});

	function dismiss() {
		shown = false;
		localStorage.setItem(dismissedKey, 'dismissed');
	}

	async function enable(key: string) {
		failure = null;
		try {
			await enablePush(key);
			shown = false;
		} catch (cause) {
			if (Notification.permission === 'denied') shown = false;
			else failure = s.failed(cause instanceof Error ? cause.message : String(cause));
		}
	}
</script>

{#if shown && vapidPublicKey}
	<Banner tone={failure ? 'danger' : 'neutral'}>
		{failure ?? s.prompt.text}
		{#snippet action()}
			<span class="choices">
				<Button variant="ghost" size="lg" onclick={dismiss}>{s.prompt.dismiss}</Button>
				<Button size="lg" onclick={() => enable(vapidPublicKey)}>{s.prompt.enable}</Button>
			</span>
		{/snippet}
	</Banner>
{/if}

<style>
	.choices {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}
</style>
