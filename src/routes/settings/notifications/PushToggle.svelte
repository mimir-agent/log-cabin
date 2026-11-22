<script lang="ts">
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import {
		disablePush,
		enablePush,
		isIosBrowserTab,
		pushStatus,
		type PushStatus
	} from '#lib/push-client.js';
	import { notifications } from '#lib/strings/notifications.js';

	type Props = { vapidPublicKey: string | null };
	let { vapidPublicKey }: Props = $props();
	const s = notifications.push;

	let status = $state<PushStatus | 'loading'>('loading');
	let failure = $state<string | null>(null);

	const line = $derived(
		!vapidPublicKey
			? s.notConfigured
			: status === 'unsupported'
				? isIosBrowserTab()
					? s.installFirst
					: s.unsupported
				: status === 'denied'
					? s.denied
					: status === 'on'
						? s.on
						: status === 'off'
							? s.off
							: undefined
	);

	$effect(() => {
		pushStatus().then((found) => (status = found));
	});

	async function enable(key: string) {
		failure = null;
		try {
			await enablePush(key);
			status = 'on';
		} catch (cause) {
			if (Notification.permission === 'denied') status = 'denied';
			else failure = s.failed(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function disable() {
		failure = null;
		try {
			await disablePush();
			status = 'off';
		} catch (cause) {
			failure = s.failed(cause instanceof Error ? cause.message : String(cause));
		}
	}
</script>

<SettingsSection title={s.heading} description={line} footer={failure ? failed : undefined}>
	{#snippet actions()}
		{#if vapidPublicKey && status === 'on'}
			<Button onclick={disable}>{s.disable}</Button>
		{:else if vapidPublicKey && status === 'off'}
			<Button onclick={() => enable(vapidPublicKey)}>{s.enable}</Button>
		{/if}
	{/snippet}
</SettingsSection>

{#snippet failed()}
	<FormStatus message={failure ?? undefined} />
{/snippet}
