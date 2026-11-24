import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { validatePostInput } from '#lib/server/posts/posts.js';
import { publishPost } from '#lib/server/posts/drafts.js';
import { postFromMessage } from '#lib/server/posts/from-message.js';
import { docNoteRefs, type DocNode } from '#lib/editor/doc.js';
import { loadNote } from '#lib/server/notes/access.js';
import { setProjectShare } from '#lib/server/notes/notes.js';
import { publishNoteTimeline, recordNoteEvent } from '#lib/server/notes/timeline.js';
import type { Actions } from './$types';

// The project's own page, under the new-post dialog the root layout opens at this address.
export { load } from '../+page.server';

export const actions: Actions = {
	publish: async (event) => {
		const who = requireMember(event);
		const form = Object.fromEntries(await event.request.formData());
		const result = validatePostInput(form);
		if (!result.ok) return fail(400, { message: result.message });
		const draftId = String(form.draftId ?? '') || null;
		const fromMessageId = String(form.fromMessageId ?? '');
		const env = getEnv();
		// A doc shared as a post, while the body still links it: one in no channel goes into this
		// one first, so the people the post tells can open it. It is the sharer's to share, or
		// this fails before anything posts.
		const sharedNoteId = String(form.sharedNoteId ?? '');
		const stillLinked = docNoteRefs(JSON.parse(result.input.body) as DocNode).includes(
			sharedNoteId
		);
		const note = stillLinked ? await loadNote(env, who, sharedNoteId) : null;
		if (note && !note.projectId) {
			await setProjectShare(env, who, note, { projectId: event.params.id, permission: 'view' });
		}
		const id = fromMessageId
			? await postFromMessage(env, who, event.params.id, fromMessageId, result.input, draftId)
			: await publishPost(env, who, event.params.id, result.input, draftId);
		if (note) {
			const posted = {
				kind: 'posted',
				projectId: event.params.id,
				refType: 'post',
				refId: id
			} as const;
			await recordNoteEvent(env, note.id, who.user.id, posted);
			await publishNoteTimeline(env, note.id);
		}
		redirect(303, `/posts/${id}`);
	}
};
