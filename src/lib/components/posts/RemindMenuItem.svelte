<!--
@component
Remind me as a row of a Menu that opens the presets beside it, after Campsite's follow-up row. The
time of your own opens a RemindDialog, which the page holds: the menu closes before it opens.
-->
<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { posts } from '#lib/strings/posts.js';
	import RemindItems from './RemindItems.svelte';

	type Props = {
		/** The form action that takes showAt (epoch ms) with the fields below. */
		action: string;
		fields: Record<string, string>;
		/** The viewer's reminder on this subject, if any, which can be removed from here. */
		reminder?: { id: string };
		oncustom: () => void;
	};

	const { action, fields, reminder, oncustom }: Props = $props();
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		<Icon name={reminder ? 'alarm-check' : 'alarm'} />
		{posts.followUps.remindMe}
		<span data-menu-hint><Icon name="chevron-right" /></span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent>
		{#snippet child({ wrapperProps, props })}
			<div {...wrapperProps} data-menu-sub-wrapper>
				<div {...props} data-menu-sub>
					<RemindItems {action} {fields} {reminder} {oncustom} />
				</div>
			</div>
		{/snippet}
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
