// The browser's side of a call: one RTCPeerConnection to Cloudflare's Realtime SFU,
// publishing this person's microphone, camera and screen and receiving everyone else's.
// Every SFU request goes through the Worker at /calls/<id>/sfu, which holds the app token.
// The order of offers and answers follows
// https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/

export type TrackName = 'audio' | 'video' | 'screen';
/** A published track, as everyone in the call names it. */
export type TrackKey = `${string}/${string}`;
type Description = { type: 'offer' | 'answer'; sdp: string };
type TracksResponse = {
	sessionDescription?: Description;
	requiresImmediateRenegotiation?: boolean;
	tracks?: { mid?: string; sessionId?: string; trackName?: string; errorCode?: string }[];
};

export const trackKey = (sessionId: string, trackName: string): TrackKey =>
	`${sessionId}/${trackName}`;

/** Waits for ICE candidates, since the SFU gets one offer, not a trickle; gives up after 5s. */
function gathered(pc: RTCPeerConnection): Promise<void> {
	if (pc.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((done) => {
		const timer = setTimeout(done, 5000);
		pc.addEventListener('icegatheringstatechange', () => {
			if (pc.iceGatheringState !== 'complete') return;
			clearTimeout(timer);
			done();
		});
	});
}

export class CallConnection {
	readonly pc: RTCPeerConnection;
	participantId = '';
	sessionId = '';
	/** Each change to the session waits for the one before it, as the SFU requires. */
	private chain: Promise<unknown> = Promise.resolve();
	private remoteByMid = new Map<string, TrackKey>();
	private screen: RTCRtpTransceiver | null = null;
	/** What carries the microphone and the camera, so a new device can take their place. */
	private senders = new Map<'audio' | 'video', RTCRtpSender>();

	constructor(
		private callId: string,
		onTrack: (key: TrackKey, track: MediaStreamTrack) => void
	) {
		this.pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
		this.pc.ontrack = (event) => {
			const key = this.remoteByMid.get(event.transceiver.mid ?? '');
			if (key) onTrack(key, event.track);
		};
	}

	private async request<T>(body: Record<string, unknown>): Promise<T> {
		const response = await fetch(`/calls/${this.callId}/sfu`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ participantId: this.participantId, ...body })
		});
		if (!response.ok) {
			const detail = await response.text();
			const problem = `call ${this.callId} ${body.op}: expected 200, got ${response.status} ${detail}`;
			throw Object.assign(new Error(problem), { status: response.status });
		}
		return response.json();
	}

	private serially<T>(step: () => Promise<T>): Promise<T> {
		const next = this.chain.then(step);
		this.chain = next.catch(() => {});
		return next;
	}

	/** Joins the call and publishes the microphone and camera. */
	join(local: MediaStream): Promise<void> {
		return this.serially(async () => {
			const joined = await this.request<{
				participantId: string;
				sessionId: string;
				iceServers: RTCIceServer[];
			}>({ op: 'join' });
			// The servers come with the join so TURN credentials are fresh; nothing has been
			// gathered yet, so the connection can still take them.
			this.pc.setConfiguration({ iceServers: joined.iceServers, bundlePolicy: 'max-bundle' });
			this.participantId = joined.participantId;
			this.sessionId = joined.sessionId;
			const sending = local.getTracks().map((track) => ({
				track,
				transceiver: this.pc.addTransceiver(track, { direction: 'sendonly' })
			}));
			for (const { track, transceiver } of sending) {
				this.senders.set(track.kind as 'audio' | 'video', transceiver.sender);
			}
			await this.publish(
				sending.map(({ track, transceiver }) => ({
					transceiver,
					trackName: track.kind === 'audio' ? 'audio' : 'video'
				}))
			);
		});
	}

	private async publish(sending: { transceiver: RTCRtpTransceiver; trackName: TrackName }[]) {
		await this.pc.setLocalDescription(await this.pc.createOffer());
		await gathered(this.pc);
		const response = await this.request<TracksResponse>({
			op: 'publish',
			sessionDescription: this.pc.localDescription,
			tracks: sending.map(({ transceiver, trackName }) => ({
				location: 'local',
				mid: transceiver.mid,
				trackName
			}))
		});
		await this.pc.setRemoteDescription(response.sessionDescription!);
	}

	/** Starts receiving other people's tracks. */
	receive(tracks: { sessionId: string; trackName: string }[]): Promise<void> {
		return this.serially(async () => {
			const response = await this.request<TracksResponse>({ op: 'subscribe', tracks });
			// Results come back in the order they were asked for.
			(response.tracks ?? []).forEach((result, i) => {
				if (result.errorCode || !result.mid) return;
				this.remoteByMid.set(result.mid, trackKey(tracks[i].sessionId, tracks[i].trackName));
			});
			if (!response.requiresImmediateRenegotiation) return;
			await this.pc.setRemoteDescription(response.sessionDescription!);
			await this.pc.setLocalDescription(await this.pc.createAnswer());
			await gathered(this.pc);
			await this.request({ op: 'answer', sessionDescription: this.pc.localDescription });
		});
	}

	shareScreen(track: MediaStreamTrack): Promise<void> {
		return this.serially(async () => {
			this.screen = this.pc.addTransceiver(track, { direction: 'sendonly' });
			await this.publish([{ transceiver: this.screen, trackName: 'screen' }]);
		});
	}

	stopScreen(): Promise<void> {
		return this.serially(async () => {
			const screen = this.screen!;
			this.screen = null;
			const mid = screen.mid;
			screen.stop();
			await this.pc.setLocalDescription(await this.pc.createOffer());
			await gathered(this.pc);
			const response = await this.request<TracksResponse>({
				op: 'unpublish',
				mids: [mid],
				trackNames: ['screen'],
				sessionDescription: this.pc.localDescription
			});
			await this.pc.setRemoteDescription(response.sessionDescription!);
		});
	}

	/** Sends a new microphone or camera track in the old one's place; the SFU sees no change. */
	async replaceTrack(track: MediaStreamTrack): Promise<void> {
		const sender = this.senders.get(track.kind as 'audio' | 'video');
		if (!sender) throw new Error(`call ${this.callId}: no ${track.kind} sender to replace`);
		await sender.replaceTrack(track);
	}

	setMedia(media: { muted: boolean; cameraOff: boolean }): Promise<void> {
		return this.request({ op: 'media', ...media });
	}

	/** Tells the server this browser is still in the call, and hears who else is. */
	ping<Person>(): Promise<{ participants: Person[]; recorded: boolean }> {
		return this.request({ op: 'ping' });
	}

	async leave(): Promise<void> {
		this.pc.close();
		if (this.participantId) await this.request({ op: 'leave' });
	}

	/** Leaving as the tab closes, when there's no time to wait for a response. */
	leaveOnUnload(): void {
		if (!this.participantId) return;
		const body = JSON.stringify({ op: 'leave', participantId: this.participantId });
		navigator.sendBeacon(
			`/calls/${this.callId}/sfu`,
			new Blob([body], { type: 'application/json' })
		);
	}
}
