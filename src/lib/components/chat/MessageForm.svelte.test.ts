import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { chat } from '#lib/strings/chat.js';
import MessageForm from './MessageForm.svelte';

const members = [{ id: 'm1', name: 'Bo' }];

function setup() {
	const onsend = vi.fn<(data: FormData) => void>();
	render(MessageForm, {
		action: '?/send',
		members,
		uploadUrl: '/upload',
		submitLabel: 'Send',
		onsend
	});
	return { onsend, box: page.getByRole('textbox', { name: 'Write a message…' }) };
}

/** The doc a send took, as JSON text, to look for nodes in it. */
const sentBody = (onsend: ReturnType<typeof setup>['onsend']) =>
	String(onsend.mock.calls[0][0].get('body'));

describe('MessageForm keys', () => {
	afterEach(() => vi.restoreAllMocks());

	it('sends on Enter and leaves the box empty', async () => {
		const { onsend, box } = setup();
		await box.click();
		await userEvent.keyboard('Bring the maps{Enter}');
		expect(onsend).toHaveBeenCalledOnce();
		expect(sentBody(onsend)).toContain('Bring the maps');
		await expect.element(box).toHaveTextContent('');
	});

	it.each([['Control'], ['Meta']])(
		'sends on %s+Enter without leaving a line break in the message',
		async (modifier) => {
			const { onsend, box } = setup();
			await box.click();
			await userEvent.keyboard(`Bring the maps{${modifier}>}{Enter}{/${modifier}}`);
			expect(onsend).toHaveBeenCalledOnce();
			expect(sentBody(onsend)).not.toContain('hardBreak');
		}
	);

	it('sends nothing on Enter in an empty box', async () => {
		const { onsend, box } = setup();
		await box.click();
		await userEvent.keyboard('{Enter}{Control>}{Enter}{/Control}');
		expect(onsend).not.toHaveBeenCalled();
	});

	it('does not send on an Enter that an input method uses to pick a candidate', async () => {
		const { onsend, box } = setup();
		await box.click();
		await userEvent.keyboard('nihao');
		const editor = box.element();
		editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		for (const init of [{}, { ctrlKey: true }]) {
			editor.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Enter',
					isComposing: true,
					bubbles: true,
					cancelable: true,
					...init
				})
			);
		}
		editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		expect(onsend).not.toHaveBeenCalled();
	});

	it('keeps the send button above the text where they overlap', async () => {
		const { box } = setup();
		await box.click();
		await userEvent.keyboard('Bring the maps');
		// The test page loads no tokens, so the pill has no padding for the button to sit in.
		const send = page.getByRole('button', { name: 'Send' }).element();
		const { x, y, width, height } = send.getBoundingClientRect();
		expect(send.contains(document.elementFromPoint(x + width / 2, y + height / 2))).toBe(true);
	});

	it('leaves Enter as a new line on a touch screen, and the button sends', async () => {
		vi.spyOn(window, 'matchMedia').mockImplementation(
			(query) => ({ matches: query === '(pointer: coarse)' }) as MediaQueryList
		);
		const { onsend, box } = setup();
		await box.click();
		await userEvent.keyboard('Bring{Enter}the maps');
		expect(onsend).not.toHaveBeenCalled();
		expect(box.element().querySelectorAll('p')).toHaveLength(2);
		await page.getByRole('button', { name: 'Send' }).click();
		expect(onsend).toHaveBeenCalledOnce();
	});
});

describe('MessageForm files', () => {
	afterEach(() => vi.unstubAllGlobals());

	const picture = (name: string) => new File(['x'], name, { type: 'image/png' });
	const strip = () => document.querySelectorAll('[data-attachment-strip] li');

	/** Attaching through the file input, with an upload endpoint that accepts anything. */
	async function attach(...names: string[]) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const name = ((init.body as FormData).get('file') as File).name;
				return Response.json({ id: `id-${name}`, name, size: 1, contentType: 'image/png' });
			})
		);
		const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
		await userEvent.upload(input, names.map(picture));
		await expect.poll(() => strip().length).toBe(names.length);
		await expect
			.poll(() => document.querySelectorAll('[data-attachment-strip] img').length)
			.toBe(names.length);
	}

	it('keeps a picture in the strip while you type, and sends it after the text', async () => {
		const { onsend, box } = setup();
		await attach('lake.png');
		await box.click();
		await userEvent.keyboard('Bring the maps');
		await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}!');
		expect(strip()).toHaveLength(1);
		expect(box.element().querySelector('img')).toBeNull();

		await userEvent.keyboard('{Enter}');
		const body = JSON.parse(sentBody(onsend));
		expect(body.content.at(-1)).toEqual({
			type: 'image',
			attrs: { src: '/files/attachments/id-lake.png', alt: 'lake.png' }
		});
		expect(sentBody(onsend)).toContain('Bring the !maps');
		await expect.poll(() => strip().length).toBe(0);
	});

	it('takes out one file at a time, and files alone can be sent', async () => {
		const { onsend } = setup();
		await attach('one.png', 'two.png');
		await page.getByRole('button', { name: chat.thread.removeAttachment }).first().click();
		expect(strip()).toHaveLength(1);
		await page.getByRole('button', { name: 'Send' }).click();
		const sent = sentBody(onsend);
		expect(sent).toContain('id-two.png');
		expect(sent).not.toContain('id-one.png');
	});
});
