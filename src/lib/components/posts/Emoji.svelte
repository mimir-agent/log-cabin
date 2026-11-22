<script lang="ts">
	type Props = {
		value: string;
		/** The org's own emoji, :name: → image URL. */
		customEmoji: Record<string, string>;
	};

	const { value, customEmoji }: Props = $props();
	// :name: is one of the org's own emoji while it exists; a deleted one stays text.
	const url = $derived<string | undefined>(customEmoji[value.slice(1, -1)]);
</script>

{#if url && value.startsWith(':')}
	<img class="emoji" src={url} alt={value} title={value} />
{:else}{value}{/if}

<style>
	.emoji {
		display: inline-block;
		inline-size: 1.25em;
		block-size: 1.25em;
		object-fit: contain;
		vertical-align: -0.25em;
	}
</style>
