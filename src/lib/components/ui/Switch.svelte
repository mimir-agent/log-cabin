<script lang="ts">
	import { Switch } from 'bits-ui';

	type Props = {
		checked?: boolean;
		/** What it turns on, as a short noun phrase: "Quiet hours", "Noise cancellation". */
		label: string;
		/** One line under the label saying what "on" does. */
		description?: string;
		disabled?: boolean;
		/** Submitted with a form as `name=on` when checked, or `name=value` when a value is given. */
		name?: string;
		value?: string;
		onCheckedChange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		name,
		value,
		onCheckedChange
	}: Props = $props();

	const id = $props.id();
</script>

<!-- The whole row is the target: the label is a <label>, so a click on the words flips it too. -->
<div class="row" data-disabled={disabled ? '' : undefined}>
	<span class="text">
		<label for={id} class="label">{label}</label>
		{#if description}<span class="description" id="{id}-description">{description}</span>{/if}
	</span>
	<Switch.Root
		bind:checked
		{id}
		{name}
		{value}
		{disabled}
		{onCheckedChange}
		aria-describedby={description ? `${id}-description` : undefined}
	>
		{#snippet child({ props })}
			<button {...props} class="track">
				<Switch.Thumb>
					{#snippet child({ props })}<span {...props} class="thumb"></span>{/snippet}
				</Switch.Thumb>
			</button>
		{/snippet}
	</Switch.Root>
</div>

<style>
	.row {
		display: flex;
		gap: var(--gap-lg);
		align-items: center;
		justify-content: space-between;
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	.text {
		display: grid;
		gap: var(--gap-xs);
		min-inline-size: 0;
	}

	.label {
		font-weight: var(--fw-medium);
	}

	.description {
		color: var(--hue-z0-muted);
		text-wrap: pretty;
	}

	/* Campsite's switch (packages/ui/src/Switch; CC BY-NC 4.0): a 28 × 16 track, grey off and
	   blue on, with a full-height white thumb lit from the top. The off grey is gray-500, not
	   Campsite's gray-400, so the track keeps 3:1 against the page. */
	.track {
		--track-w: 1.75rem;
		--track-h: 1rem;
		--thumb: calc(var(--track-h) - 0.25rem);
		flex: none;
		display: inline-flex;
		align-items: center;
		inline-size: var(--track-w);
		block-size: var(--track-h);
		padding: 0.125rem;
		border: 0;
		border-radius: var(--radius-full);
		background-color: var(--hue-switch-off);
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.track[data-state='checked'] {
		background-color: var(--hue-switch-on);
	}

	.thumb {
		inline-size: var(--thumb);
		block-size: var(--thumb);
		border-radius: var(--radius-full);
		background-image: linear-gradient(
			to bottom,
			var(--hue-white),
			var(--hue-white),
			var(--hue-gray-100)
		);
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.12);
		/* The thumb travels: it shows which way the change went. */
		transition: translate var(--motion-base) var(--motion-ease);
	}

	.thumb[data-state='checked'] {
		translate: calc(var(--track-w) - var(--thumb) - 0.25rem) 0;
	}

	.row[data-disabled] {
		opacity: 0.5;
	}

	.row[data-disabled] .track {
		cursor: not-allowed;
	}
</style>
