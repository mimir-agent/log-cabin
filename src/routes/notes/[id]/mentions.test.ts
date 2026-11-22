import { describe, expect, it, vi } from 'vitest';
import { loadNote } from '#lib/server/notes/access.js';
import { createNoteComment } from '#lib/server/notes/discussion.js';
import { createNote, shareWithPeople, validateNoteInput } from '#lib/server/notes/notes.js';
import { parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { addProjectMember } from '#lib/server/posts/projects.js';
import { loadProject } from '#lib/server/posts/access.js';
import { resourceTitles } from '#lib/server/search/resources.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from './+page.server';

vi.mock('#lib/server/search/resources.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/search/resources.js')>();
	return { ...actual, resourceTitles: vi.fn(actual.resourceTitles) };
});

const mentioning = (id: string) =>
	JSON.stringify({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'resourceMention', attrs: { kind: 'post', id } }]
			}
		]
	});

describe('a note page with mentions of private posts', () => {
	it('resolves the body’s and the comments’ in one lookup, for a member of the project and not for a guest outside it', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const bo = await w.person('Bo', 'member');
		const gus = await w.person('Gus', 'guest');
		const payroll = await w.project(ada, 'Payroll', true);
		await addProjectMember(w.env, ada, await loadProject(w.env, ada, payroll), bo.user.id);
		const salaries = await w.post(ada, payroll, 'Salaries');
		const bonuses = await w.post(ada, payroll, 'Bonuses');
		const raises = await w.post(ada, payroll, 'Raises');

		const input = validateNoteInput({ title: 'Plan', body: mentioning(salaries) });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const noteId = await createNote(w.env, ada, input.input);
		const note = await loadNote(w.env, ada, noteId);
		await shareWithPeople(w.env, ada, note, [bo.user.id, gus.user.id], 'view');
		const comment = await createNoteComment(
			w.env,
			ada,
			note,
			parseBody(mentioning(bonuses)) as BodyInput,
			null
		);
		await createNoteComment(w.env, ada, note, parseBody(mentioning(raises)) as BodyInput, comment);

		const resourcesFor = async (who: typeof ada) => {
			vi.mocked(resourceTitles).mockClear();
			const event = routeEvent(who, `/notes/${noteId}`, { id: noteId });
			const data = (await load(event as never)) as {
				resources: Record<string, { title: string; url: string }>;
			};
			expect(resourceTitles, 'one lookup for the body and every comment').toHaveBeenCalledTimes(1);
			return data.resources;
		};

		expect(await resourcesFor(bo), 'Bo is in Payroll: the body, the comment and its reply').toEqual(
			{
				[`post:${salaries}`]: { title: 'Salaries', url: `/posts/${salaries}` },
				[`post:${bonuses}`]: { title: 'Bonuses', url: `/posts/${bonuses}` },
				[`post:${raises}`]: { title: 'Raises', url: `/posts/${raises}` }
			}
		);
		const forGus = await resourcesFor(gus);
		expect(forGus, 'Gus is a guest outside Payroll').toEqual({});
		expect(JSON.stringify(forGus)).not.toMatch(/Salaries|Bonuses|Raises/);
	});
});
