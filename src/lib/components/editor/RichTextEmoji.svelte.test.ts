import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RichText from './RichText.svelte';

const customEmoji = { campfire: '/files/emoji/01JD5Z3W8Q9X2M4N6P7R8S9T0V' };

describe('RichText with the org’s custom emoji', () => {
	it('shows a known :name: as its image and leaves unknown names and code as typed', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Ready :campfire: and :nope: ' },
						{ type: 'text', text: ':campfire:', marks: [{ type: 'code' }] }
					]
				}
			]
		};
		const root = render(RichText, { doc, customEmoji }).container;
		const images = root.querySelectorAll('img.emoji');
		expect(images).toHaveLength(1);
		expect(images[0].getAttribute('src')).toBe('/files/emoji/01JD5Z3W8Q9X2M4N6P7R8S9T0V');
		expect(images[0].getAttribute('alt')).toBe(':campfire:');
		expect(root.textContent).toContain(':nope:');
		expect(root.querySelector('code')!.textContent).toBe(':campfire:');
	});
});
