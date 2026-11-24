<script lang="ts" module>
	export type CallPerson = {
		id: string;
		name: string;
		sessionId: string;
		tracks: string[];
		muted: boolean;
		cameraOff: boolean;
	};
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import CallScreen from '#lib/components/calls/CallScreen.svelte';
	import type { Tile } from '#lib/components/calls/CallStage.svelte';
	import CallTile from '#lib/components/calls/CallTile.svelte';
	import DevicePicker from '#lib/components/calls/DevicePicker.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { CallConnection, trackKey, type TrackKey } from '#lib/calls/connection.js';
	import { canPickSpeaker } from '#lib/calls/devices.js';
	import { LocalMedia } from '#lib/calls/local-media.svelte.js';
	import { SpeakerWatch } from '#lib/calls/speaker.js';
	import { calls } from '#lib/strings/calls.js';

	// One person's side of a live call: their camera and microphone, everyone else's tracks,
	// and the controls. The page around it keeps `people` current and says when it ended.
	let {
		callId,
		title,
		people,
		ended,
		autoJoin = false,
		canShare = true,
		recorded = false,
		refresh,
		connection = $bindable(null),
		extras,
		intro,
		recording,
		problem = $bindable('')
	}: {
		callId: string;
		/** Where the call is, at the top of the call's own screen once joined. */
		title: string;
		people: CallPerson[];
		ended: boolean;
		/** Join as soon as the page opens: the person already said they meant to. */
		autoJoin?: boolean;
		/** Whether this person may share their screen. */
		canShare?: boolean;
		/** Whether the call is being recorded: said before joining, where consent is given. */
		recorded?: boolean;
		/** Asks the page for a fresh list of people, after a change made here. */
		refresh: () => Promise<unknown>;
		connection?: CallConnection | null;
		/** More actions, beside the title while connected (Invite). */
		extras?: Snippet;
		/** A line above the lobby's note, such as who a guest joins as. */
		intro?: Snippet;
		/** The recording banner and Record button, on the call's screen while connected. It gets
		 *  the element holding the video tiles and everyone's audio in this browser, which a
		 *  recording's video is made from. */
		recording?: Snippet<[{ stage: HTMLElement | undefined; audio: MediaStream[] }]>;
		/** What went wrong, in the lobby or on the call's screen. The page can set it too. */
		problem?: string;
	} = $props();
	const s = calls.room;
	const d = calls.devices;

	const media = new LocalMedia();
	/** Whoever is talking: their tile's key. */
	let speaking = $state<string | null>(null);
	const speakers = new SpeakerWatch((key) => (speaking = key));
	let joining = $state(false);
	let showDevices = $state(false);
	let screen = $state<MediaStream | null>(null);
	/** Everyone else's tracks, as they arrive. */
	let remote = $state<Record<TrackKey, MediaStream>>({});
	/** Tracks already asked for. Plain on purpose: the effect below writes it as it reads it. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const asked = new Set<TrackKey>();

	const me = $derived(people.find((p) => p.id === connection?.participantId));
	const others = $derived(people.filter((p) => p.id !== connection?.participantId));

	const tiles = $derived.by((): Tile[] => {
		const all: Tile[] = [];
		if (me) {
			const stream = media.cameraOff ? null : media.stream;
			all.push({
				key: me.id,
				label: s.you(me.name),
				name: me.name,
				stream,
				muted: media.muted,
				self: true
			});
			if (screen) {
				all.push({
					key: `${me.id}/screen`,
					label: s.screenOf(me.name),
					name: me.name,
					stream: screen,
					screen: true
				});
			}
		}
		for (const person of others) {
			const video = remote[trackKey(person.sessionId, 'video')] ?? null;
			all.push({
				key: person.id,
				label: person.name,
				name: person.name,
				stream: person.cameraOff ? null : video,
				muted: person.muted
			});
			if (person.tracks.includes('screen')) {
				all.push({
					key: `${person.id}/screen`,
					label: s.screenOf(person.name),
					name: person.name,
					stream: remote[trackKey(person.sessionId, 'screen')] ?? null,
					screen: true
				});
			}
		}
		return all;
	});
	/** A shared screen takes the big tile; otherwise whoever spoke last, or the first other person. */
	const stage = $derived(
		tiles.find((t) => t.screen)?.key ?? speaking ?? others[0]?.id ?? me?.id ?? null
	);

	/** The call's screen, which holds the video tiles. */
	let screenElement = $state<HTMLElement>();
	const audio = $derived([
		...(media.stream ? [media.stream] : []),
		...others.flatMap((p) => remote[trackKey(p.sessionId, 'audio')] ?? [])
	]);

	$effect(() => {
		if (ended) hangUp();
	});

	// Asks for each newly published track, and forgets ones that stopped (a screen share).
	$effect(() => {
		if (!connection?.participantId) return;
		const published = others.flatMap((p) => p.tracks.map((t) => trackKey(p.sessionId, t)));
		for (const key of asked) {
			if (!published.includes(key)) asked.delete(key);
		}
		const fresh = published.filter((key) => !asked.has(key));
		if (fresh.length === 0) return;
		for (const key of fresh) asked.add(key);
		connection
			.receive(fresh.map((key) => ({ sessionId: key.split('/')[0], trackName: key.split('/')[1] })))
			.catch(failed);
	});

	// Listens to everyone's microphone, your own included, to find who's talking. A muted
	// microphone stays on the list: it's silent, so whoever mutes while on the big tile keeps
	// it, as anyone who goes quiet does.
	$effect(() => {
		if (!connection || !me) return;
		const sources: [string, MediaStream][] = [];
		if (media.stream) sources.push([me.id, media.stream]);
		for (const person of others) {
			const audio = remote[trackKey(person.sessionId, 'audio')];
			if (audio) sources.push([person.id, audio]);
		}
		speakers.watch(sources);
	});

	function failed(e: unknown) {
		problem = s.failed(e instanceof Error ? e.message : String(e));
	}

	/** Opens the camera and microphone, for a preview or to join; false if the browser refused. */
	async function openMedia() {
		if (media.stream) return true;
		try {
			await media.start();
			return true;
		} catch {
			problem = s.noMedia;
			return false;
		}
	}

	async function toggleDevices() {
		showDevices = !showDevices;
		if (showDevices) await openMedia();
	}

	async function join() {
		joining = true;
		problem = '';
		if (!(await openMedia())) {
			joining = false;
			return;
		}
		const joined = new CallConnection(callId, (key, track) => {
			remote = { ...remote, [key]: new MediaStream([track]) };
		});
		media.onSwap = (track) => joined.replaceTrack(track);
		try {
			await joined.join(media.stream!);
			connection = joined;
			if (media.muted || media.cameraOff) await sendMedia();
			await refresh();
		} catch (e) {
			failed(e);
			joined.pc.close();
		}
		joining = false;
	}

	/** Drops this browser's side of the call once the call is over. */
	function hangUp() {
		connection?.pc.close();
		connection = null;
		speakers.stop();
		media.stop();
		screen?.getTracks().forEach((t) => t.stop());
		screen = null;
	}

	async function leave() {
		const leaving = connection;
		hangUp();
		await leaving?.leave().catch(failed);
		await refresh();
	}

	/** Where this person was going when asked whether to leave the call for it. */
	let goingTo = $state<URL | null>(null);

	// Another page of the app would hang up, so ask first. Closing or reloading the tab isn't
	// asked about: the browser is going either way, and the leave goes out as it unloads.
	beforeNavigate((navigation) => {
		if (!connection || navigation.willUnload || !navigation.to) return;
		navigation.cancel();
		goingTo = navigation.to.url;
	});

	/** Leaves, then goes, so the next page already shows this person out of the call. */
	async function leaveAndGo() {
		const url = goingTo!;
		goingTo = null;
		await leave();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the router resolved it
		await goto(url);
	}

	const sendMedia = () =>
		connection?.setMedia({ muted: media.muted, cameraOff: media.cameraOff }).catch(failed);

	function toggleMute() {
		media.setMuted(!media.muted);
		sendMedia();
	}

	function toggleCamera() {
		media.setCameraOff(!media.cameraOff);
		sendMedia();
	}

	async function toggleScreen() {
		if (screen) {
			screen.getTracks().forEach((t) => t.stop());
			screen = null;
			await connection?.stopScreen().catch(failed);
			return;
		}
		try {
			screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
		} catch {
			return; // The person closed the browser's picker.
		}
		const [track] = screen.getVideoTracks();
		track.onended = () => screen && toggleScreen();
		await connection?.shareScreen(track).catch(failed);
	}

	/** Plays someone's audio through the chosen speaker, where the browser allows choosing. */
	function playAudio(element: HTMLAudioElement, stream: MediaStream) {
		element.srcObject = stream;
		const speaker = media.deviceId('audiooutput');
		if (speaker && canPickSpeaker()) element.setSinkId(speaker).catch(failed);
	}

	onMount(() => {
		if (autoJoin && !ended) join();
		return () => {
			if (connection) leave();
			else media.stop();
		};
	});
