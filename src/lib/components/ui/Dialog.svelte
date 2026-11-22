<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';

	type Props = {
		open?: boolean;
		/** Names the dialog; it is also its accessible name. */
		title: string;
		/** One or two lines under the title. Also read out when the dialog opens. */
		description?: string;
		/**
		 * sm 24rem for a question (confirm, consent, ringing); md 32rem for a form; lg 44rem for
		 * pickers; 2xl 42rem and 3xl 48rem for the post composer, as in Campsite.
		 */
		size?: 'sm' | 'md' | 'lg' | '2xl' | '3xl';
		/** Fills the screen's height from near its top, as Campsite's expanded composer does. */
		fill?: boolean;
		/**
		 * The content draws its own header, padding and buttons (the post composer): the title
		 * and description are still read out, but not shown.
		 */
		bare?: boolean;
		/** The button that opens it. Spread `props` on your own button. */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
		children?: Snippet;
		/** The buttons along the bottom, main action last (on the right). */
		actions?: Snippet;
		/** Called when it closes any way: Esc, the backdrop, a Close button. */
		onOpenChange?: (open: boolean) => void;
	};

	let {
		open = $bindable(false),
		title,
		description,
		size = 'md',
		fill = false,
		bare = false,
		trigger,
		children,
		actions,
		onOpenChange
	}: Props = $props();
</script>

<Dialog.Root bind:open {onOpenChange}>
	{#if trigger}
		<Dialog.Trigger>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<Dialog.Portal>
		<Dialog.Overlay>
			{#snippet child({ props })}<div {...props} class="backdrop"></div>{/snippet}
		</Dialog.Overlay>
		<Dialog.Content>
			{#snippet child({ props })}
				<!-- bits-ui sets contain: layout on the panel, which would pin anything fixed inside
				     it (the composer's selection menu) to the panel instead of the screen. -->
				<div
					{...props}
					style="{props.style ?? ''}; contain: none"
					class="dialog"
					data-size={size}
					data-fill={fill || undefined}
					data-bare={bare || undefined}
				>
					<header class={{ 'u:visually-hidden': bare }}>
						<Dialog.Title>
							{#snippet child({ props })}<h2 {...props} class="title">{title}</h2>{/snippet}
						</Dialog.Title>
						{#if description}
							<Dialog.Description>
								{#snippet child({ props })}<p {...props} class="description">
										{description}
									</p>{/snippet}
							</Dialog.Description>
						{/if}
					</header>
					{#if children}
						{#if bare}{@render children()}{:else}<div class="body">{@render children()}</div>{/if}
					{/if}
					{#if actions}<footer class="actions">{@render actions()}</footer>{/if}
				</div>
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background-color: var(--hue-backdrop);
		transition: opacity var(--motion-base) var(--motion-ease);

		@starting-style {
			opacity: 0;
		}
	}

	.dialog {
		--dialog-w: 32rem;
		position: fixed;
		inset-block-start: max(var(--gap-lg), 12vh);
		inset-inline: 0;
		z-index: var(--z-modal);
		display: grid;
		gap: var(--gap-lg);
		inline-size: min(var(--dialog-w), calc(100vw - 2 * var(--gap-lg)));
		max-block-size: calc(100dvh - 2 * max(var(--gap-lg), 12vh));
		margin-inline: auto;
		padding: var(--gap-xl);
		overflow-y: auto;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-dialog);
		font-size: var(--type-body);
		line-height: var(--leading-loose);
		/* It rises a little from where it settles: the eye reads it as coming forward. */
		transition:
			opacity var(--motion-base) var(--motion-ease),
			translate var(--motion-base) var(--motion-ease);

		@starting-style {
			opacity: 0;
			translate: 0 var(--gap-sm);
		}
	}

	.dialog[data-size='sm'] {
		--dialog-w: 24rem;
	}

	.dialog[data-size='lg'] {
		--dialog-w: 44rem;
	}

	/* Campsite's composer sizes: 2xl 672px a tenth of the way down, 3xl 768px filling the
	   height from 4% down. */
	.dialog[data-size='2xl'] {
		--dialog-w: 42rem;
		inset-block-start: 10vh;
		max-block-size: calc(100dvh - 20vh);
	}

	.dialog[data-size='3xl'] {
		--dialog-w: 48rem;
	}

	.dialog[data-fill] {
		inset-block-start: 4dvh;
		block-size: calc(100dvh - 8dvh);
		max-block-size: none;
	}

	.dialog[data-bare] {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0;
		overflow: hidden;
	}

	header {
		display: grid;
		gap: var(--gap-xs);
	}

	.title {
		margin: 0;
		font-size: var(--type-title);
		font-weight: var(--fw-semibold);
		line-height: var(--leading-tight);
		text-wrap: balance;
	}

	.description {
		margin: 0;
		color: var(--hue-z2-muted);
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		justify-content: flex-end;
	}
</style>
