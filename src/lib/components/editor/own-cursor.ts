import type { Awareness } from 'y-protocols/awareness';

type State = Parameters<Awareness['setLocalState']>[0];

/**
 * An awareness whose setLocalState sends at most once in `ms`, the last state given. A cursor
 * that moves with every key would otherwise go out to everyone with every key. It reads back the
 * state it is holding, which is what the cursor plugin compares to know a cursor is its own, and
 * a cleared cursor goes out at once, so a blur is never followed by a cursor put back.
 */
export function atMostEvery(ms: number, awareness: Awareness): Awareness {
	let held: State | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const send = () => {
		clearTimeout(timer);
		timer = undefined;
		awareness.setLocalState(held!);
		held = undefined;
	};
	return Object.assign(Object.create(awareness) as Awareness, {
		getLocalState() {
			return held ?? awareness.getLocalState();
		},
		setLocalState(state: State) {
			held = state;
			if (!state?.cursor) return send();
			timer ??= setTimeout(send, ms);
		}
	});
}
