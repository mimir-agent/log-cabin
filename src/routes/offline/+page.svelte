<!--
  What the service worker shows in place of a page when the network is down. It fetches this
  page signed out when it installs, so it never holds anyone's data, and renders it without
  JavaScript, since nothing past this page can load.
-->
<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import { pwa } from '#lib/strings/pwa.js';
</script>

<SignedOutPage title={pwa.offline.title}>
	<p>{pwa.offline.body}</p>
	<!-- An empty href is the address the page was served for: the one that failed to load. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the current address -->
	<p><a href="">{pwa.offline.retry}</a></p>
</SignedOutPage>
