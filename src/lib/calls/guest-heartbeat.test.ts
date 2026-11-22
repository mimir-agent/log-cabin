import { describe, expect, it } from 'vitest';
import { afterFailedBeat } from './guest-heartbeat';

const failedWith = (status: number) =>
	Object.assign(new Error(`call c1 ping: expected 200, got ${status}`), { status });

describe("a guest's failed heartbeat", () => {
	it('is tried again only when the network failed', () => {
		expect(afterFailedBeat(new TypeError('Failed to fetch'))).toBe('retry');
	});

	it('takes the guest out when the server no longer counts them in, or ends with the call', () => {
		expect(afterFailedBeat(failedWith(403))).toBe('removed');
		expect(afterFailedBeat(failedWith(404))).toBe('removed');
		expect(afterFailedBeat(failedWith(410))).toBe('ended');
	});

	it('stops and shows the problem for any other answer from the server', () => {
		expect(afterFailedBeat(failedWith(500))).toBe('failed');
		expect(afterFailedBeat(failedWith(400))).toBe('failed');
	});
});
