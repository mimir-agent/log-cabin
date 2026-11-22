import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { randomToken, type SignedIn } from '../auth/session';
import { getOrg } from '../org';
import { getObject } from '../storage';
import { docAttachments, type DocNode } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import { attachmentKey } from './attachments';
import type { LoadedPost } from './posts';

/** The post's author or an admin may share it, while the org allows public links. */
export function canSharePublicly(who: SignedIn, post: { authorId: string }) {
	return post.authorId === who.user.id || who.member.role === 'admin';
}

/**
 * Turns the post's public link on with a fresh unguessable token, or off. Turning it off
 * clears the token, so the old link stops working for good.
 */
export async function setPublicLink(env: Env, who: SignedIn, post: LoadedPost, on: boolean) {
	if (!canSharePublicly(who, post)) error(403, strings.errors.notYourPost);
	if (on && !(await getOrg(env)).publicPosts) error(403, strings.errors.publicLinksOff);
	if (on && post.publicToken) return;
	await db(env)
		.update(schema.posts)
		.set({ publicToken: on ? randomToken() : null })
		.where(eq(schema.posts.id, post.id));
}

/**
 * What a signed-out reader of /p/<token> gets: the post's title, body, author name and date,
 * and the org's name. Nothing else about the post's project, comments or people. 404 when the
 * token is unknown or revoked, or the org has turned public links off.
 */
export async function loadPublicPost(env: Env, token: string) {
	const org = await getOrg(env);
	if (!org.publicPosts) error(404, strings.errors.publicLinkDead);
	const { posts, users } = schema;
	const row = await db(env)
		.select({
			title: posts.title,
			body: posts.body,
			bodyText: posts.bodyText,
			createdAt: posts.createdAt,
			authorName: users.name
		})
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(eq(posts.publicToken, token))
		.get();
	if (!row) error(404, strings.errors.publicLinkDead);
	return {
		...row,
		body: withoutResourceIds(withoutMentionIds(JSON.parse(row.body) as DocNode)),
		org: { name: org.name, logoKey: org.logoKey, indexable: org.publicPostsIndexable }
	};
}

/**
 * The body with the id of each note, post or call it mentions dropped, keeping its kind: a
 * signed-out reader sees an unavailable mention and learns nothing of what it points at.
 */
export function withoutResourceIds(node: DocNode): DocNode {
	if (node.type === 'resourceMention') return { ...node, attrs: { kind: node.attrs?.kind } };
	return node.content ? { ...node, content: node.content.map(withoutResourceIds) } : node;
}

/** The body with each mention's user id dropped: a signed-out reader sees only the name. */
export function withoutMentionIds(node: DocNode): DocNode {
	if (node.type === 'mention') return { ...node, attrs: { label: node.attrs?.label } };
	return node.content ? { ...node, content: node.content.map(withoutMentionIds) } : node;
}

/** A file shown in a public post's body, or the org logo; 404 for anything else. */
export async function publicFile(env: Env, token: string, file: 'logo' | { id: string }) {
	const post = await loadPublicPost(env, token);
	const key =
		file === 'logo'
			? post.org.logoKey
			: docAttachments(post.body).includes(file.id)
				? attachmentKey(file.id)
				: null;
	const object = key && (await getObject(env, key));
	if (!object) error(404, strings.errors.fileNotFound);
	return publicFileResponse(object);
}

/** A file on a public page, as a response that no cache keeps past the link's life. */
export function publicFileResponse(object: R2ObjectBody) {
	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'x-content-type-options': 'nosniff',
			'content-security-policy': 'sandbox',
			'cache-control': 'no-store'
		}
	});
}
