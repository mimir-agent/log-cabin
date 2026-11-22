<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Poll = {
		question: string;
		total: number;
		options: { id: string; description: string; voters: string[]; chosen: boolean }[];
	};
	const { poll, canVote }: { poll: Poll; canVote: boolean } = $props();
	const s = posts.poll;
	const percent = (n: number) => (poll.total === 0 ? 0 : Math.floor((n / poll.total) * 100));
</script>

<!-- After Campsite's post poll: a card of options, each a row whose fill shows its share, the
     reader's own choice in blue with a check. -->
<section class="poll" aria-label={poll.question || s.label}>
	{#if poll.question}<p class="question">{poll.question}</p>{/if}
	<ol class="options">
		{#each poll.options as option (option.id)}
			{@const share = percent(option.voters.length)}
			<li class="option" data-chosen={option.chosen || undefined} style:--share="{share}%">
				<form method="POST" action="?/vote" use:enhance>
					<input type="hidden" name="optionId" value={option.id} />
					<button
						disabled={!canVote || option.chosen}
						aria-label={s.vote(option.description)}
						aria-pressed={option.chosen}
					>
						<span class="description">{option.description}</span>
						{#if option.chosen}
							<span class="mine"><Icon name="check" size={16} />{s.yourVote}</span>
						{/if}
						<span class="count">{s.percent(share)}</span>
					</button>
				</form>
				<details>
					<summary>{s.votes(option.voters.length)}</summary>
					<p>{option.voters.length ? option.voters.join(', ') : s.noVoters}</p>
				</details>
			</li>
		{/each}
	</ol>
	<p class="total">
		{s.votes(poll.total)}{#if !canVote}
			· {s.cannotVote}{/if}
	</p>
</section>

<style>
	.poll {
		display: grid;
		gap: var(--gap-sm);
		padding: var(--gap-md);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-radius: var(--radius-card);
		background-color: var(--hue-z1-bg);
		font-size: var(--type-body);
	}

	p {
		margin: 0;
	}

	.question {
		font-weight: var(--fw-semibold);
	}

	.options {
		display: grid;
		gap: var(--gap-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.option {
		display: grid;
		gap: var(--gap-xs);
	}

	.option button {
		--bar: var(--hue-fill);
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		inline-size: 100%;
		min-block-size: var(--control-h-md);
		padding: var(--gap-xs) var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background: linear-gradient(to right, var(--bar) var(--share), var(--hue-z2-bg) var(--share));
		color: inherit;
		font: inherit;
		font-weight: var(--fw-medium);
		text-align: start;
		cursor: pointer;
	}

	.option button:enabled:hover {
		border-color: var(--hue-z0-muted);
	}

	.option button:disabled {
		cursor: default;
	}

	.option[data-chosen] button {
		--bar: var(--hue-accent-subtle);
		border-color: var(--hue-accent-subtle-fg);
	}

	.description {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}

	.mine {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		color: var(--hue-accent-subtle-fg);
	}

	.mine,
	.count,
	.total,
	details {
		font-size: var(--type-caption);
		font-weight: var(--fw-regular);
	}

	.count,
	.total,
	details {
		color: var(--hue-z0-muted);
	}

	/* Shares line up in a column at the row's end, in the interface's own figures. */
	.count {
		flex: none;
		min-inline-size: 4ch;
		margin-inline-start: auto;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	summary {
		inline-size: fit-content;
		cursor: pointer;
	}
</style>
