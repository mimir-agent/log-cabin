<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { DropdownMenu } from 'bits-ui';
	import Button from './Button.svelte';
	import Menu from './Menu.svelte';

	const { Story } = defineMeta({
		title: 'UI/Menu',
		component: Menu,
		tags: ['autodocs']
	});
</script>

<script lang="ts">
	let mic = $state('default');
	let speaker = $state('default');
</script>

<Story name="Overflow">
	{#snippet template()}
		<Menu open align="end">
			{#snippet trigger({ props })}
				<Button {...props} variant="ghost" size="sm">More</Button>
			{/snippet}
			<DropdownMenu.Item>Copy link <kbd data-menu-shortcut>⌘⇧C</kbd></DropdownMenu.Item>
			<DropdownMenu.Item>New version</DropdownMenu.Item>
			<DropdownMenu.Item>Move to project…</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item data-tone="danger">Delete post</DropdownMenu.Item>
		</Menu>
	{/snippet}
</Story>

<Story name="With a header in the sheet">
	<!-- The row of buttons shows only below 1024px, where the menu is a sheet. -->
	{#snippet template()}
		<Menu open align="end">
			{#snippet trigger({ props })}
				<Button {...props} variant="ghost" size="sm">More</Button>
			{/snippet}
			{#snippet sheetHeader()}
				{#each ['👍', '❤️', '🤔', '😂', '😮'] as emoji (emoji)}
					<Button variant="ghost" aria-label="React with {emoji}">{emoji}</Button>
				{/each}
			{/snippet}
			<DropdownMenu.Item>Reply</DropdownMenu.Item>
			<DropdownMenu.Item>Copy text</DropdownMenu.Item>
		</Menu>
	{/snippet}
</Story>

<Story name="Device picker">
	{#snippet template()}
		<Menu open minWidth="16rem">
			{#snippet trigger({ props })}
				<Button {...props} size="lg">Microphone</Button>
			{/snippet}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>Microphone</DropdownMenu.GroupHeading>
				<DropdownMenu.RadioGroup bind:value={mic}>
					<DropdownMenu.RadioItem value="default">
						MacBook Pro Microphone <span data-menu-hint>Default</span>
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="usb"
						>Shure MV7+ USB Podcast Microphone</DropdownMenu.RadioItem
					>
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>Speaker</DropdownMenu.GroupHeading>
				<DropdownMenu.RadioGroup bind:value={speaker}>
					<DropdownMenu.RadioItem value="default">
						MacBook Pro Speakers <span data-menu-hint>Default</span>
					</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="buds">AirPods Pro</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.CheckboxItem checked>Noise cancellation</DropdownMenu.CheckboxItem>
		</Menu>
	{/snippet}
</Story>
