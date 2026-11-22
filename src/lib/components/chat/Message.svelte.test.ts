import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { DocNode, ResourceTitles } from '#lib/editor/doc.js';
import '../../../app.css';
import Message from './Message.svelte';

const orgEmoji = {
	custom: { campfire: '/files/emoji/01JD5Z3W8Q9X2M4N6P7R8S9T0V' },
	orgName: 'Camp',
	canAdd: false
};
const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const body = (...content: DocNode[]): DocNode => ({ type: 'doc', content });

function show(
	doc: DocNode,
	reactions: { emoji: string; count: number }[] = [],
	authorId = 'bo',
	resources: ResourceTitles = {}
) {
	return render(Message, {
		message: {
			id: 'm1',
			authorId,
			authorName: 'Bo',
			body: doc,
			createdAt: Date.now(),
			editedAt: null,
			replyTo: null,
			reactions: reactions.map((r) => ({ ...r, names: ['Ada'], mine: false }))
		},
		viewerId: 'ada',
		members: [],
		orgEmoji,
		resources,
		boundary: null,
		uploadUrl: '/chat/t1/attachments',
		onreply: () => {}
	}).container;
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
});

/** WCAG contrast of two CSS colours, as the browser resolved them. */
function contrast(a: string, b: string) {
	const channels = (color: string) => {
		const canvas = new OffscreenCanvas(1, 1).getContext('2d')!;
		canvas.fillStyle = color;
		canvas.fillRect(0, 0, 1, 1);
		return [...canvas.getImageData(0, 0, 1, 1).data.slice(0, 3)];
	};
	const luminance = (color: string) => {
		const [r, g, b] = channels(color).map((c) => {
			const v = c / 255;
			return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

describe('code in your own message', () => {
	it.each(['light', 'dark'])('is readable in the %s theme', (theme) => {
		document.documentElement.dataset.theme = theme;
		const container = show(
			body(
				paragraph(
					{ type: 'text', text: 'Run ' },
					{ type: 'text', text: 'npm test', marks: [{ type: 'code' }] }
				),
				{ type: 'codeBlock', content: [{ type: 'text', text: 'const a = 1;' }] }
			),
			[],
			'ada'
		);
		const code = [...container.querySelectorAll('code')];
		expect(code, 'inline code and a code block').toHaveLength(2);
		for (const element of code) {
			const ratio = contrast(
				getComputedStyle(element).color,
				getComputedStyle(element.closest('pre') ?? element).backgroundColor
			);
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe('a message’s words', () => {
	it('shows a link on a line of its own as a card, and a custom emoji typed in the text as its image', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json({
				preview: {
					kind: 'page',
					url: 'https://camp.example/tents',
					title: 'Tents & tarps',
					description: '',
					image: null,
					domain: 'camp.example'
				}
			})
		);
		const link = 'https://camp.example/tents';
		const root = show(
			body(
				paragraph({ type: 'text', text: 'Packed :campfire:' }),
				paragraph({ type: 'text', text: link, marks: [{ type: 'link', attrs: { href: link } }] })
			)
		);

		expect(root.querySelector('img.emoji')?.getAttribute('src')).toBe(orgEmoji.custom.campfire);
		await expect.poll(() => root.querySelector('a.card')?.textContent).toContain('Tents & tarps');
	});

	it('shows a reaction made with a custom emoji as its image', () => {
		const root = show(body(paragraph({ type: 'text', text: 'Ready' })), [
			{ emoji: ':campfire:', count: 2 }
		]);

		const reaction = root.querySelector('img.emoji[alt=":campfire:"]');
		expect(reaction?.getAttribute('src')).toBe(orgEmoji.custom.campfire);
		expect(reaction?.closest('button')?.textContent).toContain('2');
	});
});

describe('a mention of a post in a message', () => {
	const mention = (id: string): DocNode => ({
		type: 'resourceMention',
		attrs: { kind: 'post', id }
	});

	it('is a chip that links when the reader may open the post, and an unavailable one when not', () => {
		const resources = { 'post:P1': { title: 'Harbour budget', url: '/posts/P1' } };
		const root = show(
			body(paragraph({ type: 'text', text: 'See ' }, mention('P1'), mention('P2'))),
			[],
			'bo',
			resources
		);

		const [seen, unseen] = root.querySelectorAll('.resource-mention');
		expect(seen.getAttribute('href')).toBe('/posts/P1');
		expect(seen.textContent).toBe('Harbour budget');
		expect(unseen.tagName, 'no link to a post the reader may not open').toBe('SPAN');
		expect(unseen.textContent).toBe('Thread unavailable');
	});
});
