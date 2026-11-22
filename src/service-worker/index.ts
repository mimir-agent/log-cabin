// Shows web push notifications, keeps the app icon's badge and open tabs at the unread count,
// and answers a page load with the offline page when the network is down. It caches only that
// page, fetched signed out, and the app's stylesheets: never a signed-in page or an API answer.
import { version } from '$app/env';
import { immutable } from '$app/manifest';

const sw = self as unknown as ServiceWorkerGlobalScope;

type PushPayload = { title: string; body: string | null; url: string; unread: number };

const cacheName = `offline-${version}`;
const offlinePage = '/offline';
// The manifest's paths are relative to the app's root, which is the site's root.
const stylesheets = immutable.map(({ path }) => `/${path}`).filter((path) => path.endsWith('.css'));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await cache.addAll([new Request(offlinePage, { credentials: 'omit' }), ...stylesheets]);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== cacheName) await caches.delete(key);
			}
			// A page load starts on the network while the worker is still starting up.
			await sw.registration.navigationPreload.enable();
			await sw.clients.claim();
		})()
	);
});

/** The network's answer or, when the network is down, the cached copy of `fallback`. */
async function orCached(answer: () => Promise<Response>, fallback: string): Promise<Response> {
	try {
		return await answer();
	} catch {
		return (await caches.match(fallback)) ?? Response.error();
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.mode === 'navigate') {
		event.respondWith(
			orCached(async () => (await event.preloadResponse) ?? fetch(request), offlinePage)
		);
		return;
	}
	const { pathname } = new URL(request.url);
	if (stylesheets.includes(pathname)) event.respondWith(orCached(() => fetch(request), pathname));
});

sw.addEventListener('push', (event) => {
	const { title, body, url, unread } = event.data!.json() as PushPayload;
	event.waitUntil(
		(async () => {
			await sw.registration.showNotification(title, {
				body: body ?? undefined,
				data: { url },
				tag: url
			});
			// Firefox has no app badge.
			if ('setAppBadge' in sw.navigator) await sw.navigator.setAppBadge(unread);
			for (const client of await sw.clients.matchAll({ type: 'window' })) {
				client.postMessage({ type: 'inbox.unread', count: unread });
			}
		})()
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(sw.clients.openWindow(event.notification.data.url));
});
