<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { playRing } from '#lib/calls/ring.js';
	import { calls as strings } from '#lib/strings/calls.js';

	type Ring = { id: string; callId: string; from: string; place: string };

	let { ringing }: { ringing: Ring[] } = $props();
	const s = strings.ringing;
	const ring = $derived(ringing[0]);
	let answering = $state(false);

	// Rings every few seconds while a call is waiting, as a phone would.
	$effect(() => {
		if (!ring) return;
		playRing();
		const timer = setInterval(playRing, 4000);
		return () => clearInterval(timer);
	});

	async function answer(answer: 'accept' | 'decline') {
		answering = true;
		const url = resolve('/calls/invitations/[id]', { id: ring.id });
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ answer })
		});
		answering = false;
		// 410: it stopped ringing meanwhile (answered in another tab, missed, or the call ended).
		if (!response.ok && response.status !== 410) {
			throw new Error(`answering call invitation ${ring.id}: expected 200, got ${response.status}`);
		}
		if (answer === 'accept' && response.ok) {
			const { callId } = (await response.json()) as { callId: string };
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolved; ?join is its query
			await goto(`${resolve('/calls/[id]', { id: callId })}?join`);
		}
		await invalidate('calls:ringing');
	}
</script>

{#if ring}
	<!-- After Campsite's incoming-call toast (CC BY-NC 4.0): a dark pill at the top centre,
	     the caller's face and name, then a red round button to decline and a green one to join.
	     Full width along the top on a phone. -->
	<aside
		class="incoming"
		data-theme="dark"
		aria-live="assertive"
		aria-label={s.incoming(ring.from)}
	>
		<Avatar name={ring.from} size="lg" />
		<div class="text">
			<strong>{s.incoming(ring.from)}</strong>
			<span>{s.where(ring.place)}</span>
		</div>
		<button
			type="button"
			class="answer"
			data-answer="decline"
			aria-label={s.decline}
			title={s.decline}
			disabled={answering}
			onclick={() => answer('decline')}
		>
			<Icon name="thick-close" size={24} />
		</button>
		<button
			type="button"
			class="answer"
			data-answer="accept"
			aria-label={s.accept}
			title={s.accept}
			disabled={answering}
			onclick={() => answer('accept')}
		>
			<Icon name="video-camera-filled" size={24} />
		</button>
	</aside>
{/if}

<style>
	.incoming {
		position: fixed;
		inset-block-start: 0;
		inset-inline: 0;
		z-index: var(--z-toast);
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.75rem;
		padding-block-start: max(0.75rem, env(safe-area-inset-top));
		padding-inline: max(0.75rem, env(safe-area-inset-left)) max(0.75rem, env(safe-area-inset-right));
		background-color: var(--hue-z2-bg);
		box-shadow:
			var(--elevation-popover),
			0 24px 48px rgb(0 0 0 / 0.25);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		animation: arrive var(--motion-slow) var(--motion-ease-out);
	}

	@media (min-width: 64rem) {
		.incoming {
			inset-block-start: var(--gap-lg);
			inset-inline: 50% auto;
			inline-size: 28.125rem;
			border-radius: var(--radius-full);
			translate: -50% 0;
		}
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-1rem) scale(0.9);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.incoming {
			animation: none;
		}
	}

	.text {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	strong,
	.text span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	strong {
		font-weight: var(--fw-semibold);
	}

	.answer {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--tap-min);
		block-size: var(--tap-min);
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		color: var(--hue-white);
		cursor: pointer;
	}

	.answer[data-answer='decline'] {
		background-color: var(--hue-danger-solid);
	}

	.answer[data-answer='accept'] {
		background-color: var(--hue-call-solid);
	}

	.answer:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.answer:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
