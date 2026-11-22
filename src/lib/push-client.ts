// The browser's side of web push: whether this device is subscribed, and turning that on or off.
// Settings and the first-open prompt share it.

export type PushStatus = 'unsupported' | 'denied' | 'on' | 'off';

/** Safari on iOS has no push in a browser tab, only in the app opened from the home screen. */
export const isIosBrowserTab = () => (navigator as { standalone?: boolean }).standalone === false;

export async function pushStatus(): Promise<PushStatus> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const registration = await navigator.serviceWorker.ready;
	return (await registration.pushManager.getSubscription()) ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function send(method: 'POST' | 'DELETE', subscription: PushSubscription) {
	const response = await fetch('/settings/notifications/push', {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(subscription.toJSON())
	});
	if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
}

/**
 * Subscribes this device and tells the server. Call it from a tap and nothing else: iOS shows
 * the permission prompt only for a call made inside the tap, so the request comes first, before
 * anything is awaited. Throws when the person doesn't allow notifications.
 */
export async function enablePush(vapidPublicKey: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error(`push: expected notification permission "granted", got "${permission}"`);
	}
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: keyBytes(vapidPublicKey)
	});
	await send('POST', subscription);
}

export async function disablePush(): Promise<void> {
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return;
	await send('DELETE', subscription);
	await subscription.unsubscribe();
}
