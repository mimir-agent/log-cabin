import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

afterEach(() => vi.unstubAllGlobals());

const mention = (id: string) => ({ type: 'resourceMention', attrs: { kind: 'post', id } });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });

describe('the note page', () => {
	it('shows a mention in the body and in a comment as a chip, linked only where the reader may open the post', () => {
		// The live connection never opens, so the page shows the stored body.
		vi.stubGlobal(
			'WebSocket',
			class {
				static OPEN = 1;
				close() {}
			}
		);
		const data = {
			note: {
				id: 'N1',
				title: 'Plan',
				body: { type: 'doc', content: [paragraph(text('Budget: '), mention('P1'))] },
				access: 'view',
				projectId: null,
				projectPermission: 'none'
			},
			resources: { 'post:P1': { title: 'Harbour budget', url: '/posts/P1' } },
			project: null,
			live: { canWrite: false, user: { id: 'bo', name: 'Bo', hue: 200 } },
			comments: [
				{
					id: 'C1',
					parentId: null,
					authorId: 'ada',
					authorName: 'Ada',
					body: JSON.stringify({
						type: 'doc',
						content: [paragraph(text('Also '), mention('P1'), text(' and '), mention('P2'))]
					}),
					createdAt: 0,
					editedAt: null,
					resolvedAt: null,
					resolvedByName: null,
					attachmentId: null,
					x: null,
					y: null,
					replies: []
				}
			],
			timeline: [],
			reactions: {},
			people: [],
			viewerId: 'bo',
			isAuthor: false,
			isAdmin: false,
			canDelete: false,
			canDiscuss: false,
			sharing: null,
			pin: null,
			summaries: 'off',
			followUps: {},
			viewers: { people: [], anonymous: 0 },
			publicUrl: null,
			publicLinks: false,
			favorite: false,
			orgEmoji: { custom: {}, orgName: 'Camp', canAdd: false }
		};
		const { container } = render(Page, { data } as never);

		const [inBody] = container.querySelectorAll('.body .resource-mention');
		expect(inBody.getAttribute('href')).toBe('/posts/P1');
		expect(inBody.textContent).toBe('Harbour budget');
		const [resolved, unavailable] = container.querySelectorAll('#comments .resource-mention');
		expect(resolved.getAttribute('href')).toBe('/posts/P1');
		expect(resolved.textContent).toBe('Harbour budget');
		expect(unavailable.tagName, 'Bo may not open P2: no link').toBe('SPAN');
		expect(unavailable.textContent).toBe('Thread unavailable');
	});
});
