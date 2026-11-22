import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSession } from './sfu';

const env = { REALTIME_APP_ID: 'app', REALTIME_APP_TOKEN: 'token' } as Env;

afterEach(() => vi.unstubAllGlobals());

describe('the Realtime SFU client', () => {
	it('fails, naming the request, when a success answers something other than JSON', async () => {
		vi.stubGlobal('fetch', async () => new Response('<html>ok</html>', { status: 200 }));

		await expect(newSession(env)).rejects.toThrow(
			'Realtime SFU POST /sessions/new: expected JSON, got 200 <html>ok</html>'
		);
	});
});
