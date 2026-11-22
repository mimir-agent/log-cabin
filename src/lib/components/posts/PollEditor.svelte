<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { pollLimits } from '#lib/poll-limits.js';
	import { posts } from '#lib/strings/posts.js';

	type Poll = { question: string; options: { id?: string; description: string }[] };
	type Props = {
		value: Poll | null;
		/** Called with the poll as it is now, or null once removed. */
		onchange?: (poll: Poll | null) => void;
	};
	const { value, onchange }: Props = $props();
	const s = posts.poll;
	const blank = () => ({ description: '' });

	let poll = $state<Poll | null>(untrack(() => structuredClone(value)));

	function changed() {
		onchange?.(poll && $state.snapshot(poll));
	}
</script>

<input type="hidden" name="poll" value={poll ? JSON.stringify(poll) : ''} />
{#if poll}
	<fieldset class="poll">
		<legend class="u:visually-hidden">{s.label}</legend>
		<input
			class="question"
			aria-label={s.question}
			placeholder={s.question}
			maxlength={pollLimits.questionLength}
			value={poll.question}
			oninput={(e) => {
				poll!.question = e.currentTarget.value;
				changed();
			}}
		/>
		{#each poll.options as option, i (i)}
			<div class="row">
				<input
					aria-label={s.option(i + 1)}
					placeholder={s.option(i + 1)}
					maxlength={pollLimits.optionLength}
					value={option.description}
					oninput={(e) => {
						option.description = e.currentTarget.value;
						changed();
					}}
				/>
				{#if poll.options.length > pollLimits.minOptions}
					<IconButton
						icon="close"
						label={s.removeOption(i + 1)}
						size="sm"
						quiet
						onclick={() => {
							poll!.options.splice(i, 1);
							changed();
						}}
					/>
				{/if}
			</div>
		{/each}
		<div class="actions">
			{#if poll.options.length < pollLimits.maxOptions}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						poll!.options.push(blank());
						changed();
					}}><Icon name="plus" size={16} />{s.addOption}</Button
				>
			{/if}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => {
					poll = null;
					changed();
				}}><Icon name="trash" size={16} />{s.remove}</Button
			>
		</div>
	</fieldset>
{:else}
	<Button
		variant="ghost"
		size="sm"
		onclick={() => {
			poll = { question: '', options: [blank(), blank()] };
			changed();
		}}><Icon name="chart" size={16} />{s.add}</Button
	>
{/if}

<style>
	/* A raised card inside the composer, as Campsite's poll editor sits under the body. */
	.poll {
		display: grid;
		gap: var(--gap-sm);
		margin: 0;
		padding: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-radius: var(--radius-card);
		background-color: var(--hue-z1-bg);
	}

	.row,
	.actions {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
	}

	input {
		flex: 1;
		min-inline-size: 0;
		block-size: var(--control-h-sm);
		padding-inline: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-field-bg);
		color: inherit;
		font: inherit;
		font-size: max(var(--type-body), var(--type-control));
	}

	.question {
		font-weight: var(--fw-medium);
	}
</style>
