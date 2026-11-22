import { readSession, sessionCookie } from '../auth/session';
import { touchLastSeen } from '../people/seen';
import { liveNoteAccess } from '../notes/access';
import { noteSocketHeader, userIdHeader } from './hub';
import type { NoteSocketInit } from './note-room';
import { noteHub, orgHub } from './publish';

const notePath = /^\/realtime\/note\/([^/]+)$/;

/** The Worker's socket routes: /realtime for topics, /realtime/note/<id> for live editing. */
export function isRealtimePath(pathname: string): boolean {
	return pathname === '/realtime' || notePath.test(pathname);
}

function cookieValue(request: Request, name: string): string | undefined {
	const pair = request.headers
		.get('cookie')
		?.split(/;\s*/)
		.find((c) => c.startsWith(`${name}=`));
	return pair?.slice(name.length + 1);
}

/**
 * GET /realtime and /realtime/note/<id>: opens the browser's socket to the org's hub, or to
 * the note's. The Worker checks the session cookie and the Origin here, and for a note
 * whether this person may see it, so a hub only ever sees signed-in members with access.
 * A note that doesn't exist answers the same 403 as one that isn't shared.
 */
export async function connectRealtime(request: Request, env: Env): Promise<Response> {
	const { pathname, origin } = new URL(request.url);
	if (request.headers.get('upgrade') !== 'websocket') {
		return new Response(`${pathname} expects a WebSocket upgrade`, { status: 426 });
	}
	if (request.headers.get('origin') !== origin) {
		return new Response(`${pathname} accepts sockets from this site only`, { status: 403 });
	}
	const token = cookieValue(request, sessionCookie);
	const session = token ? await readSession(env, token) : null;
	if (!session) return new Response(`${pathname} needs a signed-in session`, { status: 401 });
	await touchLastSeen(env, session.user.id, Date.now(), session.lastSeenAt);
	// Only what the hub reads, set here: a client's own copy of a hub header never reaches it.
	const headers = new Headers({ upgrade: 'websocket', [userIdHeader]: session.user.id });
	const noteId = notePath.exec(pathname)?.[1];
	if (noteId === undefined) return orgHub(env).fetch(new Request(request, { headers }));

	const access = await liveNoteAccess(env, session.user.id, noteId);
	if (access === 'none') {
		return new Response(`${pathname}: this note isn't shared with you`, { status: 403 });
	}
	const init: NoteSocketInit = { noteId, canWrite: access === 'edit', name: session.user.name };
	headers.set(noteSocketHeader, JSON.stringify(init));
	return noteHub(env, noteId).fetch(new Request(request, { headers }));
}
