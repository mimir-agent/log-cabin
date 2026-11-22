// The Worker's client for Cloudflare's Realtime SFU and TURN service. The app token stays
// here; browsers reach these calls only through /calls/<id>/sfu, which checks who they are.
// Request shapes: https://developers.cloudflare.com/realtime/sfu/api/ and
// https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/
// TURN credentials: https://developers.cloudflare.com/realtime/turn/generate-credentials/

const api = 'https://rtc.live.cloudflare.com/v1';

export type SessionDescription = { type: 'offer' | 'answer'; sdp: string };
export type LocalTrack = { location: 'local'; mid: string; trackName: string };
export type RemoteTrack = { location: 'remote'; sessionId: string; trackName: string };
export type TrackResult = {
	mid?: string;
	trackName?: string;
	sessionId?: string;
	errorCode?: string;
	errorDescription?: string;
};
export type TracksResponse = {
	sessionDescription?: SessionDescription;
	requiresImmediateRenegotiation?: boolean;
	tracks?: TrackResult[];
};

/** Calls are on only when the deployment has a Realtime SFU app. */
export function callsEnabled(env: Env): boolean {
	return !!env.REALTIME_APP_ID && !!env.REALTIME_APP_TOKEN;
}

async function sfuRequest<T>(env: Env, method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${api}/apps/${env.REALTIME_APP_ID}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${env.REALTIME_APP_TOKEN}`,
			'content-type': 'application/json'
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await response.text();
	// An error from in front of the SFU (a gateway timeout) may not be JSON; a success always is.
	const json =
		response.ok || response.headers.get('content-type')?.includes('json')
			? parseJson(text, `Realtime SFU ${method} ${path}`, response.status)
			: {};
	if (!response.ok || json.errorCode) {
		const detail = redactSinkTokens(json.errorDescription ?? text);
		throw new Error(
			`Realtime SFU ${method} ${path}: expected success, got ${response.status} ${json.errorCode ?? ''} ${detail}`
		);
	}
	return json;
}

function parseJson(text: string, request: string, status: number) {
	try {
		return JSON.parse(text);
	} catch (cause) {
		throw new Error(`${request}: expected JSON, got ${status} ${redactSinkTokens(text)}`, {
			cause
		});
	}
}

/** Adapter answers echo endpoint URLs, whose sink token must stay out of errors and logs. */
export function redactSinkTokens(text: string): string {
	return text.replace(/token=[^"&\s]*/g, 'token=[redacted]');
}

export async function newSession(env: Env): Promise<string> {
	const { sessionId } = await sfuRequest<{ sessionId: string }>(env, 'POST', '/sessions/new');
	return sessionId;
}

/** Publishes local tracks (with the browser's offer) or subscribes to remote ones. */
export function newTracks(
	env: Env,
	sessionId: string,
	body: { sessionDescription?: SessionDescription; tracks: LocalTrack[] | RemoteTrack[] }
): Promise<TracksResponse> {
	return sfuRequest(env, 'POST', `/sessions/${sessionId}/tracks/new`, body);
}

/** Sends the browser's answer to an offer the SFU made. */
export function renegotiate(
	env: Env,
	sessionId: string,
	sessionDescription: SessionDescription
): Promise<TracksResponse> {
	return sfuRequest(env, 'PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription });
}

export function closeTracks(
	env: Env,
	sessionId: string,
	body: { tracks: { mid: string }[]; sessionDescription: SessionDescription; force: false }
): Promise<TracksResponse> {
	return sfuRequest(env, 'PUT', `/sessions/${sessionId}/tracks/close`, body);
}

/**
 * Stops everything a session sends and receives, without its browser's help: every track
 * still active is closed with force, which needs no SDP exchange.
 */
export async function closeSession(env: Env, sessionId: string): Promise<void> {
	const state = await sfuRequest<{ tracks?: { mid?: string; status?: string }[] }>(
		env,
		'GET',
		`/sessions/${sessionId}`
	);
	const mids = (state.tracks ?? []).filter((t) => t.status === 'active' && t.mid);
	if (mids.length === 0) return;
	await sfuRequest(env, 'PUT', `/sessions/${sessionId}/tracks/close`, {
		tracks: mids.map(({ mid }) => ({ mid })),
		force: true
	});
}

/** One item of an adapter batch: an adapter id on success, an error code on failure. */
export type AdapterResult = {
	adapterId?: string;
	trackName?: string;
	endpoint?: string;
	errorCode?: string;
	errorDescription?: string;
};

/** The SFU takes at most this many adapters in one create or close request. */
export const adapterBatch = 4;

/**
 * Sends published audio tracks to WebSocket endpoints as 48 kHz stereo PCM (egress, stream
 * mode). Each item succeeds or fails on its own; HTTP 503 (a throw) means every one failed.
 * https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/
 */
export function newAudioAdapters(
	env: Env,
	tracks: { sessionId: string; trackName: string; endpoint: string }[]
): Promise<{ tracks: AdapterResult[] }> {
	return sfuRequest(env, 'POST', '/adapters/websocket/new', {
		tracks: tracks.map((t) => ({ location: 'remote', ...t, outputCodec: 'pcm' }))
	});
}

/** Closes adapters; closing one that is already closed succeeds. */
export function closeAdapters(
	env: Env,
	adapterIds: string[]
): Promise<{ tracks: AdapterResult[] }> {
	return sfuRequest(env, 'POST', '/adapters/websocket/close', {
		tracks: adapterIds.map((adapterId) => ({ adapterId }))
	});
}

const stun: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

/**
 * STUN alone, or Cloudflare TURN credentials for a day when a TURN key is set. Browsers
 * block port 53, and the client waits for every candidate before it sends its offer, so
 * the port-53 URLs are dropped rather than left to time out.
 */
export async function iceServers(env: Env): Promise<RTCIceServer[]> {
	if (!env.REALTIME_TURN_KEY_ID || !env.REALTIME_TURN_KEY_TOKEN) return stun;
	const response = await fetch(
		`${api}/turn/keys/${env.REALTIME_TURN_KEY_ID}/credentials/generate-ice-servers`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${env.REALTIME_TURN_KEY_TOKEN}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ ttl: 86400 })
		}
	);
	if (!response.ok) {
		throw new Error(
			`TURN credentials: expected 201, got ${response.status} ${await response.text()}`
		);
	}
	const { iceServers } = (await response.json()) as { iceServers: RTCIceServer[] };
	return iceServers.map((server) => ({
		...server,
		urls: [server.urls].flat().filter((url) => !/:53\b/.test(url))
	}));
}
