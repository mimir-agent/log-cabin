// What the call specs share: a browser that joins a call without a real SFU.

/**
 * Runs in the page before the app: answers every request to the call's SFU route as the
 * SFU would, with `participantId` as the join's participant and a peer connection of its
 * own for the answers, and keeps the app's peer connections in `window.calls` to look at.
 * The leave a closing tab sends is dropped too: the seeded participants stay in the call
 * from one test to the next.
 */
export function standInSfu(participantId: string) {
	const Real = window.RTCPeerConnection;
	const made: RTCPeerConnection[] = [];
	Object.assign(window, { calls: made });
	window.RTCPeerConnection = class extends Real {
		constructor(config?: RTCConfiguration) {
			super(config);
			made.push(this);
		}
	};
	const answer = async (offer: RTCSessionDescriptionInit) => {
		const sfu = new Real();
		await sfu.setRemoteDescription(offer);
		await sfu.setLocalDescription(await sfu.createAnswer());
		return { sessionDescription: sfu.localDescription };
	};
	const fetch = window.fetch;
	window.fetch = async (input, init) => {
		if (!String(input).endsWith('/sfu')) return fetch(input, init);
		const body = JSON.parse(String(init?.body));
		const reply =
			body.op === 'join'
				? { participantId, sessionId: `stand-in-${participantId}`, iceServers: [] }
				: body.op === 'publish'
					? await answer(body.sessionDescription)
					: {};
		return Response.json(reply);
	};
	const beacon = navigator.sendBeacon.bind(navigator);
	navigator.sendBeacon = (url, data) => String(url).endsWith('/sfu') || beacon(url, data);
}
