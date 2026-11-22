// This browser's microphone, camera and speaker for calls: which devices to use, whether the
// browser's noise cancellation is on, and the layout. Choices are kept in localStorage, so
// each browser remembers its own.

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';
export type ChosenDevice = { id: string; label: string };

export type CallPrefs = {
	/** The device chosen for each kind; missing means the browser's default. */
	devices: Partial<Record<DeviceKind, ChosenDevice>>;
	/** The browser's noise suppression, echo cancellation and automatic gain, together. */
	noiseCancellation: boolean;
	layout: 'speaker' | 'grid';
};

const storageKey = 'campfire.calls';
export const defaultPrefs: CallPrefs = { devices: {}, noiseCancellation: true, layout: 'speaker' };

export function loadPrefs(): CallPrefs {
	const saved = localStorage.getItem(storageKey);
	return saved ? { ...defaultPrefs, ...(JSON.parse(saved) as Partial<CallPrefs>) } : defaultPrefs;
}

export function savePrefs(prefs: CallPrefs): void {
	localStorage.setItem(storageKey, JSON.stringify(prefs));
}

/**
 * The id a chosen device has in this list, if it's there. Browsers may give a device a new
 * id on a later visit (Safari every time, Chrome without a lasting permission), so a device
 * with the chosen label counts too.
 */
export function findDevice(list: MediaDeviceInfo[], chosen?: ChosenDevice): string | undefined {
	if (!chosen) return undefined;
	const device =
		list.find((d) => d.deviceId === chosen.id) ?? list.find((d) => d.label === chosen.label);
	return device?.deviceId;
}

/** Chrome treats an `ideal` deviceId as a hint and keeps opening the default, so: exact. */
export function micConstraints(deviceId: string | undefined, noiseCancellation: boolean) {
	return {
		deviceId: deviceId ? { exact: deviceId } : undefined,
		noiseSuppression: noiseCancellation,
		echoCancellation: noiseCancellation,
		autoGainControl: noiseCancellation
	} satisfies MediaTrackConstraints;
}

export function cameraConstraints(deviceId: string | undefined) {
	return { deviceId: deviceId ? { exact: deviceId } : undefined } satisfies MediaTrackConstraints;
}

/** Whether this browser can send call audio to a chosen speaker (Firefox and Safari can't yet). */
export const canPickSpeaker = () => 'setSinkId' in HTMLMediaElement.prototype;

/** The devices of each kind; ids and names show only once the page may use the camera and mic. */
export async function listDevices(): Promise<Record<DeviceKind, MediaDeviceInfo[]>> {
	const all = await navigator.mediaDevices.enumerateDevices();
	return {
		audioinput: all.filter((d) => d.kind === 'audioinput'),
		videoinput: all.filter((d) => d.kind === 'videoinput'),
		audiooutput: all.filter((d) => d.kind === 'audiooutput')
	};
}
