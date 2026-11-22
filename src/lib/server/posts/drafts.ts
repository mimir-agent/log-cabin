import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { DocError, sanitizeDoc } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import { loadProject, loadWritableProject } from './access';
import { createPost, type PostInput } from './posts';

// Server-side drafts: a post being written, seen only by its author,
// saved by the composer after each pause in typing. Publishing creates the post and deletes
// the draft, so nothing that reads posts ever sees a draft.

/** What the composer autosaves. Anything may still be empty; publishing checks the rest. */
export type DraftInput = { title: string; body: string; poll: string | null };

/** Reads the composer's JSON, 400ing on a body or poll the composer would never send. */
export function parseDraft(raw: unknown): DraftInput {
	const input = raw as Partial<Record<keyof DraftInput, unknown>>;
	try {
		const body = JSON.stringify(sanitizeDoc(String(input?.body)));
		const poll = input?.poll == null ? null : JSON.stringify(JSON.parse(String(input.poll)));
		return { title: String(input?.title ?? '').slice(0, 200), body, poll };
	} catch (e) {
		if (e instanceof DocError || e instanceof SyntaxError) {
			error(400, strings.errors.draftInvalid(e.message));
		}
		throw e;
	}
}

export async function createDraft(
	env: Env,
	who: SignedIn,
	projectId: string,
	input: DraftInput,
	now = Date.now()
) {
	await loadWritableProject(env, who, projectId);
	const id = newId(now);
	await db(env)
		.insert(schema.postDrafts)
		.values({ id, authorId: who.user.id, projectId, ...input, createdAt: now, updatedAt: now });
	return { id, updatedAt: now };
}

/** The author's own draft and its project; anyone else gets a 404, as if it didn't exist. */
export async function loadDraft(env: Env, who: SignedIn, draftId: string) {
	const { postDrafts } = schema;
	const draft = await db(env)
		.select()
		.from(postDrafts)
		.where(and(eq(postDrafts.id, draftId), eq(postDrafts.authorId, who.user.id)))
		.get();
	if (!draft) error(404, strings.errors.draftNotFound);
	return { ...draft, project: await loadProject(env, who, draft.projectId) };
}

/** Saves the draft; a projectId moves it to the project picked in the composer. */
export async function updateDraft(
	env: Env,
	who: SignedIn,
	draftId: string,
	input: DraftInput,
	projectId?: string
) {
	const draft = await loadDraft(env, who, draftId);
	if (projectId && projectId !== draft.projectId) await loadWritableProject(env, who, projectId);
	const updatedAt = Date.now();
	await db(env)
		.update(schema.postDrafts)
		.set({ ...input, projectId: projectId || draft.projectId, updatedAt })
		.where(eq(schema.postDrafts.id, draftId));
	return { updatedAt };
}

export async function deleteDraft(env: Env, who: SignedIn, draftId: string) {
	await loadDraft(env, who, draftId);
	await db(env).delete(schema.postDrafts).where(eq(schema.postDrafts.id, draftId));
}

/** This person's drafts, last saved first. */
export async function listDrafts(env: Env, who: SignedIn) {
	const { postDrafts, projects } = schema;
	return db(env)
		.select({
			id: postDrafts.id,
			title: postDrafts.title,
			updatedAt: postDrafts.updatedAt,
			projectName: projects.name
		})
		.from(postDrafts)
		.innerJoin(projects, eq(projects.id, postDrafts.projectId))
		.where(eq(postDrafts.authorId, who.user.id))
		.orderBy(desc(postDrafts.updatedAt));
}

/** Creates the post, then deletes the draft it was written in, if the composer had saved one. */
export async function publishPost(
	env: Env,
	who: SignedIn,
	projectId: string,
	input: PostInput & { fromMessageId?: string },
	draftId: string | null
) {
	if (draftId) await loadDraft(env, who, draftId);
	const postId = await createPost(env, who, projectId, input);
	if (draftId) await db(env).delete(schema.postDrafts).where(eq(schema.postDrafts.id, draftId));
	return postId;
}
