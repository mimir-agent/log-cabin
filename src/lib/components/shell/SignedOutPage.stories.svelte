<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SignedOutPage from './SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';

	const { Story } = defineMeta({
		title: 'Shell/SignedOutPage',
		component: SignedOutPage,
		tags: ['autodocs'],
		args: { title: auth.twoFactor.title }
	});
</script>

{#snippet codeForm()}
	<form method="POST" class="l:waterfall">
		<label class="l:waterfall">
			<span>{auth.twoFactor.code}</span>
			<input name="code" autocomplete="one-time-code" spellcheck="false" />
		</label>
		<div>
			<SuedeButton type="submit">{auth.twoFactor.submit}</SuedeButton>
		</div>
	</form>
{/snippet}

<Story name="Form">
	{#snippet template(args)}
		<SignedOutPage {...args}>
			<p>{auth.twoFactor.intro}</p>
			{@render codeForm()}
		</SignedOutPage>
	{/snippet}
</Story>

<Story name="Form with an error">
	{#snippet template(args)}
		<SignedOutPage {...args}>
			<p>{auth.twoFactor.intro}</p>
			<p role="alert">{auth.twoFactor.errors.wrong}</p>
			{@render codeForm()}
		</SignedOutPage>
	{/snippet}
</Story>

<Story name="Confirmation" args={{ title: auth.reset.requestTitle }}>
	{#snippet template(args)}
		<SignedOutPage {...args}>
			<p role="status">{auth.reset.sent('ada@example.com')}</p>
		</SignedOutPage>
	{/snippet}
</Story>
