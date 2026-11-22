import type { CommentMark, CommentPassage } from './note-room';

// The org has one RealtimeHub for topics; each note being edited live has its own.
export function orgHub(env: Env) {
	return env.REALTIME.get(env.REALTIME.idFromName('org'));
}

export function noteHub(env: Env, noteId: string) {
	return env.REALTIME.get(env.REALTIME.idFromName(`note:${noteId}`));
}

type NotePath = '/note/close' | '/note/delete' | '/note/mark-comment' | '/note/unmark-comment';

async function tellNoteHub(env: Env, noteId: string, path: NotePath, body: object = {}) {
	const response = await noteHub(env, noteId).fetch(`https://realtime${path}`, {
		method: 'POST',
		body: JSON.stringify({ ...body, noteId })
	});
	if (!response.ok) {
		throw new Error(`${path} for note ${noteId} failed: hub answered ${response.status}`);
	}
	return response;
}

/** Who may see or edit the note changed: its live sockets reconnect and are checked again. */
export async function closeLiveNote(env: Env, noteId: string): Promise<void> {
	await tellNoteHub(env, noteId, '/note/close');
}

/** The note was deleted: close its live sockets and drop its document from the hub and R2. */
export async function deleteLiveNote(env: Env, noteId: string): Promise<void> {
	await tellNoteHub(env, noteId, '/note/delete');
}

/**
 * Marks a new comment's passage in the note's live document; false when the passage is
 * already gone, and the comment stays unanchored.
 */
export async function markLiveComment(env: Env, passage: CommentPassage): Promise<boolean> {
	const response = await tellNoteHub(env, passage.noteId, '/note/mark-comment', passage);
	return (await response.json<{ marked: boolean }>()).marked;
}

/** Takes a deleted comment's mark out of the note's live document, wherever it is. */
export async function unmarkLiveComment(env: Env, mark: CommentMark): Promise<void> {
	await tellNoteHub(env, mark.noteId, '/note/unmark-comment', mark);
}

export async function publish(env: Env, topic: string, payload: unknown): Promise<void> {
	const response = await orgHub(env).fetch('https://realtime/publish', {
		method: 'POST',
		body: JSON.stringify({ topic, payload })
	});
	if (!response.ok) {
		throw new Error(`publish to "${topic}" failed: hub answered ${response.status}`);
	}
}

/** The users with a socket subscribed to this topic right now. */
export async function presentUserIds(env: Env, topic: string): Promise<string[]> {
	const response = await orgHub(env).fetch(
		`https://realtime/presence?topic=${encodeURIComponent(topic)}`
	);
	if (!response.ok) {
		throw new Error(`presence for "${topic}" failed: hub answered ${response.status}`);
	}
	return response.json();
}

/** Stops this user's open pages hearing a topic, e.g. a thread they were removed from. */
export async function unsubscribeUser(env: Env, userId: string, topic: string): Promise<void> {
	const response = await orgHub(env).fetch('https://realtime/unsubscribe', {
		method: 'POST',
		body: JSON.stringify({ userId, topic })
	});
	if (!response.ok) {
		throw new Error(
			`unsubscribing user ${userId} from "${topic}" failed: hub answered ${response.status}`
		);
	}
}

/** Closes every socket this user has open, e.g. when they're deactivated. */
export async function disconnectUser(env: Env, userId: string): Promise<void> {
	const response = await orgHub(env).fetch('https://realtime/disconnect', {
		method: 'POST',
		body: JSON.stringify({ userId })
	});
	if (!response.ok) {
		throw new Error(`disconnecting user ${userId} failed: hub answered ${response.status}`);
	}
}
