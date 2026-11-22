import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { feed } from '#lib/server/posts/posts.js';
import { resolveTagName } from '#lib/server/posts/tags.js';
import { textTags } from '#lib/editor/inline.js';
import { posts as strings } from '#lib/strings/posts.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const tag = event.params.tag.toLowerCase();
	if (textTags(`#${tag}`)[0] !== tag) error(404, strings.errors.tagInvalid);
	// A renamed tag's old address goes to its new one.
	const current = await resolveTagName(getEnv(), tag);
	if (current && current !== tag) redirect(301, resolve('/tags/[tag]', { tag: current }));
	const page = await feed(getEnv(), who, { tag, cursor: event.url.searchParams.get('cursor') });
	return { tag, ...page };
};
