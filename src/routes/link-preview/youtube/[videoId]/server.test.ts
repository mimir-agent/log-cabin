import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { GET } from './+server';

const member: SignedIn = {
	user: {
		id: 'u1',
		name: 'Ada',
		username: 'ada',
		email: 'ada@example.com',
		avatarUrl: null,
		theme: 'system'
	},
	member: { id: 'm1', role: 'member' }
};

function thumbnail(videoId: string) {
	const url = new URL(`https://campfire.test/link-preview/youtube/${videoId}`);
	const event = { request: new Request(url), params: { videoId }, locals: member, url };
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('GET /link-preview/youtube/[videoId]', () => {
	it('passes on the video’s thumbnail from YouTube, so the browser never asks YouTube', async () => {
		const fetch = vi.fn<(url: string | URL) => Promise<Response>>(
			async () => new Response('jpeg bytes', { headers: { 'content-type': 'image/jpeg' } })
		);
		vi.stubGlobal('fetch', fetch);
		const response = await thumbnail('dQw4w9WgXcQ');
		expect(String(fetch.mock.calls[0][0])).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
		expect(response.headers.get('content-type')).toBe('image/jpeg');
		expect(response.headers.get('cache-control')).toBe('private, max-age=86400');
		expect(await response.text()).toBe('jpeg bytes');
	});

	it('answers 404 to an id that isn’t a YouTube video id, without fetching', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(thumbnail('../../evil')).rejects.toMatchObject({ status: 404 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('answers 404 when YouTube has no thumbnail', async () => {
		vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
		await expect(thumbnail('dQw4w9WgXcQ')).rejects.toMatchObject({ status: 404 });
	});
});
