import { expect, it, vi } from 'vitest';
import { publish } from './publish';

function envWithHub(response: Response) {
	const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => response);
	const realtime = {
		idFromName: vi.fn((name: string) => `id:${name}`),
		get: vi.fn<(id: string) => { fetch: typeof fetch }>(() => ({ fetch }))
	};
	return { fetch, realtime, env: { REALTIME: realtime } as unknown as Env };
}

it('posts the topic and payload to the org’s one hub', async () => {
	const { fetch, realtime, env } = envWithHub(new Response(null, { status: 204 }));

	await publish(env, 'post:p1', { kind: 'comment', id: 'c1' });

	expect(realtime.idFromName).toHaveBeenCalledWith('org');
	expect(realtime.get).toHaveBeenCalledWith('id:org');
	const [, init] = fetch.mock.calls[0];
	expect(init.method).toBe('POST');
	expect(JSON.parse(init.body as string)).toEqual({
		topic: 'post:p1',
		payload: { kind: 'comment', id: 'c1' }
	});
});

it('throws naming the topic and status when the hub rejects the publish', async () => {
	const { env } = envWithHub(new Response('nope', { status: 500 }));
	await expect(publish(env, 'post:p1', {})).rejects.toThrow(
		'publish to "post:p1" failed: hub answered 500'
	);
});
