<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/FileAttachment/index.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/AttachmentCard/OrigamiAttachment.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/AttachmentCard/PrincipleAttachment.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/AttachmentCard/StitchAttachment.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A design tool's file (Origami, Principle, Stitch) as a card, after Campsite's FileAttachment
(CC BY-NC 4.0): a button for its QR code, the download, and a link that opens it in the tool's
app. Campsite's vendor logos are left out; the file icon stands for all three.
-->
<script lang="ts">
	import { renderSVG } from 'uqr';
	import FileCard from '#lib/components/chat/FileCard.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { appSchemes, type AppFileKind } from '#lib/files.js';
	import { chat } from '#lib/strings/chat.js';

	type Props = {
		file: { name: string; size: number };
		src: string;
		kind: AppFileKind;
		/** The site's origin, which the app takes the file's address from. */
		origin: string;
	};

	let { file, src, kind, origin }: Props = $props();

	// The app registers a scheme in place of https, and takes the file's address from there.
	const openUrl = $derived(new URL(src, origin).href.replace(/^https?/, appSchemes[kind]));
</script>

<FileCard {file} {src}>
	{#snippet actions()}
		<Popover side="bottom" align="end" width="auto" label={chat.files.qrCode}>
			{#snippet trigger({ props })}
				<IconButton {...props} icon="qr-code" label={chat.files.qrCode} />
			{/snippet}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated from the file's address -->
			<div class="qr">{@html renderSVG(openUrl)}</div>
		</Popover>
		<IconButton href={src} download={file.name} icon="download" label={chat.thread.download} />
		<IconButton href={openUrl} icon="external-link" label={chat.files.openInApp} />
	{/snippet}
</FileCard>

<style>
	.qr {
		inline-size: 12.5rem;
	}
</style>
