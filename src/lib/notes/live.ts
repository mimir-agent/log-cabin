// What the browser and a note's RealtimeHub agree on for live editing. Frames are binary:
// a varuint message type, then the y-protocols payload for that type.

/** Sync step 1, step 2 or an update (y-protocols/sync) follows. */
export const messageSync = 0;
/** An awareness update (y-protocols/awareness) follows: who is here and where their cursor is. */
export const messageAwareness = 1;
/** Asks everyone else to send their awareness state again; sent once on (re)connect. */
export const messageQueryAwareness = 3;

/** The XML fragment of the Y.Doc that holds the note's body (TipTap's default). */
export const bodyField = 'default';

/** Close codes. The browser reconnects on any other code. */
export const closeCodes = {
	/** Who may see or edit the note changed: reconnect, and be checked again. */
	accessChanged: 4003,
	/** The note was deleted. */
	deleted: 4004,
	/** A read-only socket sent a change. */
	readOnly: 1008
} as const;

/** Suede scales a cursor can take; the server picks one per person. */
export const cursorHues = ['blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'orange'];

export function cursorHue(userId: string): string {
	let hash = 0;
	for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return cursorHues[hash % cursorHues.length];
}

/** The `user` field of each awareness state. The server overwrites it with what it knows. */
export type LiveUser = { id: string; name: string; hue: string };
