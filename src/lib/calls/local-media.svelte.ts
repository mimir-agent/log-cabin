import {
	cameraConstraints,
	defaultPrefs,
	findDevice,
	listDevices,
	loadPrefs,
	micConstraints,
	savePrefs,
	type CallPrefs,
	type DeviceKind
} from './devices';

const inputOf = { audio: 'audioinput', video: 'videoinput' } as const;

/**
 * This browser's side of the media: the microphone and camera stream, the chosen devices,
 * mute and camera-off. Switching a device or noise cancellation asks the browser for a new
 * track and hands it to onSwap, which puts it on the call without renegotiating.
 */
export class LocalMedia {
	stream = $state<MediaStream | null>(null);
	/** Read from this browser's storage by start(); nothing reads it before the devices open. */
	prefs = $state<CallPrefs>(defaultPrefs);
	devices = $state<Record<DeviceKind, MediaDeviceInfo[]>>({
		audioinput: [],
		videoinput: [],
		audiooutput: []
	});
	muted = $state(false);
	cameraOff = $state(false);
	onSwap: (track: MediaStreamTrack) => Promise<void> = async () => {};

	/** Opens the microphone and camera; throws when the browser refuses them. */
	async start(): Promise<void> {
		this.prefs = loadPrefs();
		// Ids and names are listed now only if the page could already use the devices.
		this.devices = await listDevices();
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: this.constraints('audio'),
			video: this.constraints('video')
		});
		this.devices = await listDevices();
		// A chosen device that couldn't be told apart before the browser said yes can be now.
		for (const kind of ['audio', 'video'] as const) {
			const chosen = this.deviceId(inputOf[kind]);
			const track = kind === 'audio' ? this.audioTrack : this.videoTrack;
			if (chosen && chosen !== track?.getSettings().deviceId) await this.reopen(kind);
		}
		navigator.mediaDevices.ondevicechange = async () => (this.devices = await listDevices());
	}

	stop(): void {
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = null;
		navigator.mediaDevices.ondevicechange = null;
	}

	/** The id the chosen device of this kind has now, or undefined for the browser's default. */
	deviceId(kind: DeviceKind): string | undefined {
		return findDevice(this.devices[kind], this.prefs.devices[kind]);
	}

	get audioTrack() {
		return this.stream?.getAudioTracks()[0];
	}

	get videoTrack() {
		return this.stream?.getVideoTracks()[0];
	}

	setMuted(muted: boolean) {
		this.muted = muted;
		if (this.audioTrack) this.audioTrack.enabled = !muted;
	}

	setCameraOff(off: boolean) {
		this.cameraOff = off;
		if (this.videoTrack) this.videoTrack.enabled = !off;
	}

	private remember(change: Partial<CallPrefs>) {
		this.prefs = { ...this.prefs, ...change };
		savePrefs(this.prefs);
	}

	/** Uses this listed device from now on, in this call and the next. */
	async useDevice(kind: DeviceKind, deviceId: string) {
		const device = this.devices[kind].find((d) => d.deviceId === deviceId);
		if (!device) throw new Error(`choosing a ${kind}: expected a listed device, got ${deviceId}`);
		this.remember({
			devices: { ...this.prefs.devices, [kind]: { id: device.deviceId, label: device.label } }
		});
		if (kind === 'audioinput') await this.reopen('audio');
		if (kind === 'videoinput') await this.reopen('video');
		// A speaker needs no new track: the call's <audio> elements read deviceId('audiooutput').
	}

	async setNoiseCancellation(on: boolean) {
		this.remember({ noiseCancellation: on });
		await this.reopen('audio');
	}

	setLayout(layout: CallPrefs['layout']) {
		this.remember({ layout });
	}

	private constraints(kind: 'audio' | 'video'): MediaTrackConstraints {
		const deviceId = this.deviceId(inputOf[kind]);
		return kind === 'audio'
			? micConstraints(deviceId, this.prefs.noiseCancellation)
			: cameraConstraints(deviceId);
	}

	/** Swaps in a fresh microphone or camera track built from the current choices. */
	private async reopen(kind: 'audio' | 'video') {
		// The picker shows only once the camera and microphone are open.
		if (!this.stream)
			throw new Error(`switching the ${kind} device: expected an open stream, got none`);
		const old = kind === 'audio' ? this.audioTrack : this.videoTrack;
		// The old track goes first: some devices can't be open twice at once.
		old?.stop();
		const fresh = await navigator.mediaDevices.getUserMedia({ [kind]: this.constraints(kind) });
		const [track] = fresh.getTracks();
		track.enabled = kind === 'audio' ? !this.muted : !this.cameraOff;
		this.stream = new MediaStream([...this.stream.getTracks().filter((t) => t !== old), track]);
		await this.onSwap(track);
	}
}
