import { error } from '@sveltejs/kit';
import { getOrg } from '../org';
import type { LoadedPost } from '../posts/posts';
import type { DocNode } from '../../editor/doc';
import { ai } from '../../strings/ai';
import { posts } from '../../strings/posts';
import { groundedSummary } from './grounded';
import { postUnits, summaryOffer } from './summaries';

/** What the summary instructions leave open: the bullets are the resolution, not a recap. */
const RESOLUTION_FOCUS =
	'These bullets become the written resolution of the thread. Cover only what was decided, what was done and what is still open, and leave out the discussion that led there.';

type Draft = { doc: DocNode } | { status: 400 | 502; message: string };

/**
 * A resolution for the post, written from the post and its comments with the grounded summary:
 * every point rests on sentences of the thread. The caller has loaded the post, so the resolver
 * can read all of it. Nothing is stored; the member edits the draft and saves it themselves.
 */
export async function draftResolution(env: Env, post: LoadedPost): Promise<Draft> {
	const units = await postUnits(env, post);
	const offer = summaryOffer(env, await getOrg(env), units);
	if (offer === 'off') error(404, ai.errors.off);
	if (offer === 'tooShort') return { status: 400, message: posts.resolve.draftTooShort };
	let bullets;
	try {
		({ bullets } = await groundedSummary(env, units, RESOLUTION_FOCUS));
	} catch (e) {
		console.error(`draftResolution: the models failed on post ${post.id}`, e);
		return { status: 502, message: posts.resolve.draftFailed };
	}
	if (bullets.length === 0) return { status: 502, message: posts.resolve.draftEmpty };
	const items = bullets.map((bullet) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: bullet.text }] }]
	}));
	return { doc: { type: 'doc', content: [{ type: 'bulletList', content: items }] } };
}
