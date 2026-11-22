import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadPost } from '#lib/server/posts/posts.js';
import { listVersions } from '#lib/server/posts/versions.js';
import type { PageServerLoad } from './$types';

/** Every version of the post; whoever can see the post can see them all. */
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const post = await loadPost(env, requireMember(event), event.params.id);
	return {
		post: { id: post.id, title: post.title },
		versions: await listVersions(env, post.id)
	};
};
