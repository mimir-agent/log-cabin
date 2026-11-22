<!--
@component
One thing in a settings list, after the rows in Campsite's settings (an integration, a tag, an
invite): what it is at 14px medium, a line about it in the third grey, and its action at the
end. Rows sit edge to edge in a `flush` SettingsSection, a hairline between each.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		/** An icon, a face or a control before the text. */
		leading?: Snippet;
		/** The row's action or its switch, at the end. */
		trailing?: Snippet;
		/** Extra marks after the title: a role badge. */
		meta?: Snippet;
	};

	let { title, description, leading, trailing, meta }: Props = $props();
</script>

<div class="row">
	{#if leading}<div class="leading">{@render leading()}</div>{/if}
	<div class="text">
		<div class="title-line">
			<span class="title" {title}>{title}</span>
			{@render meta?.()}
		</div>
		{#if description}<p class="description">{description}</p>{/if}
	</div>
	{#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
</div>

<style>
	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: 3rem;
		padding: var(--gap-md);
	}

	.leading {
		display: flex;
		flex: none;
		color: var(--hue-z0-muted);
	}

	.text {
		display: grid;
		flex: 1;
		gap: 0.125rem;
		min-inline-size: 0;
	}

	.title-line {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-inline-size: 0;
	}

	.title {
		overflow: hidden;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: var(--leading-tight);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.description {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.trailing {
		display: flex;
		flex: none;
		gap: var(--gap-sm);
		align-items: center;
	}
</style>
