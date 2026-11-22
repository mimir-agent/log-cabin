// The browser's one socket to the org's realtime hub (/realtime). Pages subscribe to
// topics; the socket opens on the first subscription, reconnects with backoff when it
// drops, subscribes again, and then hands every listener { type: 'resync' } so it can
// reload from the database whatever was published while it was away.

export type RealtimePayload = { type: string; [key: string]: unknown };
type Listener = (payload: RealtimePayload) => void;

/** Close code the hub uses when the member is signed out or deactivated. */
const signedOut = 4001;

const listeners = new Map<string, Set<Listener>>();
let socket: WebSocket | null = null;
/** True from the first connect on: while it's waiting out a backoff, socket is null. */
let started = false;
let attempts = 0;
let opened = false;

function connect() {
	started = true;
	const url = new URL('/realtime', location.href);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	const ws = new WebSocket(url);
	socket = ws;
	ws.onopen = () => {
		for (const topic of listeners.keys()) ws.send(JSON.stringify({ type: 'subscribe', topic }));
		if (opened) {
			for (const set of listeners.values())
				for (const listener of set) listener({ type: 'resync' });
		}
		opened = true;
		attempts = 0;
	};
	ws.onmessage = (event) => {
		const { topic, payload } = JSON.parse(event.data);
		for (const listener of listeners.get(topic) ?? []) listener(payload);
	};
	ws.onclose = (event) => {
		socket = null;
		if (event.code === signedOut) {
			started = false;
			return;
		}
		// 1s, 2s, 4s … capped at 30s, with jitter so a restarted hub isn't hit all at once.
		const delay = Math.min(30_000, 1000 * 2 ** attempts++) * (0.5 + Math.random() / 2);
		setTimeout(connect, delay);
	};
}

function sendIfOpen(message: { type: string; topic: string }) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/** Listens to a topic until the returned function is called. */
export function subscribe(topic: string, listener: Listener): () => void {
	if (!started) connect();
	let set = listeners.get(topic);
	if (!set) {
		listeners.set(topic, (set = new Set()));
		sendIfOpen({ type: 'subscribe', topic });
	}
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size > 0) return;
		listeners.delete(topic);
		sendIfOpen({ type: 'unsubscribe', topic });
	};
}

/** Tells the topic's other subscribers this person is typing. */
export function sendTyping(topic: string): void {
	sendIfOpen({ type: 'typing', topic });
}
