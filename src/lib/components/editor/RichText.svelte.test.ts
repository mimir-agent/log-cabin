import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { DocMark, DocNode } from '#lib/editor/doc.js';
import RichText from './RichText.svelte';

vi.mock('$app/state', () => ({ page: { data: { timeZone: 'Asia/Tokyo' } } }));

const imageId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
const fileId = '01JD5Z3W8Q9X2M4N6P7R8S9T0W';

function rendered(...content: DocNode[]) {
	return render(RichText, { doc: { type: 'doc', content }, customEmoji: {} }).container;
}

const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const textNode = (text: string, ...marks: DocMark[]): DocNode => ({ type: 'text', text, marks });
const photo = (n: number): DocNode => ({
	type: 'image',
	attrs: { src: `/files/attachments/${imageId.slice(0, -1)}${n}`, alt: `photo ${n}` }
});

describe('RichText', () => {
	it('renders headings at their level, clamped to h1–h3', () => {
		const root = rendered(
			{ type: 'heading', attrs: { level: 2 }, content: [textNode('Plan')] },
			{ type: 'heading', attrs: { level: 6 }, content: [textNode('Deep')] }
		);

		expect(root.querySelector('h2')!.textContent).toBe('Plan');
		expect(root.querySelector('h3')!.textContent).toBe('Deep');
	});

	it('renders lists as ul and ol with their start', () => {
		const item = (text: string): DocNode => ({
			type: 'listItem',
			content: [paragraph(textNode(text))]
		});
		const root = rendered(
			{ type: 'bulletList', content: [item('one'), item('two')] },
			{ type: 'orderedList', attrs: { start: 3 }, content: [item('three')] }
		);

		expect(root.querySelectorAll('ul > li')).toHaveLength(2);
		expect(root.querySelector('ol')!.getAttribute('start')).toBe('3');
		expect(root.querySelector('ol > li')!.textContent).toBe('three');
	});

	it('nests marks as inline elements without adding spaces', () => {
		const root = rendered(
			paragraph(
				textNode('plain'),
				textNode('strong', { type: 'bold' }),
				textNode('both', { type: 'italic' }, { type: 'code' })
			)
		);

		expect(root.querySelector('p')!.textContent).toBe('plainstrongboth');
		expect(root.querySelector('strong')!.textContent).toBe('strong');
		expect(root.querySelector('em > code')!.textContent).toBe('both');
	});

	it('opens links in a new tab with rel noopener', () => {
		const root = rendered(
			paragraph(textNode('docs', { type: 'link', attrs: { href: 'https://example.com' } }))
		);
		const link = root.querySelector('a')!;

		expect(link.getAttribute('href')).toBe('https://example.com');
		expect(link.getAttribute('rel')).toContain('noopener');
		expect(link.getAttribute('target')).toBe('_blank');
	});

	it('shows a mention as @label', () => {
		const root = rendered(
			paragraph({ type: 'mention', attrs: { id: 'user-1', label: 'Ada Lovelace' } })
		);

		expect(root.querySelector('.mention')!.textContent).toBe('@Ada Lovelace');
	});

	it('renders an image from its attachment path', () => {
		const root = rendered({
			type: 'image',
			attrs: { src: `/files/attachments/${imageId}`, alt: 'diagram.png' }
		});
		const image = root.querySelector('img')!;

		expect(image.getAttribute('src')).toBe(`/files/attachments/${imageId}`);
		expect(image.getAttribute('alt')).toBe('diagram.png');
		expect(image.getAttribute('loading')).toBe('lazy');
	});

	it('renders an attachment as a download link with its name and size', () => {
		const root = rendered({
			type: 'attachment',
			attrs: { id: fileId, name: 'notes.pdf', size: 2_500_000, contentType: 'application/pdf' }
		});
		const link = root.querySelector('a')!;

		expect(link.getAttribute('href')).toBe(`/files/attachments/${fileId}`);
		expect(link.hasAttribute('download')).toBe(true);
		expect(link.textContent).toContain('notes.pdf');
		expect(link.textContent).toContain('2.4 MB');
	});

	it('renders a collapsible section closed, as a native details with its title as summary', () => {
		const root = rendered({
			type: 'details',
			content: [
				{ type: 'detailsSummary', content: [textNode('Packing')] },
				{ type: 'detailsContent', content: [paragraph(textNode('Tent'))] }
			]
		});
		const details = root.querySelector('details')!;

		expect(details.open, 'closed until the reader opens it').toBe(false);
		expect(details.querySelector(':scope > summary')!.textContent).toBe('Packing');
		expect(details.querySelector(':scope > div > p')!.textContent).toBe('Tent');
	});

	it('highlights a code block in its language, keeping its text exactly', async () => {
		const source = 'function go() {\n  return "camp"; // soon\n}';
		const root = rendered({
			type: 'codeBlock',
			attrs: { language: 'js' },
			content: [textNode(source)]
		});
		const code = root.querySelector('pre > code')!;

		await expect.poll(() => code.querySelector('.hljs-keyword')?.textContent).toBe('function');
		expect(code.querySelector('.hljs-string')!.textContent).toBe('"camp"');
		expect(code.querySelector('.hljs-comment')!.textContent).toBe('// soon');
		expect(code.classList.contains('language-js'), 'marked with its language').toBe(true);
		expect(code.textContent, 'the same characters as written').toBe(source);
	});

	it('shows a keyboard key as kbd, its text as written', () => {
		const root = render(RichText, {
			doc: { type: 'doc', content: [paragraph(textNode(':tent: #k', { type: 'kbd' }))] },
			customEmoji: { tent: '/files/emoji/tent.png' },
			tags: true
		}).container;
		const key = root.querySelector('p > kbd')!;

		expect(key.textContent).toBe(':tent: #k');
		expect(key.querySelector('img, a'), 'no emoji or tag link in a key').toBeNull();
	});

	it('highlights the words a comment was made on, naming the comment', () => {
		const commentId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		const root = rendered(
			paragraph(
				textNode('Walk '),
				textNode('the ridge', { type: 'noteComment', attrs: { commentId } }, { type: 'bold' })
			)
		);
		const passage = root.querySelector(`p > .note-comment[data-comment-id="${commentId}"]`)!;

		expect(passage.textContent).toBe('the ridge');
		expect(passage.querySelector('strong')?.textContent, 'its other marks inside').toBe(
			'the ridge'
		);
	});

	it('throws naming a node type it does not know', () => {
		expect(() => rendered({ type: 'table' })).toThrow('"table"');
	});

	it('shows four images in a row as one gallery, empty lines between them and all', async () => {
		const root = rendered(
			paragraph(textNode('Camp')),
			photo(1),
			{ type: 'paragraph' },
			photo(2),
			photo(3),
			{ type: 'paragraph' },
			photo(4),
			{ type: 'paragraph' }
		);
		const gallery = root.querySelector('[role="group"]')!;
		expect(gallery.getAttribute('aria-label')).toBe('4 images');
		expect(gallery.querySelectorAll('img')).toHaveLength(4);
	});

	it('steps through every image in the lightbox with the arrow keys and closes on Escape', async () => {
		render(RichText, { doc: { type: 'doc', content: [1, 2, 3, 4].map(photo) }, customEmoji: {} });
		const dialog = page.getByRole('dialog');
		const shown = () => dialog.getByRole('img').element().getAttribute('alt');

		await page.getByRole('button', { name: 'Open photo 2' }).click();
		await expect.element(dialog.getByText('2 of 4')).toBeVisible();
		expect(shown()).toBe('photo 2');

		await userEvent.keyboard('{ArrowRight}');
		await expect.element(dialog.getByText('3 of 4')).toBeVisible();
		expect(shown()).toBe('photo 3');
		await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
		await expect.element(dialog.getByText('4 of 4')).toBeVisible();
		expect(shown()).toBe('photo 4');

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('shows a date and time relative to now, with the full date in the reader’s zone as its title', () => {
		const inThreeDays = Date.now() + 3 * 86_400_000;
		const twoHoursAgo = Date.now() - 2 * 3_600_000;
		const at = (timestamp: number): DocNode => ({ type: 'relativeTime', attrs: { timestamp } });
		const root = rendered(paragraph(at(inThreeDays), textNode(' '), at(twoHoursAgo)));
		const [ahead, behind] = root.querySelectorAll('time');
		expect(ahead.textContent).toBe('in 3 days');
		expect(behind.textContent).toBe('2 hours ago');
		expect(ahead.getAttribute('datetime')).toBe(new Date(inThreeDays).toISOString());
		expect(ahead.title, 'the date in Asia/Tokyo, as the page data says').toBe(
			new Date(inThreeDays).toLocaleString('en', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZone: 'Asia/Tokyo',
				timeZoneName: 'short'
			})
		);
		expect(ahead.title).toContain('GMT+9');
	});

	it('links a mentioned post the reader may see, by its title and type, and shows any other as unavailable', () => {
		const mention = (kind: string, id: string): DocNode => ({
			type: 'resourceMention',
			attrs: { kind, id }
		});
		const { container } = render(RichText, {
			doc: {
				type: 'doc',
				content: [paragraph(mention('post', imageId), textNode(' and '), mention('note', fileId))]
			},
			customEmoji: {},
			resources: { [`post:${imageId}`]: { title: 'Harbour budget', url: `/posts/${imageId}` } }
		});
		const [seen, unseen] = container.querySelectorAll('.resource-mention');
		expect(seen.tagName).toBe('A');
		expect(seen.textContent).toBe('Harbour budget');
		expect(seen.getAttribute('href')).toBe(`/posts/${imageId}`);
		expect(seen.getAttribute('aria-label')).toBe('Thread: Harbour budget');
		expect(seen.querySelectorAll('svg'), 'the type’s icon').toHaveLength(1);
		expect(unseen.tagName, 'no link').toBe('SPAN');
		expect(unseen.textContent).toBe('Doc unavailable');
		expect(unseen.querySelectorAll('svg'), 'the warning icon').toHaveLength(1);
		expect(container.innerHTML, 'nothing else about the note it can’t see').not.toContain(fileId);
	});
});
