import { error, json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { resourceTitles } from '#lib/server/search/resources.js';
import { isResourceKind, resourceKey } from '#lib/editor/doc.js';
import { editor } from '#lib/strings/editor.js';
import type { RequestHandler } from './$types';

/**
 * The title and page of one mentioned note, post or call, for a note's editor showing a mention
 * written since the page loaded; 404 when this person can't see it.
 */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const { kind, id } = event.params;
	if (!isResourceKind(kind)) error(404, editor.resourceMention.notFound);
	const titles = await resourceTitles(getEnv(), who, [{ kind, id }]);
	const found = titles[resourceKey({ kind, id })];
	if (!found) error(404, editor.resourceMention.notFound);
	return json(found);
};
