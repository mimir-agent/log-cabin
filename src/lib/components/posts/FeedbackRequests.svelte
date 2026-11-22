<script lang="ts">
	import { enhance } from '$app/forms';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Request = { id: string; name: string; status: 'waiting' | 'replied' | 'dismissed' };
	type Props = {
		requests: Request[];
		/** The post's author, who may take a request back. */
		canWithdraw: boolean;
	};

	const { requests, canWithdraw }: Props = $props();
	const s = posts.feedback;
</script>

{#if requests.length > 0}
	<section aria-labelledby="feedback-heading">
		<h2 id="feedback-heading" class="heading">{s.heading}</h2>
		<ul role="list">
			{#each requests as request (request.id)}
				<li>
					{request.name}
					<span class="status" data-status={request.status}>{s.status[request.status]}</span>
					{#if canWithdraw}
						<form method="POST" action="?/withdrawFeedback" use:enhance>
							<input type="hidden" name="requestId" value={request.id} />
							<IconButton
								type="submit"
								icon="close"
								size="sm"
								quiet
								label={s.withdraw(request.name)}
							/>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.heading {
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		padding: 0;
	}

	li {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		padding: var(--gap-xs) var(--gap-sm);
		border: var(--border-w-thin) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		font-size: var(--type-body);
	}

	.status {
		color: var(--hue-z0-muted);
	}

	.status[data-status='replied'] {
		color: var(--hue-success);
	}
</style>
