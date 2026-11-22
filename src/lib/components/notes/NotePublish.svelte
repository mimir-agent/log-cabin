<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { notes } from '#lib/strings/notes.js';

	type Props = {
		/** The public address while the note is published, else null. */
		url: string | null;
		/** Whether the org allows public links at all. */
		allowed: boolean;
	};

	const { url, allowed }: Props = $props();
	const s = notes.publish;

	async function copy() {
		await navigator.clipboard.writeText(url!);
		toast(notes.note.publicLinkCopied);
	}
</script>

<!-- Campsite's Publish tab: a globe that lights up while published, then the one action. -->
<section class="publish" aria-labelledby="publish-title">
	<span class="globe" class:on={url !== null}><Icon name="globe" /></span>
	<div class="text">
		<h3 id="publish-title">{s.title}</h3>
		<p>{url ? s.public : s.private}</p>
	</div>
	{#if url}
		<div class="url">
			<input
				readonly
				value={url}
				aria-label={s.urlLabel}
				onfocus={(e) => e.currentTarget.select()}
			/>
			<Button type="button" size="sm" onclick={copy}>{s.copy}</Button>
		</div>
		<form method="POST" action="?/publish" use:enhance>
			<input type="hidden" name="on" value="0" />
			<Button type="submit" size="sm" variant="flat">{s.disable}</Button>
		</form>
	{:else if allowed}
		<form method="POST" action="?/publish" use:enhance>
			<input type="hidden" name="on" value="1" />
			<Button type="submit" size="sm" variant="primary">{s.publish}</Button>
		</form>
	{:else}
		<p class="muted">{s.off}</p>
	{/if}
</section>

<style>
	.publish {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--gap-sm);
		align-items: start;
		margin-block-start: var(--gap-md);
		padding-block-start: var(--gap-md);
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.publish > :not(.globe, .text) {
		grid-column: 1 / -1;
	}

	.globe {
		display: flex;
		color: var(--hue-z0-muted);
	}

	.globe.on {
		color: var(--hue-accent);
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
	}

	.text p,
	.muted {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
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
