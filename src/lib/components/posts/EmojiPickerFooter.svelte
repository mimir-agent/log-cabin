<script lang="ts">
	import type { PickerEmoji } from '#lib/emoji/data.js';
	import { saveSkinTone, skinTones, withSkinTone } from '#lib/emoji/picker.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = { shown: PickerEmoji | null; tone: number };

	let { shown, tone = $bindable() }: Props = $props();
</script>

<!-- The focused or hovered emoji with its name, and the skin tone every pick uses. -->
<div class="footer">
	<span class="preview" aria-live="polite">
		{#if shown}
			{#if shown.url}<img src={shown.url} alt="" />{:else}{withSkinTone(shown, tone)}{/if}
			<span class="name">:{shown.name}:</span>
		{/if}
	</span>
	<select
		aria-label={posts.picker.skinTone}
		value={tone}
		onchange={(e) => {
			tone = Number(e.currentTarget.value);
			saveSkinTone(tone);
		}}
	>
		{#each skinTones as t (t.value)}<option value={t.value}>{t.sample}</option>{/each}
	</select>
</div>

<style>
	.footer {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		justify-content: space-between;
		padding: var(--gap-sm);
		border-block-start: var(--border-w-hairline) solid var(--hue-z2-border);
	}

	.preview {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-inline-size: 0;
		font-size: var(--text-lg);
	}

	img {
		inline-size: var(--gap-xl);
		block-size: var(--gap-xl);
		object-fit: contain;
	}

	.name {
		overflow: hidden;
		font-size: var(--type-caption);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (pointer: coarse) {
		select {
			min-block-size: var(--tap-min);
		}
	}
</style>
