<!--
  Offers to install the app: Chromium's install prompt where the browser has one, and on iOS,
  where Safari has none, how to add it to the home screen. Either one, once dismissed, stays
  dismissed in this browser.
-->
<script lang="ts" module>
	/** Where this browser remembers that the prompt was dismissed. */
	export const dismissedKey = 'campfire.install-dismissed';
</script>

<script lang="ts">
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { installPrompt } from '#lib/install-prompt.svelte.js';
	import { pwa } from '#lib/strings/pwa.js';

	type Props = { appName: string };

	let { appName }: Props = $props();

	// Shown only once this browser has said it hasn't been dismissed.
	let dismissed = $state(true);
	// Safari on iOS is the one browser with `navigator.standalone`: false in the browser, true
	// once the app is opened from the home screen.
	let ios = $state(false);

	$effect(() => {
		dismissed = localStorage.getItem(dismissedKey) !== null;
		ios = (navigator as { standalone?: boolean }).standalone === false;
	});

	function dismiss() {
		dismissed = true;
		localStorage.setItem(dismissedKey, 'dismissed');
	}

	async function install() {
		const event = installPrompt.event!;
		installPrompt.event = null;
		await event.prompt();
	}
</script>

{#if !dismissed && installPrompt.event}
	<Banner>
		{pwa.install.text(appName)}
		{#snippet action()}
			<span class="choices">
				<Button variant="ghost" size="lg" onclick={dismiss}>{pwa.install.dismiss}</Button>
				<Button size="lg" onclick={install}>{pwa.install.install}</Button>
			</span>
		{/snippet}
	</Banner>
{:else if !dismissed && ios}
	<Banner>
		{pwa.ios.text(appName)}
		{#snippet action()}
			<Button variant="ghost" size="lg" onclick={dismiss}>{pwa.ios.dismiss}</Button>
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
