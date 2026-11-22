<script lang="ts">
	import { flushSync } from 'svelte';
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = { url: string | null };

	const { url }: Props = $props();
	const s = posts.publicLink;
	let form: HTMLFormElement;
	let on = $derived(url !== null);
	let copied = $state(false);

	function toggle(checked: boolean) {
		on = checked;
		flushSync();
		form.requestSubmit();
	}

	async function copy() {
		await navigator.clipboard.writeText(url!);
		copied = true;
	}
</script>

<form bind:this={form} class="public-link" method="POST" action="?/publicLink" use:enhance>
	<input type="hidden" name="on" value={on} />
	<Switch checked={on} label={s.label} description={s.description} onCheckedChange={toggle} />
	{#if url}
		<div class="url">
			<input
				readonly
				value={url}
				aria-label={s.urlLabel}
				onfocus={(e) => e.currentTarget.select()}
			/>
			<Button type="button" size="sm" onclick={copy}>{copied ? s.copied : s.copy}</Button>
		</div>
	{/if}
</form>

<style>
	.public-link {
		display: grid;
		gap: var(--gap-sm);
	}

	.url {
		display: flex;
		gap: var(--gap-sm);
	}

	.url input {
		flex: 1;
		min-inline-size: 0;
	}
</style>
