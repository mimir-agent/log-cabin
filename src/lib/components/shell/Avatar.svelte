<script lang="ts" module>
	// One initial on a tint picked from the name, as Campsite's fallback avatars do, so the same person
	// always gets the same colour.
	const tints = [
		'orange',
		'amber',
		'lime',
		'emerald',
		'teal',
		'cyan',
		'blue',
		'indigo',
		'violet',
		'pink',
		'rose',
		'stone'
	];

	export function initials(name: string, max = 2): string {
		const words = name.trim().split(/\s+/).filter(Boolean);
		const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
		return letters
			.slice(0, max)
			.map((word) => [...word][0]?.toUpperCase() ?? '')
			.join('');
	}

	export function tintFor(name: string): string {
		let hash = 0;
		for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
		return tints[hash % tints.length];
	}
</script>

<script lang="ts">
	import { Avatar } from 'bits-ui';

	type Props = {
		name: string;
		src?: string | null;
		/** A channel's emoji, shown in place of its initial. */
		accessory?: string | null;
		/** xs 20 · sm 24 (rows, comments) · md 32 (posts) · lg 40 (hover cards) · xl 64 (profile header, a call tile with the camera off). */
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		/** Square for an organization or project, round for a person. */
		shape?: 'round' | 'square';
		/** A dot at the corner: online now, or notifications paused (quiet hours, "pause until"). */
		presence?: 'online' | 'paused' | null;
		/** What the dot means, read out after the name ("Active now", "Notifications paused"). */
		presenceLabel?: string;
	};

	let {
		name,
		src,
		accessory,
		size = 'sm',
		shape = 'round',
		presence,
		presenceLabel
	}: Props = $props();

	const tint = $derived(tintFor(name));
</script>

<Avatar.Root>
	{#snippet child({ props })}
		<span
			{...props}
			class="avatar"
			data-size={size}
			data-shape={shape}
			style:--avatar-bg="light-dark(var(--hue-{tint}-200), var(--hue-{tint}-800))"
			style:--avatar-fg="light-dark(var(--hue-{tint}-900), var(--hue-{tint}-100))"
		>
			{#if src}
				<Avatar.Image {src} alt={name}>
					{#snippet child({ props: imageProps })}
						<img {...imageProps} class="image" />
					{/snippet}
				</Avatar.Image>
			{/if}
			<Avatar.Fallback>
				{#snippet child({ props: fallbackProps })}
					<span {...fallbackProps} class="fallback" role="img" aria-label={name}>
						<span aria-hidden="true">{accessory || initials(name, 1)}</span>
					</span>
				{/snippet}
			</Avatar.Fallback>
			{#if presence}
				<span
					class="presence"
					data-presence={presence}
					role={presenceLabel ? 'img' : undefined}
					aria-label={presenceLabel}
					aria-hidden={presenceLabel ? undefined : 'true'}
				></span>
			{/if}
		</span>
	{/snippet}
</Avatar.Root>

<style>
	.avatar {
		--avatar-size: var(--gap-xl);
		display: inline-grid;
		flex: none;
		inline-size: var(--avatar-size);
		block-size: var(--avatar-size);
		position: relative;
		border-radius: var(--radius-full);
		background-color: var(--avatar-bg);
		color: var(--avatar-fg);
		font-size: calc(var(--avatar-size) * 0.46);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		letter-spacing: 0;
		user-select: none;
	}

	.avatar[data-size='xs'] {
		--avatar-size: 1.25rem;
		/* Small enough that the letter needs a larger share of the circle to stay legible. */
		font-size: calc(var(--avatar-size) * 0.55);
	}

	.avatar[data-size='md'] {
		--avatar-size: var(--control-h-md);
	}

	.avatar[data-size='lg'] {
		--avatar-size: var(--control-h-lg);
	}

	.avatar[data-size='xl'] {
		--avatar-size: 4rem;
	}

	.avatar[data-shape='square'] {
		border-radius: calc(var(--avatar-size) * 0.25);
	}

	.image,
	.fallback {
		grid-area: 1 / 1;
		inline-size: 100%;
		block-size: 100%;
		overflow: hidden;
		border-radius: inherit;
	}

	.image {
		object-fit: cover;
	}

	.fallback {
		display: grid;
		place-items: center;
	}

	/* The dot sits on the corner, cut out of whatever is behind the avatar by a ring of the
	   surface colour (set --avatar-ring when the avatar sits on z1 or z2). */
	.presence {
		--dot: max(0.5rem, calc(var(--avatar-size) * 0.3));
		position: absolute;
		inset-block-end: calc(var(--dot) * -0.15);
		inset-inline-end: calc(var(--dot) * -0.15);
		inline-size: var(--dot);
		block-size: var(--dot);
		border-radius: var(--radius-full);
		box-shadow: 0 0 0 var(--border-w-standard) var(--avatar-ring, var(--hue-z0-bg));
	}

	.presence[data-presence='online'] {
		background-color: var(--hue-online);
	}

	/* Paused is a ring, not a fill: still here, just not to be reached right now. */
	.presence[data-presence='paused'] {
		background-color: var(--avatar-ring, var(--hue-z0-bg));
		border: var(--border-w-standard) solid var(--hue-z0-muted);
	}
</style>