</script>

<svelte:window onpagehide={() => connection?.leaveOnUnload()} />

{#if connection}
	<CallScreen
		{title}
		{tiles}
		{stage}
		{speaking}
		{problem}
		{extras}
		{canShare}
		layout={media.prefs.layout}
		muted={media.muted}
		cameraOff={media.cameraOff}
		sharing={!!screen}
		{showDevices}
		onmute={toggleMute}
		oncamera={toggleCamera}
		onshare={toggleScreen}
		onleave={leave}
		onlayout={(layout) => media.setLayout(layout)}
		ondevices={() => (showDevices = !showDevices)}
		bind:element={screenElement}
	>
		{#snippet devices()}<DevicePicker {media} onerror={failed} />{/snippet}
		{#snippet banner()}{@render recording?.({ stage: screenElement, audio })}{/snippet}
	</CallScreen>
	<Dialog
		open={goingTo !== null}
		onOpenChange={(open) => !open && (goingTo = null)}
		title={s.leaveTitle}
		description={s.leaveNote}
		size="sm"
	>
		{#snippet actions()}
			<Button onclick={() => (goingTo = null)}>{s.stay}</Button>
			<Button variant="danger" onclick={leaveAndGo}>{s.leaveAndGo}</Button>
		{/snippet}
	</Dialog>
	{#each others as person (person.id)}
		{@const audio = remote[trackKey(person.sessionId, 'audio')]}
		{#if audio}
			<audio {@attach (element) => playAudio(element, audio)} autoplay></audio>
		{/if}
	{/each}
{:else}
	<!-- Before joining, or after: the call's mark, one line, and what you can do, in the
	     shape of Campsite's empty states; with your camera's preview above while you check
	     your devices. -->
	<div class="lobby">
		{#if !ended && showDevices && media.stream}
			<div class="preview" data-theme="dark">
				<CallTile
					label={d.preview}
					name=""
					stream={media.cameraOff ? null : media.stream}
					muted={media.muted}
					self
				/>
			</div>
		{:else}
			<span class="mark" data-ended={ended ? '' : undefined} aria-hidden="true">
				<Icon name={ended ? 'video-camera-off' : 'video-camera-filled'} size={24} />
			</span>
		{/if}
		{#if intro && !ended}<p class="intro">{@render intro()}</p>{/if}
		<p class="note" role={ended ? 'status' : undefined}>{ended ? s.ended : s.ready}</p>
		{#if recorded && !ended}<p class="consent" role="status">{calls.recording.consent}</p>{/if}
		{#if !ended}
			<div class="actions">
				<Button variant="primary" onclick={join} disabled={joining}>
					<Icon name="video-camera" size={16} />{joining ? s.joining : s.join}
				</Button>
				<Button variant="ghost" aria-expanded={showDevices} onclick={toggleDevices}>
					<Icon name="sliders" size={16} />{d.settings}
				</Button>
			</div>
			{#if showDevices && media.stream}
				<div class="picker"><DevicePicker {media} onerror={failed} /></div>
			{/if}
		{/if}
		{#if problem}
			<p class="problem" role="alert"><Icon name="warning-triangle" size={16} />{problem}</p>
		{/if}
	</div>
{/if}

<style>
	.lobby {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
		align-items: center;
		max-inline-size: 30rem;
		margin-inline: auto;
		padding-block: var(--gap-3xl);
		text-align: center;
	}

	.mark {
		display: grid;
		place-items: center;
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-call-subtle);
		color: var(--hue-call);
	}

	/* An ended call has no green: nothing is happening here any more. */
	.mark[data-ended] {
		background-color: var(--hue-fill);
		color: var(--hue-text-quaternary);
	}

	.preview {
		inline-size: 100%;
		aspect-ratio: 16 / 9;
	}

	.intro {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.note {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-wrap: balance;
	}

	.consent {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.actions {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}

	.picker {
		inline-size: 100%;
		padding: 0.75rem;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		text-align: start;
	}

	.problem {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		margin: 0;
		color: var(--hue-danger);
		font-size: var(--type-body);
		text-align: start;
	}
</style>
