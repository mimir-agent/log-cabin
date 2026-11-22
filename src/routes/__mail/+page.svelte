<script lang="ts">
	import { mail } from '#lib/strings/mail.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{mail.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>{mail.title}</h1>
<p>{mail.intro}</p>

{#each data.messages as message (message.id)}
	<article>
		<h2>{message.subject}</h2>
		<dl>
			<dt>{mail.to}</dt>
			<dd>{message.toAddress}</dd>
			<dt>{mail.from}</dt>
			<dd>{message.fromAddress}</dd>
			<dt>{mail.sent}</dt>
			<dd>
				<time datetime={new Date(message.createdAt).toISOString()}>
					{new Date(message.createdAt).toISOString()}
				</time>
			</dd>
		</dl>
		<h3>{mail.html}</h3>
		{#if message.htmlBody}
			<!-- An empty sandbox: the email's HTML can't run script or reach this page. -->
			<iframe title={mail.htmlTitle(message.subject)} sandbox="" srcdoc={message.htmlBody}></iframe>
		{:else}
			<p>{mail.noHtml}</p>
		{/if}
		<h3>{mail.text}</h3>
		<pre>{message.textBody}</pre>
	</article>
{:else}
	<p>{mail.empty}</p>
{/each}

<style>
	iframe {
		inline-size: 100%;
		block-size: 32rem;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
	}
</style>
