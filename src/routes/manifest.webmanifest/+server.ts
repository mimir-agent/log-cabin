import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { getOrg } from '#lib/server/org.js';
import { pageBackground } from '#lib/pwa.js';
import type { RequestHandler } from './$types';

// What a browser needs to install the app. Each deploy is one organization's app, so the app
// is named for it.
export const GET: RequestHandler = async () => {
	const { name } = await getOrg(getEnv());
	return json(
		{
			id: '/',
			name,
			short_name: name,
			start_url: '/',
			scope: '/',
			display: 'standalone',
			theme_color: pageBackground.light,
			background_color: pageBackground.light,
			icons: [
				{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
			]
		},
		{ headers: { 'content-type': 'application/manifest+json' } }
	);
};
