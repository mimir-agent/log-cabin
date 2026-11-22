import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { getOrg, type Org } from '../org';
import { deleteObject, getObjectUrl, putObject } from '../storage';
import type { SignedIn } from '../auth/session';
import { emojiNamePattern } from '../../editor/inline';
import { posts as strings } from '../../strings/posts';

// SVG is left out on purpose: served from our origin it could run script.
const emojiTypes = ['image/png', 'image/gif', 'image/webp'];
const maxEmojiBytes = 256 * 1024;

const objectKey = (id: string) => `emoji/${id}`;

/** Admins may always add emoji; members too unless the org keeps it to admins. */
export function canAddEmoji(who: SignedIn, org: Pick<Org, 'customEmojiBy'>) {
	const { role } = who.member;
	return role === 'admin' || (role === 'member' && org.customEmojiBy === 'members');
}

/**
 * Stores an image as the org's emoji :name:, or says which field is wrong and why, for the
 * form to show under that field.
 */
export async function addCustomEmoji(
	env: Env,
	who: SignedIn,
	name: string,
	file: File
): Promise<{ ok: true } | { ok: false; field: 'name' | 'file'; message: string }> {
	if (!canAddEmoji(who, await getOrg(env))) error(403, strings.emoji.errors.cannotAdd);
	const { errors } = strings.emoji;
	if (!emojiNamePattern.test(name))
		return { ok: false, field: 'name', message: errors.nameInvalid };
	const { customEmoji } = schema;
	const taken = await db(env)
		.select({ id: customEmoji.id })
		.from(customEmoji)
		.where(eq(customEmoji.name, name))
		.get();
	if (taken) return { ok: false, field: 'name', message: errors.nameTaken(name) };
	const contentType = file.type.split(';')[0].trim().toLowerCase();
	if (!emojiTypes.includes(contentType)) {
		return { ok: false, field: 'file', message: errors.type(file.name) };
	}
	if (file.size > maxEmojiBytes) {
		return { ok: false, field: 'file', message: errors.size(file.name, maxEmojiBytes) };
	}
	const id = newId();
	await putObject(env, objectKey(id), file, contentType);
	await db(env).insert(customEmoji).values({
		id,
		name,
		contentType,
		size: file.size,
		createdBy: who.user.id,
		createdAt: Date.now()
	});
	return { ok: true };
}

/** Whoever added an emoji, or an admin, may remove it. Reactions using it then show :name:. */
export async function removeCustomEmoji(env: Env, who: SignedIn, id: string) {
	const { customEmoji } = schema;
	const row = await db(env).select().from(customEmoji).where(eq(customEmoji.id, id)).get();
	if (!row) error(404, strings.emoji.errors.notFound);
	if (row.createdBy !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.emoji.errors.cannotRemove);
	}
	await db(env).delete(customEmoji).where(eq(customEmoji.id, id));
	await deleteObject(env, objectKey(id));
}

export async function listCustomEmoji(env: Env) {
	const { customEmoji, users } = schema;
	const rows = await db(env)
		.select({
			id: customEmoji.id,
			name: customEmoji.name,
			createdBy: customEmoji.createdBy,
			createdByName: users.name
		})
		.from(customEmoji)
		.innerJoin(users, eq(users.id, customEmoji.createdBy))
		.orderBy(asc(customEmoji.name));
	return rows.map((r) => ({ ...r, url: getObjectUrl(objectKey(r.id)) }));
}

/** name → image URL, for rendering :name: in text and reactions. */
export async function customEmojiUrls(env: Env): Promise<Record<string, string>> {
	return Object.fromEntries((await listCustomEmoji(env)).map((e) => [e.name, e.url]));
}
