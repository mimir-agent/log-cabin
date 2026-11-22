import { asc, eq, ne, and, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { textTags } from '../../editor/inline';
import { posts as strings } from '../../strings/posts';
import { visibleProjectIds } from './access';

const { tags, tagAliases, postTags } = schema;

type TagResult = { ok: true } | { ok: false; message: string };

/** A tag name as typed, with or without the #, lowercased; null when it can't be a tag. */
function tagName(raw: string): string | null {
	const name = raw.trim().replace(/^#/, '').toLowerCase();
	return textTags(`#${name}`)[0] === name ? name : null;
}

/** The tag a name belongs to: one with that name, or one that used to have it. */
async function findTag(env: Env, name: string) {
	const [current] = await db(env)
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.name, name));
	if (current) return current;
	const [renamed] = await db(env)
		.select({ id: tags.id, name: tags.name })
		.from(tagAliases)
		.innerJoin(tags, eq(tags.id, tagAliases.tagId))
		.where(eq(tagAliases.name, name));
	return renamed ?? null;
}

/** The current name of the tag this name finds, or null when there is none. */
export async function resolveTagName(env: Env, name: string) {
	return (await findTag(env, name))?.name ?? null;
}

/** Every tag, by name, with how many of the posts this person can see carry it. */
export async function listTags(env: Env, who: SignedIn) {
	return db(env)
		.select({
			id: tags.id,
			name: tags.name,
			// Written out in full: drizzle drops the table names from columns in a subquery of a
			// one-table select, and every table here has an id.
			postCount: sql<number>`(
				SELECT count(*) FROM post_tags
				JOIN posts ON posts.id = post_tags.post_id
				JOIN projects ON projects.id = posts.project_id
				WHERE post_tags.tag_id = tags.id
					AND projects.archived_at IS NULL
					AND ${visibleProjectIds(who)}
					AND NOT EXISTS (SELECT 1 FROM posts AS newer WHERE newer.parent_id = posts.id)
			)`
		})
		.from(tags)
		.orderBy(asc(tags.name));
}

async function insertTag(env: Env, name: string) {
	const tag = { id: newId(), name, createdAt: Date.now() };
	// The name now belongs to a tag of its own, so it stops pointing at a renamed one.
	await db(env).batch([
		db(env).delete(tagAliases).where(eq(tagAliases.name, name)),
		db(env).insert(tags).values(tag)
	]);
	return tag;
}

export async function createTag(env: Env, raw: string) {
	const name = tagName(raw);
	if (!name) return { ok: false as const, message: strings.errors.tagInvalid };
	if ((await db(env).select().from(tags).where(eq(tags.name, name))).length > 0) {
		return { ok: false as const, message: strings.tags.errors.taken };
	}
	return { ok: true as const, tag: await insertTag(env, name) };
}

export async function renameTag(env: Env, from: string, raw: string): Promise<TagResult> {
	const name = tagName(raw);
	if (!name) return { ok: false, message: strings.errors.tagInvalid };
	const tag = await findTag(env, from);
	if (!tag) return { ok: false, message: strings.tags.errors.notFound };
	const taken = await db(env)
		.select({ id: tags.id })
		.from(tags)
		.where(and(eq(tags.name, name), ne(tags.id, tag.id)));
	if (taken.length > 0) return { ok: false, message: strings.tags.errors.taken };
	if (tag.name === name) return { ok: true };
	await db(env).batch([
		db(env).delete(tagAliases).where(eq(tagAliases.name, name)),
		db(env).update(tags).set({ name }).where(eq(tags.id, tag.id)),
		db(env).update(postTags).set({ tag: name }).where(eq(postTags.tagId, tag.id)),
		db(env).insert(tagAliases).values({ name: tag.name, tagId: tag.id })
	]);
	return { ok: true };
}

/** Removes the tag from the posts that carry it; the posts stay. */
export async function deleteTag(env: Env, name: string): Promise<TagResult> {
	const tag = await findTag(env, name);
	if (!tag) return { ok: false, message: strings.tags.errors.notFound };
	await db(env).batch([
		db(env).delete(postTags).where(eq(postTags.tagId, tag.id)),
		db(env).delete(tagAliases).where(eq(tagAliases.tagId, tag.id)),
		db(env).delete(tags).where(eq(tags.id, tag.id))
	]);
	return { ok: true };
}

/** Makes the post's tags the #tags in its body, making a tag of any name not yet used. */
export async function saveTags(env: Env, postId: string, bodyText: string) {
	await db(env).delete(postTags).where(eq(postTags.postId, postId));
	const found = new Map<string, string>();
	for (const written of textTags(bodyText)) {
		const tag = (await findTag(env, written)) ?? (await insertTag(env, written));
		found.set(tag.id, tag.name);
	}
	if (found.size > 0) {
		await db(env)
			.insert(postTags)
			.values([...found].map(([tagId, tag]) => ({ postId, tag, tagId })));
	}
}
