import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPrefs, findDevice, loadPrefs, micConstraints, savePrefs } from './devices';

const device = (deviceId: string, label: string) => ({ deviceId, label }) as MediaDeviceInfo;

describe('finding the chosen device', () => {
	const list = [device('a1', 'Built-in Microphone'), device('b2', 'USB Headset')];

	it('finds it by id, or by name once the browser has given it a new id', () => {
		expect(findDevice(list, { id: 'b2', label: 'USB Headset' })).toBe('b2');
		expect(findDevice(list, { id: 'old-id', label: 'USB Headset' })).toBe('b2');
	});

	it('falls back to the default when the device is gone or nothing was chosen', () => {
		expect(findDevice(list, { id: 'c3', label: 'Unplugged Mic' })).toBeUndefined();
		expect(findDevice(list, undefined)).toBeUndefined();
	});

	it("doesn't match on names before the browser shows them", () => {
		const unnamed = [device('', ''), device('', '')];

		expect(findDevice(unnamed, { id: 'b2', label: 'USB Headset' })).toBeUndefined();
	});
});

describe('the microphone constraints', () => {
	it('turn noise suppression, echo cancellation and gain control on and off together', () => {
		expect(micConstraints('a1', true)).toEqual({
			deviceId: { exact: 'a1' },
			noiseSuppression: true,
			echoCancellation: true,
			autoGainControl: true
		});
		expect(micConstraints(undefined, false)).toEqual({
			deviceId: undefined,
			noiseSuppression: false,
			echoCancellation: false,
			autoGainControl: false
		});
	});
});

describe('call preferences', () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubStorage() {
		const items = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => items.set(key, value)
		});
	}

	it('come back as they were saved', () => {
		stubStorage();
		const prefs = {
			devices: { audioinput: { id: 'b2', label: 'USB Headset' } },
			noiseCancellation: false,
			layout: 'grid' as const
		};
		savePrefs(prefs);
		expect(loadPrefs()).toEqual(prefs);
	});

	it('are the defaults until something is saved', () => {
		stubStorage();
		expect(loadPrefs()).toEqual(defaultPrefs);
	});
});
