import { describe, expect, it } from 'vitest';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeEnv } from '#lib/server/testing/fake-d1.js';
import { pageBackground } from '#lib/pwa.js';
import { GET } from './+server';

describe('GET /manifest.webmanifest', () => {
	it('names the installed app for the organization, in the page colour, with a maskable icon', async () => {
		const env = fakeEnv();
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.headers.get('content-type')).toBe('application/manifest+json');
		expect(await response.json()).toMatchObject({
			name: 'Acme',
			short_name: 'Acme',
			display: 'standalone',
			theme_color: pageBackground.light,
			icons: expect.arrayContaining([expect.objectContaining({ purpose: 'maskable' })])
		});
	});
});
